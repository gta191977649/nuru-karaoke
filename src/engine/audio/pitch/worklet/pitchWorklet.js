import { DEFAULT_CONFIG } from '../../../audioEngine.js'
import Essentia from 'essentia.js/dist/essentia.js-core.es.js'
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js'
import {
  applyHpfInPlace,
  createHpfState,
  hzToMidi,
  medianOfWindow,
  pushWindow,
  removeDcOffsetInPlace,
  rms,
  smoothMovingAverage,
  updateHpfState,
} from '../utils/dspUtils.js'

const ESSENTIA_ALGOS = new Set(['essentia-yin', 'essentia-probabilistic-yin'])
const SMOOTH_WINDOW_SIZE = 5
let essentiaInstance = null
let essentiaError = null

function getEssentia() {
  if (essentiaError) return null
  if (!essentiaInstance) {
    try {
      essentiaInstance = new Essentia(EssentiaWASM)
    } catch (err) {
      essentiaError = err
      return null
    }
  }
  return essentiaInstance
}

function detectEssentiaYin(essentia, samples, sampleRate, cfg) {
  if (!essentia || !samples?.length || !Number.isFinite(sampleRate)) return null
  let signalVec = null
  try {
    signalVec = essentia.arrayToVector(samples)
    let res = null
    if (typeof essentia.PitchYin === 'function') {
      const maxFrequency = Number.isFinite(cfg.maxFrequency) ? cfg.maxFrequency : undefined
      const minFrequency = Number.isFinite(cfg.minFrequency) ? cfg.minFrequency : undefined
      if (essentia.PitchYin.length >= 6) {
        res = essentia.PitchYin(signalVec, samples.length, false, maxFrequency, minFrequency, sampleRate)
      } else if (essentia.PitchYin.length >= 5) {
        res = essentia.PitchYin(signalVec, samples.length, false, maxFrequency, minFrequency)
      } else if (essentia.PitchYin.length >= 4) {
        res = essentia.PitchYin(signalVec, samples.length, false, maxFrequency)
      } else if (essentia.PitchYin.length >= 3) {
        res = essentia.PitchYin(signalVec, samples.length, sampleRate)
      } else if (essentia.PitchYin.length >= 2) {
        res = essentia.PitchYin(signalVec, samples.length)
      } else {
        res = essentia.PitchYin(signalVec)
      }
    }

    const f0Hz = Number.isFinite(res?.pitch) && res.pitch > 0 ? res.pitch : null
    const confidence = Number.isFinite(res?.pitchConfidence) ? res.pitchConfidence : 0
    if (!f0Hz || confidence < cfg.confidenceGate) {
      return {
        f0Hz: null,
        confidence,
      }
    }

    return {
      f0Hz,
      confidence,
    }
  } finally {
    if (signalVec?.delete) signalVec.delete()
  }
}

function detectEssentiaProbabilisticYin(essentia, samples, sampleRate, cfg) {
  if (!essentia || !samples?.length || !Number.isFinite(sampleRate)) return null
  let signalVec = null
  try {
    signalVec = essentia.arrayToVector(samples)
    let res = null
    if (typeof essentia.PitchYinProbabilistic === 'function') {
      const frameSize = Number.isFinite(cfg.frameSize) ? cfg.frameSize : samples.length
      const hopSize = Number.isFinite(cfg.hopSize) ? cfg.hopSize : undefined
      const lowRMSThreshold = Number.isFinite(cfg.lowRMSThreshold) ? cfg.lowRMSThreshold : undefined
      const outputUnvoiced = cfg.outputUnvoiced
      const preciseTime = cfg.preciseTime

      if (essentia.PitchYinProbabilistic.length >= 7) {
        res = essentia.PitchYinProbabilistic(
          signalVec,
          frameSize,
          hopSize,
          lowRMSThreshold,
          outputUnvoiced,
          preciseTime,
          sampleRate,
        )
      } else if (essentia.PitchYinProbabilistic.length >= 6) {
        res = essentia.PitchYinProbabilistic(
          signalVec,
          frameSize,
          hopSize,
          lowRMSThreshold,
          outputUnvoiced,
          preciseTime,
        )
      } else if (essentia.PitchYinProbabilistic.length >= 5) {
        res = essentia.PitchYinProbabilistic(
          signalVec,
          frameSize,
          hopSize,
          lowRMSThreshold,
          outputUnvoiced,
        )
      } else if (essentia.PitchYinProbabilistic.length >= 4) {
        res = essentia.PitchYinProbabilistic(signalVec, frameSize, hopSize, lowRMSThreshold)
      } else if (essentia.PitchYinProbabilistic.length >= 3) {
        res = essentia.PitchYinProbabilistic(signalVec, frameSize, hopSize)
      } else if (essentia.PitchYinProbabilistic.length >= 2) {
        res = essentia.PitchYinProbabilistic(signalVec, frameSize)
      } else {
        res = essentia.PitchYinProbabilistic(signalVec)
      }
    }

    const f0Hz = Number.isFinite(res?.pitch) && res.pitch > 0 ? res.pitch : null
    const confidence = Number.isFinite(res?.pitchConfidence)
      ? res.pitchConfidence
      : Number.isFinite(res?.confidence)
        ? res.confidence
        : 0
    if (!f0Hz || confidence < cfg.confidenceGate) {
      return {
        f0Hz: null,
        confidence,
      }
    }

    return {
      f0Hz,
      confidence,
    }
  } finally {
    if (signalVec?.delete) signalVec.delete()
  }
}

class PitchFrameProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._windowSize = DEFAULT_CONFIG.windowSize
    this._hopSize = DEFAULT_CONFIG.hopSize
    this._hpfCutoffHz = Number(DEFAULT_CONFIG.hpfCutoffHz) || 0
    this._hpfState = createHpfState(this._hpfCutoffHz, sampleRate)
    this._buffer = new Float32Array(this._windowSize * 4)
    this._bufferLength = 0
    this._algoId = DEFAULT_CONFIG.pitchAlgoId || 'pitchy'
    this._useWorkletDetector = false
    this._config = {
      rmsGate: DEFAULT_CONFIG.rmsGate,
      smoothing: DEFAULT_CONFIG.smoothing,
      f0MinHz: DEFAULT_CONFIG.f0MinHz,
      f0MaxHz: DEFAULT_CONFIG.f0MaxHz,
      medianWindowSize: DEFAULT_CONFIG.medianWindowSize,
      maxJumpSemitones: DEFAULT_CONFIG.maxJumpSemitones,
      holdFrames: DEFAULT_CONFIG.holdFrames,
    }
    this._essentiaConfig = {
      confidenceGate: 0.5,
      minFrequency: DEFAULT_CONFIG.f0MinHz,
      maxFrequency: DEFAULT_CONFIG.f0MaxHz,
      frameSize: this._windowSize,
      hopSize: this._hopSize,
      lowRMSThreshold: DEFAULT_CONFIG.rmsGate,
      outputUnvoiced: false,
      preciseTime: false,
    }
    this._smoothState = { value: null, window: [] }
    this._stabilityState = {
      window: [],
      lastStableF0: null,
      lastStableMidi: null,
      holdLeft: 0,
    }

    this.port.onmessage = (event) => {
      const msg = event.data
      if (msg?.type !== 'config') return
      this._applyConfig(msg)
      this._updateAlgo(msg.algoId)
    }
  }

  _applyConfig(msg) {
    const nextWindow = Math.max(256, Number(msg.windowSize) || this._windowSize)
    const nextHop = Math.max(1, Number(msg.hopSize) || this._hopSize)
    const nextCutoff = Number.isFinite(Number(msg.hpfCutoffHz))
      ? Number(msg.hpfCutoffHz)
      : this._hpfCutoffHz
    const needsReset = nextWindow !== this._windowSize
    this._windowSize = nextWindow
    this._hopSize = nextHop
    this._hpfCutoffHz = nextCutoff
    this._hpfState = updateHpfState(this._hpfState, this._hpfCutoffHz, sampleRate)
    if (needsReset) {
      this._buffer = new Float32Array(this._windowSize * 4)
      this._bufferLength = 0
    }

    const rmsGate = Number(msg.rmsGate)
    if (Number.isFinite(rmsGate)) {
      this._config.rmsGate = rmsGate
      this._essentiaConfig.lowRMSThreshold = rmsGate
    }

    if (typeof msg.smoothing === 'boolean') this._config.smoothing = msg.smoothing

    const f0MinHz = Number(msg.f0MinHz)
    if (Number.isFinite(f0MinHz)) {
      this._config.f0MinHz = f0MinHz
      this._essentiaConfig.minFrequency = f0MinHz
    }

    const f0MaxHz = Number(msg.f0MaxHz)
    if (Number.isFinite(f0MaxHz)) {
      this._config.f0MaxHz = f0MaxHz
      this._essentiaConfig.maxFrequency = f0MaxHz
    }

    const medianWindowSize = Number(msg.medianWindowSize)
    if (Number.isFinite(medianWindowSize)) this._config.medianWindowSize = medianWindowSize

    const maxJumpSemitones = Number(msg.maxJumpSemitones)
    if (Number.isFinite(maxJumpSemitones)) this._config.maxJumpSemitones = maxJumpSemitones

    const holdFrames = Number(msg.holdFrames)
    if (Number.isFinite(holdFrames)) this._config.holdFrames = holdFrames

    const confidenceGate = Number(msg.yinConfidenceGate)
    if (Number.isFinite(confidenceGate)) this._essentiaConfig.confidenceGate = confidenceGate

    if (Number.isFinite(nextWindow)) this._essentiaConfig.frameSize = nextWindow
    if (Number.isFinite(nextHop)) this._essentiaConfig.hopSize = nextHop

    if (typeof msg.yinProbOutputUnvoiced === 'boolean') {
      this._essentiaConfig.outputUnvoiced = msg.yinProbOutputUnvoiced
    }

    if (typeof msg.yinProbPreciseTime === 'boolean') {
      this._essentiaConfig.preciseTime = msg.yinProbPreciseTime
    }
  }

  _updateAlgo(algoId) {
    if (typeof algoId !== 'string' || !algoId) return
    const algoChanged = algoId !== this._algoId
    if (algoChanged) {
      this._algoId = algoId
      this._resetTracking()
    }

    const shouldUseEssentia = ESSENTIA_ALGOS.has(algoId)
    let ready = false
    let error = null
    if (shouldUseEssentia) {
      ready = Boolean(getEssentia())
      error = essentiaError
    }

    const statusChanged = ready !== this._useWorkletDetector || algoChanged
    this._useWorkletDetector = ready
    if (statusChanged) {
      this._notifyDetectorStatus(algoId, ready, error)
    }
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const channel = input[0]
    if (!channel.length) return true

    this._append(channel)
    this._flush()
    return true
  }

  _append(samples) {
    const nextLength = this._bufferLength + samples.length
    if (nextLength > this._buffer.length) {
      const nextSize = Math.max(nextLength, this._buffer.length * 2)
      const next = new Float32Array(nextSize)
      if (this._bufferLength > 0) {
        next.set(this._buffer.subarray(0, this._bufferLength))
      }
      this._buffer = next
    }
    this._buffer.set(samples, this._bufferLength)
    this._bufferLength = nextLength
  }

  _flush() {
    while (this._bufferLength >= this._windowSize) {
      const frame = new Float32Array(this._windowSize)
      frame.set(this._buffer.subarray(0, this._windowSize))
      this._conditionFrame(frame)

      const remaining = this._bufferLength - this._hopSize
      if (remaining > 0) {
        this._buffer.copyWithin(0, this._hopSize, this._bufferLength)
      }
      this._bufferLength = Math.max(0, remaining)

      if (this._useWorkletDetector) {
        const result = this._detectPitch(frame)
        if (result) {
          this.port.postMessage({
            type: 'pitch',
            result,
          })
        }
      } else {
        this.port.postMessage(
          {
            type: 'frame',
            tAcSec: currentTime,
            samples: frame,
            sampleRate,
          },
          [frame.buffer],
        )
      }
    }
  }

  _conditionFrame(frame) {
    if (!frame?.length) return
    removeDcOffsetInPlace(frame)
    this._hpfState = applyHpfInPlace(frame, this._hpfState)
  }

  _resetTracking() {
    this._smoothState = { value: null, window: [] }
    this._stabilityState = { window: [], lastStableF0: null, lastStableMidi: null, holdLeft: 0 }
  }

  _notifyDetectorStatus(algoId, ready, error) {
    this.port.postMessage({
      type: 'detector',
      algoId,
      ready: Boolean(ready),
      error: error ? String(error?.message || error) : null,
    })
  }

  _detectPitch(samples) {
    const frameRms = rms(samples)
    if (Number.isFinite(this._config.rmsGate) && frameRms < this._config.rmsGate) {
      return {
        tAcSec: currentTime,
        f0Hz: null,
        midi: null,
        confidence: 0,
        rms: frameRms,
        algoId: this._algoId,
      }
    }

    const raw = this._runEssentia(samples)
    if (!raw) return null
    return this._postProcess(raw, frameRms)
  }

  _runEssentia(samples) {
    const essentia = getEssentia()
    if (!essentia) return null
    if (this._algoId === 'essentia-yin') {
      return detectEssentiaYin(essentia, samples, sampleRate, this._essentiaConfig)
    }
    if (this._algoId === 'essentia-probabilistic-yin') {
      return detectEssentiaProbabilisticYin(essentia, samples, sampleRate, this._essentiaConfig)
    }
    return null
  }

  _postProcess(raw, frameRms) {
    let { f0Hz, confidence } = raw
    const f0MinHz = Number(this._config.f0MinHz)
    const f0MaxHz = Number(this._config.f0MaxHz)
    const medianWindowSize = Number.isFinite(this._config.medianWindowSize)
      ? this._config.medianWindowSize
      : 5
    const maxJumpSemitones = Number.isFinite(this._config.maxJumpSemitones)
      ? this._config.maxJumpSemitones
      : 3
    const holdFrames = Number.isFinite(this._config.holdFrames) ? this._config.holdFrames : 2
    let usedHold = false

    const isValidRange =
      Number.isFinite(f0Hz) &&
      (!Number.isFinite(f0MinHz) || f0Hz >= f0MinHz) &&
      (!Number.isFinite(f0MaxHz) || f0Hz <= f0MaxHz)
    f0Hz = isValidRange ? f0Hz : null

    if (Number.isFinite(f0Hz)) {
      this._stabilityState.window = pushWindow(this._stabilityState.window, f0Hz, medianWindowSize)
      const medianF0 = medianOfWindow(this._stabilityState.window)
      f0Hz = Number.isFinite(medianF0) ? medianF0 : f0Hz

      const candidateMidi = hzToMidi(f0Hz)
      if (
        Number.isFinite(candidateMidi) &&
        Number.isFinite(this._stabilityState.lastStableMidi) &&
        Math.abs(candidateMidi - this._stabilityState.lastStableMidi) > maxJumpSemitones
      ) {
        f0Hz = null
      } else {
        this._stabilityState.lastStableF0 = f0Hz
        this._stabilityState.lastStableMidi = candidateMidi
        this._stabilityState.holdLeft = holdFrames
      }
    }

    if (!Number.isFinite(f0Hz)) {
      if (this._stabilityState.holdLeft > 0 && Number.isFinite(this._stabilityState.lastStableF0)) {
        f0Hz = this._stabilityState.lastStableF0
        usedHold = true
        this._stabilityState.holdLeft -= 1
      } else {
        this._stabilityState.holdLeft = 0
      }
    }

    if (this._config.smoothing) {
      this._smoothState = smoothMovingAverage(this._smoothState, f0Hz, SMOOTH_WINDOW_SIZE)
      f0Hz = this._smoothState.value
    }

    const midi = Number.isFinite(f0Hz) ? hzToMidi(f0Hz) : raw?.midi ?? null

    return {
      tAcSec: currentTime,
      f0Hz: f0Hz ?? null,
      midi: midi ?? null,
      confidence: usedHold || !Number.isFinite(f0Hz) ? 0 : Number.isFinite(confidence) ? confidence : 0,
      rms: frameRms,
      algoId: this._algoId,
    }
  }
}

registerProcessor('pitch-frame-processor', PitchFrameProcessor)
