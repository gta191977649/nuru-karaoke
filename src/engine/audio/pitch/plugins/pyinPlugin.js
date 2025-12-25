import { hzToMidi, rms } from '../utils/dspUtils.js'

const DEFAULTS = {
  rmsGate: 0.01,
  pyinMu: 0.1,
  pyinPs: 0.99,
  pyinSpacing: Math.pow(2, 1 / 120),
  pyinDf: 30,
  pyinThreshold: 0.1,
  pyinProbabilityThreshold: 0.1,
  pyinMaxCandidates: 8,
  fminHz: 50,
  fmaxHz: 2000,
}

class PyinPlugin {
  constructor() {
    this.id = 'pyin'
    this.name = 'pYIN (causal)'

    this._config = { ...DEFAULTS }
    this._sampleRate = 0

    this._K = 0
    this._fStates = null
    this._transLog = null
    this._logPs = Math.log(this._config.pyinPs)
    this._log1Ps = Math.log(1 - this._config.pyinPs)
    this._stateKey = ''
    this._LLast = null
  }

  configure(cfg) {
    this._config = { ...this._config, ...cfg }
    const ps = Math.max(0.001, Math.min(0.999, Number(this._config.pyinPs)))
    this._config.pyinPs = ps
    this._logPs = Math.log(ps)
    this._log1Ps = Math.log(1 - ps)
  }

  reset() {
    this._sampleRate = 0
    this._stateKey = ''
    this._K = 0
    this._fStates = null
    this._transLog = null
    this._LLast = null
  }

  _ensureState() {
    const cfg = this._config
    const spacing = Number(cfg.pyinSpacing) || DEFAULTS.pyinSpacing
    const fmin = Math.max(1, Number(cfg.fminHz) || DEFAULTS.fminHz)
    const fmax = Math.max(fmin + 1, Number(cfg.fmaxHz) || DEFAULTS.fmaxHz)
    const df = Math.max(1, Math.floor(Number(cfg.pyinDf) || DEFAULTS.pyinDf))
    const key = `${spacing}|${fmin}|${fmax}|${df}`
    if (this._stateKey === key) return

    const K = Math.max(2, Math.round(Math.log(fmax / fmin) / Math.log(spacing)) + 1)
    const fStates = new Float32Array(K)
    for (let i = 0; i < K; i += 1) {
      fStates[i] = fmin * Math.pow(spacing, i)
    }

    const transLog = new Float64Array(df)
    for (let d = 0; d < df; d += 1) {
      const value = 1 / df - d / (df * df)
      transLog[d] = Math.log(Math.max(1e-12, value))
    }

    this._stateKey = key
    this._K = K
    this._fStates = fStates
    this._transLog = transLog
    this._LLast = new Float64Array(2 * K)
  }

  detect(frame) {
    const samples = frame?.samples
    const sampleRate = Number(frame?.sampleRate)
    if (!samples || !Number.isFinite(sampleRate)) return null

    this._ensureState()
    this._sampleRate = sampleRate

    const frameRms = rms(samples)
    if (frameRms < this._config.rmsGate) {
      return { f0Hz: null, midi: null, confidence: 0, rms: frameRms }
    }

    const candidates = this._getYinCandidates(samples)
    const voicedResult = this._updateCausalStates(candidates)
    const f0Hz = voicedResult?.f0Hz ?? null
    const midi = Number.isFinite(f0Hz) ? hzToMidi(f0Hz) : null
    const confidence = Number.isFinite(f0Hz) ? Math.min(1, frameRms * 6) : 0

    return {
      f0Hz: Number.isFinite(f0Hz) ? f0Hz : null,
      midi,
      confidence,
      rms: frameRms,
    }
  }

  _getYinCandidates(samples) {
    const cfg = this._config
    const threshold = Number(cfg.pyinThreshold) || DEFAULTS.pyinThreshold
    const probabilityThreshold = Number(cfg.pyinProbabilityThreshold) || DEFAULTS.pyinProbabilityThreshold
    const fmin = Number(cfg.fminHz) || DEFAULTS.fminHz
    const fmax = Number(cfg.fmaxHz) || DEFAULTS.fmaxHz
    const maxCandidates = Math.max(1, Math.floor(Number(cfg.pyinMaxCandidates) || DEFAULTS.pyinMaxCandidates))

    let bufferSize = 1
    while (bufferSize < samples.length) bufferSize *= 2
    bufferSize /= 2
    if (bufferSize < 2) return []

    const yinBufferLength = bufferSize / 2
    const yinBuffer = new Float32Array(yinBufferLength)

    for (let t = 1; t < yinBufferLength; t += 1) {
      let sum = 0
      for (let i = 0; i < yinBufferLength; i += 1) {
        const delta = samples[i] - samples[i + t]
        sum += delta * delta
      }
      yinBuffer[t] = sum
    }

    yinBuffer[0] = 1
    yinBuffer[1] = 1
    let runningSum = 0
    for (let t = 1; t < yinBufferLength; t += 1) {
      runningSum += yinBuffer[t]
      yinBuffer[t] *= t / runningSum
    }

    const candidates = []
    for (let t = 2; t < yinBufferLength - 1; t += 1) {
      if (yinBuffer[t] >= threshold) continue
      if (yinBuffer[t] > yinBuffer[t - 1] || yinBuffer[t] >= yinBuffer[t + 1]) continue

      const probability = 1 - yinBuffer[t]
      if (probability < probabilityThreshold) continue

      const betterTau = this._parabolicTau(yinBuffer, t)
      const f0 = this._sampleRate / betterTau
      if (!Number.isFinite(f0) || f0 < fmin || f0 > fmax) continue
      candidates.push({ f0, yin: yinBuffer[t] })
    }

    if (!candidates.length) return []
    candidates.sort((a, b) => a.yin - b.yin)
    return candidates.slice(0, maxCandidates)
  }

  _parabolicTau(yinBuffer, tau) {
    let x0 = tau < 1 ? tau : tau - 1
    let x2 = tau + 1 < yinBuffer.length ? tau + 1 : tau
    if (x0 === tau) {
      return yinBuffer[tau] <= yinBuffer[x2] ? tau : x2
    }
    if (x2 === tau) {
      return yinBuffer[tau] <= yinBuffer[x0] ? tau : x0
    }
    const s0 = yinBuffer[x0]
    const s1 = yinBuffer[tau]
    const s2 = yinBuffer[x2]
    return tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0))
  }

  _updateCausalStates(candidates) {
    const K = this._K
    if (!K) return null
    const prev = this._LLast || new Float64Array(2 * K)
    const next = new Float64Array(2 * K)
    const transLog = this._transLog
    const df = transLog.length
    const maxDelta = df - 1

    const voicedObs = new Float64Array(K)
    for (let i = 0; i < K; i += 1) voicedObs[i] = Number.NEGATIVE_INFINITY

    let sumPo = 0
    const mu = Math.max(1e-3, Number(this._config.pyinMu) || DEFAULTS.pyinMu)

    for (const candidate of candidates) {
      const j = Math.max(
        0,
        Math.min(K - 1, Math.round(Math.log(candidate.f0 / this._fStates[0]) / Math.log(this._config.pyinSpacing))),
      )
      const po = Math.pow(2, -candidate.yin / mu) / candidates.length
      if (!Number.isFinite(po) || po <= 0) continue
      sumPo += po
      const logPo = Math.log(po)
      if (logPo > voicedObs[j]) voicedObs[j] = logPo
    }

    for (let j = 0; j < K; j += 1) {
      let bestUU = Number.NEGATIVE_INFINITY
      let bestVU = Number.NEGATIVE_INFINITY

      const start = Math.max(0, j - maxDelta)
      const end = Math.min(K - 1, j + maxDelta)

      for (let k = start; k <= end; k += 1) {
        const delta = Math.abs(k - j)
        const tlog = transLog[delta]
        const vUU = prev[K + k] + tlog
        const vVU = prev[k] + tlog
        if (vUU > bestUU) bestUU = vUU
        if (vVU > bestVU) bestVU = vVU
      }

      const best = Math.max(bestUU + this._logPs, bestVU + this._log1Ps)
      const pol = Math.max(1e-12, (1 - sumPo) / K)
      next[K + j] = best + Math.log(pol)
    }

    for (let j = 0; j < K; j += 1) {
      if (!Number.isFinite(voicedObs[j])) {
        next[j] = Number.NEGATIVE_INFINITY
        continue
      }

      let bestVV = Number.NEGATIVE_INFINITY
      let bestUV = Number.NEGATIVE_INFINITY
      const start = Math.max(0, j - maxDelta)
      const end = Math.min(K - 1, j + maxDelta)

      for (let k = start; k <= end; k += 1) {
        const delta = Math.abs(k - j)
        const tlog = transLog[delta]
        const vVV = prev[k] + tlog
        const vUV = prev[K + k] + tlog
        if (vVV > bestVV) bestVV = vVV
        if (vUV > bestUV) bestUV = vUV
      }

      const best = Math.max(bestVV + this._logPs, bestUV + this._log1Ps)
      next[j] = best + voicedObs[j]
    }

    this._LLast = next

    let bestIndex = 0
    let bestValue = next[0]
    for (let i = 1; i < next.length; i += 1) {
      if (next[i] > bestValue) {
        bestValue = next[i]
        bestIndex = i
      }
    }

    if (bestIndex >= K) return { f0Hz: null }
    return { f0Hz: this._fStates[bestIndex] }
  }
}

export { PyinPlugin }
