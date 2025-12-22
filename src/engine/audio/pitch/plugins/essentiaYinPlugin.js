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
    this._rmsGate = 0.01
    this._confidenceGate = 0.5
  }

  configure(cfg) {
    const gate = Number(cfg?.rmsGate)
    if (Number.isFinite(gate)) this._rmsGate = gate
    const confidenceGate = Number(cfg?.yinConfidenceGate)
    if (Number.isFinite(confidenceGate)) this._confidenceGate = confidenceGate
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

    const essentia = getEssentia()
    if (!essentia) return null

    let signalVec = null
    try {
      signalVec = essentia.arrayToVector(samples)
      let res = null
      if (typeof essentia.PitchYin === 'function') {
        res =
          essentia.PitchYin.length >= 3
            ? essentia.PitchYin(signalVec, samples.length, sampleRate)
            : essentia.PitchYin(signalVec)
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
