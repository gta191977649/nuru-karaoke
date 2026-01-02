import { PitchDetector } from 'pitchy'
import { hzToMidi, rms } from '../utils/dspUtils.js'

class PitchyPlugin {
  constructor() {
    this.id = 'pitchy'
    this.name = 'Pitchy'
    this._clarityGate = 0.1
    this._detector = null
    this._inputLength = 0
  }

  configure(cfg) {
    const clarityGate = Number(cfg?.clarityGate)
    if (Number.isFinite(clarityGate)) this._clarityGate = clarityGate
  }

  _ensureDetector(length) {
    if (this._detector && this._inputLength === length) return
    this._inputLength = length
    this._detector = PitchDetector.forFloat32Array(length)
  }

  detect(frame) {
    const samples = frame?.samples
    const sampleRate = Number(frame?.sampleRate)
    if (!samples || !Number.isFinite(sampleRate)) return null

    const frameRms = Number.isFinite(frame?.rms) ? frame.rms : rms(samples)

    this._ensureDetector(samples.length)
    const [f0Hz, clarity] = this._detector.findPitch(samples, sampleRate)
    const midi = Number.isFinite(f0Hz) ? hzToMidi(f0Hz) : null
    const confidence = Number.isFinite(clarity) ? clarity : 0
    return {
      f0Hz: Number.isFinite(f0Hz) ? f0Hz : null,
      midi,
      confidence,
      rms: frameRms,
    }
  }

  reset() {
    this._detector = null
    this._inputLength = 0
  }
}

export { PitchyPlugin }
