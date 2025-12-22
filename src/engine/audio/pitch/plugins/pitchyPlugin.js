import { PitchDetector } from 'pitchy'
import { hzToMidi, rms } from '../utils/dspUtils.js'

class PitchyPlugin {
  constructor() {
    this.id = 'pitchy'
    this.name = 'Pitchy'
    this._rmsGate = 0.01
    this._clarityGate = 0.3
    this._detector = null
    this._inputLength = 0
  }

  configure(cfg) {
    const gate = Number(cfg?.rmsGate)
    if (Number.isFinite(gate)) this._rmsGate = gate
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

    const frameRms = rms(samples)
    if (frameRms < this._rmsGate) {
      return {
        f0Hz: null,
        midi: null,
        confidence: 0,
        rms: frameRms,
      }
    }

    this._ensureDetector(samples.length)
    const [f0Hz, clarity] = this._detector.findPitch(samples, sampleRate)
    const midi = Number.isFinite(f0Hz) ? hzToMidi(f0Hz) : null
    const confidence = Number.isFinite(clarity) ? clarity : 0
    if (!Number.isFinite(clarity) || clarity < this._clarityGate) {
      return {
        f0Hz: null,
        midi: null,
        confidence,
        rms: frameRms,
      }
    }

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
