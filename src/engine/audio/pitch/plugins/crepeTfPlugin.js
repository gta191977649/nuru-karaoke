import * as tf from '@tensorflow/tfjs'
import { hzToMidi, rms } from '../utils/dspUtils.js'

const MODEL_URL = new URL('../model/crepe/model.json', import.meta.url).toString()
const CREPE_SAMPLE_RATE = 16000
const CREPE_FRAME_SIZE = 1024
const CREPE_CENT_MIN = 1997.3794084376191
const CREPE_CENT_RANGE = 7180
const CREPE_BINS = 360

let tfReadyPromise = null
let centMapping = null

function ensureTfReady() {
  if (!tfReadyPromise) {
    tfReadyPromise = (async () => {
      await tf.setBackend('cpu')
      await tf.ready()
      centMapping = tf.add(tf.linspace(0, CREPE_CENT_RANGE, CREPE_BINS), tf.scalar(CREPE_CENT_MIN))
    })()
  }
  return tfReadyPromise
}

class CrepeTfPlugin {
  constructor() {
    this.id = 'crepe-tf'
    this.name = 'CREPE (TF)'
    this._rmsGate = 0.01
    this._confidenceGate = 0.5
    this._model = null
    this._modelPromise = null
  }

  configure(cfg) {
    const gate = Number(cfg?.rmsGate)
    if (Number.isFinite(gate)) this._rmsGate = gate
    const confGate = Number(cfg?.crepeConfidenceThreshold)
    if (Number.isFinite(confGate)) this._confidenceGate = confGate
  }

  detect(frame) {
    const samples = frame?.samples
    const sampleRate = Number(frame?.sampleRate)
    if (!samples || !Number.isFinite(sampleRate)) return null

    if (!this._model) {
      this._ensureModel()
      return null
    }

    const resampled = this._resampleToCrepe(samples, sampleRate)
    const frameRms = rms(resampled)
    if (frameRms < this._rmsGate) {
      return {
        f0Hz: null,
        midi: null,
        confidence: 0,
        rms: frameRms,
      }
    }

    const { f0Hz, confidence } = this._predict(resampled)
    if (!Number.isFinite(f0Hz) || confidence < this._confidenceGate) {
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
  }

  reset() {
    this._model = null
    this._modelPromise = null
  }

  _ensureModel() {
    if (this._modelPromise) return
    this._modelPromise = (async () => {
      await ensureTfReady()
      this._model = await tf.loadLayersModel(MODEL_URL)
      return this._model
    })()
  }

  _predict(resampled) {
    let confidence = 0
    let predictedHz = null
    tf.tidy(() => {
      const frame = tf.tensor1d(resampled)
      const mean = tf.mean(frame)
      const centered = tf.sub(frame, mean)
      const norm = tf.norm(centered).dataSync()[0] / Math.sqrt(CREPE_FRAME_SIZE)
      const normalized = norm > 0 ? tf.div(centered, tf.scalar(norm)) : centered
      const input = normalized.reshape([1, CREPE_FRAME_SIZE])
      const activation = this._model.predict(input).reshape([CREPE_BINS])

      confidence = activation.max().dataSync()[0] || 0
      const center = activation.argMax().dataSync()[0] || 0
      const start = Math.max(0, center - 4)
      const end = Math.min(CREPE_BINS, center + 5)
      const weights = activation.slice([start], [end - start])
      const cents = centMapping.slice([start], [end - start])

      const products = tf.mul(weights, cents)
      const productSum = products.dataSync().reduce((sum, v) => sum + v, 0)
      const weightSum = weights.dataSync().reduce((sum, v) => sum + v, 0)
      const predictedCent = weightSum > 0 ? productSum / weightSum : null
      if (Number.isFinite(predictedCent)) {
        predictedHz = 10 * Math.pow(2, predictedCent / 1200)
      }
    })
    return { f0Hz: predictedHz, confidence }
  }

  _resampleToCrepe(samples, sampleRate) {
    const result = new Float32Array(CREPE_FRAME_SIZE)
    const multiplier = sampleRate / CREPE_SAMPLE_RATE
    const input = samples
    const inputLen = input.length
    for (let i = 0; i < CREPE_FRAME_SIZE; i += 1) {
      const idx = i * multiplier
      const left = Math.floor(idx)
      const right = Math.min(left + 1, inputLen - 1)
      const frac = idx - left
      const leftVal = input[left] || 0
      const rightVal = input[right] || 0
      result[i] = leftVal + (rightVal - leftVal) * frac
    }
    return result
  }
}

export { CrepeTfPlugin }
