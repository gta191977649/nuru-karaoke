import Essentia from 'essentia.js/dist/essentia.js-core.es.js'
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js'
import { hzToMidi, rms } from '../utils/dspUtils.js'

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

class EssentiaMelodiaPlugin {
  constructor() {
    this.id = 'essentia-melodia'
    this.name = 'Essentia Melodia'
    this._rmsGate = 0.01
    this._buffer = new Float32Array(0)
    this._bufferStart = 0
    this._bufferLength = 0
    this._samplesSinceLast = 0
    this._lastResult = null
    this._params = {
      binResolution: 10,
      filterIterations: 3,
      frameSize: 2048,
      guessUnvoiced: false,
      harmonicWeight: 0.8,
      hopSize: 128,
      magnitudeCompression: 1,
      magnitudeThreshold: 40,
      maxFrequency: 20000,
      minDuration: 100,
      minFrequency: 40,
      numberHarmonics: 20,
      peakDistributionThreshold: 0.9,
      peakFrameThreshold: 0.9,
      pitchContinuity: 27.5625,
      referenceFrequency: 55,
      timeContinuity: 100,
    }
  }

  _rebuildBuffer() {
    this._buffer = new Float32Array(0)
    this._bufferStart = 0
    this._bufferLength = 0
    this._samplesSinceLast = 0
  }

  _ensureCapacity(required) {
    if (this._buffer.length >= required) return
    const nextSize = Math.max(required, this._buffer.length * 2 || 4096)
    const next = new Float32Array(nextSize)
    if (this._bufferLength > 0) {
      next.set(this._buffer.subarray(this._bufferStart, this._bufferStart + this._bufferLength), 0)
    }
    this._buffer = next
    this._bufferStart = 0
  }

  _appendSamples(samples) {
    const needed = this._bufferLength + samples.length
    if (this._bufferStart + needed > this._buffer.length && this._bufferLength > 0) {
      this._buffer.copyWithin(0, this._bufferStart, this._bufferStart + this._bufferLength)
      this._bufferStart = 0
    }
    this._ensureCapacity(this._bufferStart + needed)
    this._buffer.set(samples, this._bufferStart + this._bufferLength)
    this._bufferLength += samples.length
  }

  _consumeSamples(count) {
    const amount = Math.min(this._bufferLength, Math.max(0, count))
    this._bufferStart += amount
    this._bufferLength -= amount
    if (this._bufferLength === 0) this._bufferStart = 0
  }

  _maxBufferSamples() {
    const frameSize = Math.max(1024, Number(this._params.frameSize) || 2048)
    const hopSize = Math.max(64, Number(this._params.hopSize) || 128)
    return Math.max(frameSize * 4, frameSize + hopSize * 16)
  }

  configure(cfg) {
    const gate = Number(cfg?.rmsGate)
    if (Number.isFinite(gate)) this._rmsGate = gate

    const updateNumber = (key) => {
      const value = Number(cfg?.[key])
      if (Number.isFinite(value)) this._params[key] = value
    }

    updateNumber('binResolution')
    updateNumber('filterIterations')
    updateNumber('frameSize')
    updateNumber('harmonicWeight')
    updateNumber('hopSize')
    updateNumber('magnitudeCompression')
    updateNumber('magnitudeThreshold')
    updateNumber('maxFrequency')
    updateNumber('minDuration')
    updateNumber('minFrequency')
    updateNumber('numberHarmonics')
    updateNumber('peakDistributionThreshold')
    updateNumber('peakFrameThreshold')
    updateNumber('pitchContinuity')
    updateNumber('referenceFrequency')
    updateNumber('timeContinuity')

    if (typeof cfg?.guessUnvoiced === 'boolean') this._params.guessUnvoiced = cfg.guessUnvoiced
    if (Number.isFinite(Number(cfg?.frameSize)) || Number.isFinite(Number(cfg?.hopSize))) {
      this._rebuildBuffer()
    }
  }

  detect(frame) {
    const samples = frame?.samples
    const sampleRate = Number(frame?.sampleRate)
    if (!samples || !Number.isFinite(sampleRate)) return null

    const frameRms = rms(samples)
    if (frameRms < this._rmsGate) {
      return {
        f0Hz: null,
        midi: null,
        confidence: 0,
        rms: frameRms,
      }
    }

    this._appendSamples(samples)
    this._samplesSinceLast += samples.length

    const essentia = getEssentia()
    if (!essentia) return null

    const frameSize = Math.max(1024, Number(this._params.frameSize) || 2048)
    const hopSize = Math.max(64, Number(this._params.hopSize) || 128)
    const analyzeStride = hopSize * 4

    if (this._bufferLength < frameSize || this._samplesSinceLast < analyzeStride) {
      return this._lastResult ? { ...this._lastResult, rms: frameRms } : null
    }

    let signalVec = null
    try {
      const bufferView = this._buffer.subarray(this._bufferStart, this._bufferStart + this._bufferLength)
      signalVec = essentia.arrayToVector(bufferView)
      const res = essentia.PitchMelodia(
        signalVec,
        this._params.binResolution,
        this._params.filterIterations,
        this._params.frameSize,
        this._params.guessUnvoiced,
        this._params.harmonicWeight,
        this._params.hopSize,
        this._params.magnitudeCompression,
        this._params.magnitudeThreshold,
        this._params.maxFrequency,
        this._params.minFrequency,
        this._params.minDuration,
        this._params.numberHarmonics,
        this._params.peakDistributionThreshold,
        this._params.peakFrameThreshold,
        this._params.pitchContinuity,
        this._params.referenceFrequency,
        sampleRate,
        this._params.timeContinuity,
      )

      const pitchVec = res?.pitch
      const confVec = res?.pitchConfidence
      const pitchSize = typeof pitchVec?.size === 'function' ? pitchVec.size() : 0
      const confSize = typeof confVec?.size === 'function' ? confVec.size() : 0

      let pitchArr = []
      let confArr = []
      if (pitchSize > 0) pitchArr = essentia.vectorToArray(pitchVec)
      if (confSize > 0) confArr = essentia.vectorToArray(confVec)

      if (pitchVec?.delete) pitchVec.delete()
      if (confVec?.delete) confVec.delete()

      const lastPitch = pitchArr.length ? pitchArr[pitchArr.length - 1] : null
      const lastConf = confArr.length ? confArr[confArr.length - 1] : 0
      const f0Hz = Number.isFinite(lastPitch) && lastPitch > 0 ? lastPitch : null
      const midi = f0Hz ? hzToMidi(f0Hz) : null

      const result = {
        f0Hz,
        midi,
        confidence: Number.isFinite(lastConf) ? lastConf : 0,
        rms: frameRms,
      }

      this._lastResult = result
      this._samplesSinceLast = 0
      const maxBuffer = this._maxBufferSamples()
      if (this._bufferLength > maxBuffer) {
        this._consumeSamples(this._bufferLength - maxBuffer)
      } else {
        this._consumeSamples(Math.min(this._bufferLength - frameSize, analyzeStride))
      }

      return result
    } finally {
      if (signalVec?.delete) signalVec.delete()
    }
  }

  reset() {}
}

export { EssentiaMelodiaPlugin }
