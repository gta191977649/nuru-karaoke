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

class EssentiaYinPlugin {
  constructor() {
    this.id = 'essentia-yin'
    this.name = 'Essentia YIN'
    this._confidenceGate = 0.2
    this._maxFrequency = null
    this._minFrequency = null
  }

  configure(cfg) {
    const confidenceGate = Number(cfg?.yinConfidenceGate)
    if (Number.isFinite(confidenceGate)) this._confidenceGate = confidenceGate
    const maxFrequency = Number(cfg?.f0MaxHz)
    if (Number.isFinite(maxFrequency)) this._maxFrequency = maxFrequency
    const minFrequency = Number(cfg?.f0MinHz)
    if (Number.isFinite(minFrequency)) this._minFrequency = minFrequency
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
      if (typeof essentia.PitchYin === 'function') {
        const maxFrequency = Number.isFinite(this._maxFrequency) ? this._maxFrequency : undefined
        const minFrequency = Number.isFinite(this._minFrequency) ? this._minFrequency : undefined
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

export { EssentiaYinPlugin }
