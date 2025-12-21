import { YIN } from 'pitchfinder'
import { hzToMidi, rms } from '../utils/dspUtils.js'

class PitchfinderYinPlugin {
  constructor() {
    this.id = 'pitchfinder-yin'
    this.name = 'Pitchfinder YIN'
    this._rmsGate = 0.01
    this._yinThreshold = 0.1
    this._probabilityThreshold = 0.1
    this._sampleRate = 0
    this._detector = null
  }

  configure(cfg) {
    const gate = Number(cfg?.rmsGate)
    if (Number.isFinite(gate)) this._rmsGate = gate
    const threshold = Number(cfg?.yinThreshold)
    if (Number.isFinite(threshold)) this._yinThreshold = threshold
    const probability = Number(cfg?.yinProbabilityThreshold)
    if (Number.isFinite(probability)) this._probabilityThreshold = probability
  }

  _ensureDetector(sampleRate) {
    if (this._detector && this._sampleRate === sampleRate) return
    this._sampleRate = sampleRate
    this._detector = YIN({
      sampleRate,
      threshold: this._yinThreshold,
      probabilityThreshold: this._probabilityThreshold,
    })
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
    
    this._ensureDetector(sampleRate)
    const f0Hz = this._detector ? this._detector(samples) : null
    console.log(f0Hz)
    const isValid = Number.isFinite(f0Hz)
    const midi = isValid ? hzToMidi(f0Hz) : null
    const confidence = isValid ? Math.min(1, frameRms * 8) : 0

    return {
      f0Hz: isValid ? f0Hz : null,
      midi,
      confidence,
      rms: frameRms,
    }
  }

  reset() {
    this._detector = null
    this._sampleRate = 0
  }
}

export { PitchfinderYinPlugin }
