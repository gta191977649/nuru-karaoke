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

class EssentiaProbabilisticYinPlugin {
  constructor() {
    this.id = 'essentia-probabilistic-yin'
    this.name = 'Essentia Probabilistic YIN'
    this._confidenceGate = 0.5
    this._frameSize = null
    this._hopSize = null
    this._lowRMSThreshold = null
    this._outputUnvoiced = false
    this._preciseTime = false
  }

  configure(cfg) {
    const confidenceGate = Number(cfg?.yinConfidenceGate)
    if (Number.isFinite(confidenceGate)) this._confidenceGate = confidenceGate

    const frameSize = Number(cfg?.windowSize)
    if (Number.isFinite(frameSize)) this._frameSize = frameSize

    const hopSize = Number(cfg?.hopSize)
    if (Number.isFinite(hopSize)) this._hopSize = hopSize

    const lowRMSThreshold = Number(cfg?.rmsGate)
    if (Number.isFinite(lowRMSThreshold)) this._lowRMSThreshold = lowRMSThreshold

    if (typeof cfg?.yinProbOutputUnvoiced === 'boolean') {
      this._outputUnvoiced = cfg.yinProbOutputUnvoiced
    }

    if (typeof cfg?.yinProbPreciseTime === 'boolean') {
      this._preciseTime = cfg.yinProbPreciseTime
    }
  }

  detect(frame) {
    const samples = frame?.samples
    const sampleRate = Number(frame?.sampleRate)
    if (!samples || !Number.isFinite(sampleRate)) return null

    const frameRms = rms(samples)

    const essentia = getEssentia()
    if (!essentia) return null

    let signalVec = null
    try {
      signalVec = essentia.arrayToVector(samples)
      let res = null
      if (typeof essentia.PitchYinProbabilistic === 'function') {
        const frameSize = Number.isFinite(this._frameSize) ? this._frameSize : samples.length
        const hopSize = Number.isFinite(this._hopSize) ? this._hopSize : undefined
        const lowRMSThreshold = Number.isFinite(this._lowRMSThreshold) ? this._lowRMSThreshold : undefined
        const outputUnvoiced = this._outputUnvoiced
        const preciseTime = this._preciseTime

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
          res = essentia.PitchYinProbabilistic(
            signalVec,
            frameSize,
            hopSize,
            lowRMSThreshold,
          )
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
      if (!f0Hz || confidence < this._confidenceGate) {
        return {
          f0Hz: null,
          midi: null,
          confidence,
          rms: frameRms,
        }
      }

      return {
        f0Hz,
        midi: hzToMidi(f0Hz),
        confidence,
        rms: frameRms,
      }
    } finally {
      if (signalVec?.delete) signalVec.delete()
    }
  }

  reset() {}
}

export { EssentiaProbabilisticYinPlugin }
