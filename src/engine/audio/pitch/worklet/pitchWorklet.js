import { DEFAULT_CONFIG } from '../../../audioEngine.js'
import Essentia from 'essentia.js/dist/essentia.js-core.es.js'
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js'
import { PitchyPlugin } from '../plugins/pitchyPlugin.js'
import { AubioPlugin } from '../plugins/aubioPlugin.js'
import { PyinPlugin } from '../plugins/pyinPlugin.js'
import {
  applyHpfInPlace,
  createHpfState,
  hzToMidi,
  medianOfWindow,
  pushWindow,
  removeDcOffsetInPlace,
  rms,

  smoothDoubleExponential,
  updateHpfState,
} from '../utils/dspUtils.js'

const ESSENTIA_ALGOS = new Set(['essentia-yin', 'essentia-probabilistic-yin'])
const SMOOTH_WINDOW_SIZE = 5
const DEBUG_FRAME_SIZE = 256
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

    return {
      f0Hz,
      confidence,
    }
  } finally {
    if (signalVec?.delete) signalVec.delete()
  }
}

function downsampleFrame(frame, targetLength = DEBUG_FRAME_SIZE) {
  const len = frame?.length || 0
  if (!len) return new Float32Array(0)
  if (len <= targetLength) return frame.slice()
  const out = new Float32Array(targetLength)
  const stride = len / targetLength
  for (let i = 0; i < targetLength; i += 1) {
    out[i] = frame[Math.floor(i * stride)] || 0
  }
  return out
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
    this._detectors = new Map([
      ['pitchy', new PitchyPlugin()],
      ['aubio', new AubioPlugin()],
      ['pyin', new PyinPlugin()],
    ])
    this._detector = this._detectors.get(this._algoId) || null
    this._config = {
      rmsGate: DEFAULT_CONFIG.rmsGate,
      enableDoubleExponentialSmoothing: DEFAULT_CONFIG.enableDoubleExponentialSmoothing,
      aubioTolerance: DEFAULT_CONFIG.aubioTolerance,
      clarityGate: DEFAULT_CONFIG.clarityGate,
      yinConfidenceGate: DEFAULT_CONFIG.yinConfidenceGate,
      f0MinHz: DEFAULT_CONFIG.f0MinHz,
      f0MaxHz: DEFAULT_CONFIG.f0MaxHz,
      breakToleranceMs: DEFAULT_CONFIG.breakToleranceMs,
      medianWindowSize: DEFAULT_CONFIG.medianWindowSize,
      maxJumpSemitones: DEFAULT_CONFIG.maxJumpSemitones,
      holdFrames: DEFAULT_CONFIG.holdFrames,
      enablePitchSnap: DEFAULT_CONFIG.enablePitchSnap !== false,
      snapToleranceSemis: DEFAULT_CONFIG.snapToleranceSemis,
      enableDcRemoval: DEFAULT_CONFIG.enableDcRemoval !== false,
      enableHpf: DEFAULT_CONFIG.enableHpf !== false,
      enableRmsGate: DEFAULT_CONFIG.enableRmsGate !== false,
      enableF0Validate: DEFAULT_CONFIG.enableF0Validate !== false,
      enableTemporalSmooth: DEFAULT_CONFIG.enableTemporalSmooth !== false,
      debugPipeline: Boolean(DEFAULT_CONFIG.debugPipeline),
      debugPipelineStride: Math.max(1, Number(DEFAULT_CONFIG.debugPipelineStride) || 4),
    }
    this._essentiaConfig = {
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
    this._debugCounter = 0

    if (this._detector?.configure) this._detector.configure(this._config)

    this.port.onmessage = (event) => {
      const msg = event.data
      if (msg?.type !== 'config') return
      this._applyConfig(msg)
      this._setAlgo(msg.algoId)
    }
  }

  _applyConfig(msg) {
    const prevTemporal = this._config.enableTemporalSmooth
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

    if (typeof msg.enableDoubleExponentialSmoothing === 'boolean') {
      this._config.enableDoubleExponentialSmoothing = msg.enableDoubleExponentialSmoothing
    }
    // Double Exponential Smoothing parameters
    if (Number.isFinite(msg.smoothAlpha)) this._config.smoothAlpha = Number(msg.smoothAlpha)
    if (Number.isFinite(msg.smoothBeta)) this._config.smoothBeta = Number(msg.smoothBeta)

    const clarityGate = Number(msg.clarityGate)
    if (Number.isFinite(clarityGate)) this._config.clarityGate = clarityGate
    const yinConfidenceGate = Number(msg.yinConfidenceGate)
    if (Number.isFinite(yinConfidenceGate)) this._config.yinConfidenceGate = yinConfidenceGate
    const aubioTolerance = Number(msg.aubioTolerance)
    if (Number.isFinite(aubioTolerance)) this._config.aubioTolerance = aubioTolerance

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

    const breakToleranceMs = Number(msg.breakToleranceMs)
    if (Number.isFinite(breakToleranceMs)) {
      this._config.breakToleranceMs = breakToleranceMs
      const derivedHold = Math.max(0, Math.round((breakToleranceMs / 1000) * sampleRate / this._hopSize))
      if (Number.isFinite(derivedHold)) this._config.holdFrames = derivedHold
    }

    const holdFrames = Number(msg.holdFrames)
    if (!Number.isFinite(breakToleranceMs) && Number.isFinite(holdFrames)) this._config.holdFrames = holdFrames

    if (typeof msg.enablePitchSnap === 'boolean') this._config.enablePitchSnap = msg.enablePitchSnap
    const snapToleranceSemis = Number(msg.snapToleranceSemis)
    if (Number.isFinite(snapToleranceSemis)) this._config.snapToleranceSemis = snapToleranceSemis
    if (typeof msg.enableDcRemoval === 'boolean') this._config.enableDcRemoval = msg.enableDcRemoval
    if (typeof msg.enableHpf === 'boolean') this._config.enableHpf = msg.enableHpf
    if (typeof msg.enableRmsGate === 'boolean') this._config.enableRmsGate = msg.enableRmsGate
    if (typeof msg.enableF0Validate === 'boolean') this._config.enableF0Validate = msg.enableF0Validate
    if (typeof msg.enableTemporalSmooth === 'boolean') this._config.enableTemporalSmooth = msg.enableTemporalSmooth
    if (typeof msg.debugPipeline === 'boolean') this._config.debugPipeline = msg.debugPipeline
    const debugStride = Number(msg.debugPipelineStride)
    if (Number.isFinite(debugStride) && debugStride > 0) {
      this._config.debugPipelineStride = Math.max(1, Math.round(debugStride))
    }

    if (Number.isFinite(nextWindow)) this._essentiaConfig.frameSize = nextWindow
    if (Number.isFinite(nextHop)) this._essentiaConfig.hopSize = nextHop

    if (typeof msg.yinProbOutputUnvoiced === 'boolean') {
      this._essentiaConfig.outputUnvoiced = msg.yinProbOutputUnvoiced
    }

    if (typeof msg.yinProbPreciseTime === 'boolean') {
      this._essentiaConfig.preciseTime = msg.yinProbPreciseTime
    }

    if (this._detector?.configure) this._detector.configure(this._config)
    if (prevTemporal !== this._config.enableTemporalSmooth) this._resetTracking()
  }

  _setAlgo(algoId) {
    if (typeof algoId !== 'string' || !algoId) return
    if (algoId === this._algoId) return
    this._algoId = algoId
    this._detector = this._detectors.get(algoId) || null
    if (this._detector?.configure) this._detector.configure(this._config)
    if (this._detector?.reset) this._detector.reset()
    this._resetTracking()
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
      const debugStages = this._shouldDebug() ? {} : null
      if (debugStages) debugStages.input = downsampleFrame(frame)

      if (this._config.enableDcRemoval) removeDcOffsetInPlace(frame)
      if (debugStages) debugStages.dcRemoved = downsampleFrame(frame)

      if (this._config.enableHpf) {
        this._hpfState = applyHpfInPlace(frame, this._hpfState)
      }
      if (debugStages) debugStages.hpf = downsampleFrame(frame)

      const frameRms = rms(frame)
      const gateEnabled = this._config.enableRmsGate && Number.isFinite(this._config.rmsGate)
      const gateOpen = !gateEnabled || frameRms >= this._config.rmsGate
      if (debugStages) {
        debugStages.gated = gateOpen ? downsampleFrame(frame) : new Float32Array(DEBUG_FRAME_SIZE)
      }

      const remaining = this._bufferLength - this._hopSize
      if (remaining > 0) {
        this._buffer.copyWithin(0, this._hopSize, this._bufferLength)
      }
      this._bufferLength = Math.max(0, remaining)

      if (!gateOpen) {
        const result = {
          tAcSec: currentTime,
          f0Hz: null,
          midi: null,
          confidence: 0,
          rms: frameRms,
          algoId: this._algoId,
        }
        this._postPitch(result)
        this._postDebug(debugStages, {
          rms: frameRms,
          gateOpen,
          rawF0Hz: null,
          rawConfidence: 0,
          result,
        })
        continue
      }

      const raw = this._runDetector(frame, frameRms)
      if (!raw) {
        const result = {
          tAcSec: currentTime,
          f0Hz: null,
          midi: null,
          confidence: 0,
          rms: frameRms,
          algoId: this._algoId,
        }
        this._postPitch(result)
        this._postDebug(debugStages, {
          rms: frameRms,
          gateOpen,
          rawF0Hz: null,
          rawConfidence: 0,
          result,
        })
        continue
      }

      const result = this._postProcess(raw, frameRms)
      if (result) {
        this._postPitch(result)
      }
      this._postDebug(debugStages, {
        rms: frameRms,
        gateOpen,
        rawF0Hz: raw.f0Hz ?? null,
        rawConfidence: raw.confidence ?? 0,
        result,
      })
    }
  }

  _resetTracking() {
    this._smoothState = { value: null, level: null, trend: null, window: [] }
    this._stabilityState = { window: [], lastStableF0: null, lastStableMidi: null, holdLeft: 0 }
  }

  _shouldDebug() {
    if (!this._config.debugPipeline) return false
    const stride = Math.max(1, Number(this._config.debugPipelineStride) || 1)
    this._debugCounter += 1
    return this._debugCounter % stride === 0
  }

  _postPitch(result) {
    if (!result) return
    this.port.postMessage({
      type: 'pitch',
      result,
    })
  }

  _postDebug(stages, metrics) {
    if (!stages) return
    this.port.postMessage({
      type: 'pipeline-debug',
      tAcSec: currentTime,
      sampleRate,
      stages,
      metrics: metrics || {},
    })
  }

  _runDetector(samples, frameRms) {
    if (ESSENTIA_ALGOS.has(this._algoId)) {
      const essentia = getEssentia()
      if (!essentia) return null
      if (this._algoId === 'essentia-yin') {
        return detectEssentiaYin(essentia, samples, sampleRate, this._essentiaConfig)
      }
      if (this._algoId === 'essentia-probabilistic-yin') {
        return detectEssentiaProbabilisticYin(essentia, samples, sampleRate, this._essentiaConfig)
      }
    }

    if (!this._detector?.detect) return null
    const raw = this._detector.detect({ samples, sampleRate, rms: frameRms })
    if (!raw) return null
    return {
      f0Hz: raw.f0Hz ?? null,
      confidence: raw.confidence ?? 0,
    }
  }

  _getConfidenceGate() {
    if (this._algoId === 'pitchy') return Number(this._config.clarityGate)
    if (ESSENTIA_ALGOS.has(this._algoId)) return Number(this._config.yinConfidenceGate)
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
    const enablePitchSnap = this._config.enablePitchSnap !== false
    const snapToleranceSemis = Number.isFinite(this._config.snapToleranceSemis)
      ? this._config.snapToleranceSemis
      : 0.35
    let usedHold = false

    if (this._config.enableF0Validate) {
      const confidenceGate = this._getConfidenceGate()
      if (Number.isFinite(confidenceGate)) {
        if (!Number.isFinite(confidence) || confidence < confidenceGate) {
          f0Hz = null
        }
      }

      const isValidRange =
        Number.isFinite(f0Hz) &&
        (!Number.isFinite(f0MinHz) || f0Hz >= f0MinHz) &&
        (!Number.isFinite(f0MaxHz) || f0Hz <= f0MaxHz)
      f0Hz = isValidRange ? f0Hz : null
    }

    // 1. Median Smoothing (De-spiking) + Stability
    if (this._config.enableTemporalSmooth) {
      if (Number.isFinite(f0Hz)) {
        this._stabilityState.window = pushWindow(this._stabilityState.window, f0Hz, medianWindowSize)
        const medianF0 = medianOfWindow(this._stabilityState.window)
        f0Hz = Number.isFinite(medianF0) ? medianF0 : f0Hz

        const candidateMidi = hzToMidi(f0Hz)
        if (
          enablePitchSnap &&
          Number.isFinite(candidateMidi) &&
          Number.isFinite(this._stabilityState.lastStableMidi) &&
          Math.abs(candidateMidi - this._stabilityState.lastStableMidi) <= snapToleranceSemis
        ) {
          f0Hz = this._stabilityState.lastStableF0 ?? f0Hz
        }

        const jumpMidi = hzToMidi(f0Hz)
        if (
          Number.isFinite(jumpMidi) &&
          Number.isFinite(this._stabilityState.lastStableMidi) &&
          Math.abs(jumpMidi - this._stabilityState.lastStableMidi) > maxJumpSemitones
        ) {
          f0Hz = null
        } else if (Number.isFinite(f0Hz)) {
          this._stabilityState.lastStableF0 = f0Hz
          this._stabilityState.lastStableMidi = jumpMidi
          this._stabilityState.holdLeft = holdFrames
        }
      }
    } else {
      // allkaraoke-like stability: snap tiny jitter + short break tolerance
      if (Number.isFinite(f0Hz)) {
        const candidateMidi = hzToMidi(f0Hz)
        if (
          enablePitchSnap &&
          Number.isFinite(candidateMidi) &&
          Number.isFinite(this._stabilityState.lastStableMidi) &&
          Math.abs(candidateMidi - this._stabilityState.lastStableMidi) <= snapToleranceSemis
        ) {
          f0Hz = this._stabilityState.lastStableF0 ?? f0Hz
        }
        const stableMidi = hzToMidi(f0Hz)
        if (Number.isFinite(stableMidi)) {
          this._stabilityState.lastStableF0 = f0Hz
          this._stabilityState.lastStableMidi = stableMidi
          this._stabilityState.holdLeft = holdFrames
        }
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

    // 2. Double Exponential Smoothing (Trend Smoothing)
    // NOTE: We apply this INDEPENDENTLY of the legacy 'enableTemporalSmooth' flag.
    // We also perform this in the MIDI (Log) domain for perceptual consistency.
    if (this._config.enableDoubleExponentialSmoothing) {
      // Use Double Exponential Smoothing (Holt's Linear Trend)
      // Default params if not set: alpha=0.5, beta=0.1
      const alpha = Number.isFinite(this._config.smoothAlpha) ? this._config.smoothAlpha : 0.5
      const beta = Number.isFinite(this._config.smoothBeta) ? this._config.smoothBeta : 0.1

      this._smoothState = smoothDoubleExponential(this._smoothState, f0Hz, alpha, beta)
      f0Hz = this._smoothState.value
    }

    const midi = Number.isFinite(f0Hz) ? hzToMidi(f0Hz) : null

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
