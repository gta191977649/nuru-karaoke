import { createDefaultPitchRegistry } from '../registry.js'
import { DEFAULT_CONFIG } from '../../../audioEngine.js'
import { hzToMidi, rms, smoothMovingAverage } from '../utils/dspUtils.js'

const registry = createDefaultPitchRegistry()
let currentPlugin = registry.get(DEFAULT_CONFIG.pitchAlgoId || 'pitchy')
let config = { ...DEFAULT_CONFIG }

const smoothWindowSize = 5
let smoothState = { value: null, window: [] }

function applyConfig(nextCfg) {
  config = { ...config, ...nextCfg }
  if (currentPlugin?.configure) currentPlugin.configure(config)
}

function setAlgo(algoId) {
  const next = registry.get(algoId)
  if (!next) return
  currentPlugin = next
  if (currentPlugin?.configure) currentPlugin.configure(config)
  if (currentPlugin?.reset) currentPlugin.reset()
  smoothState = { value: null, window: [] }
}

self.onmessage = (event) => {
  const msg = event.data
  if (!msg?.type) return

  if (msg.type === 'config') {
    applyConfig(msg.cfg || {})
    return
  }

  if (msg.type === 'setAlgo') {
    setAlgo(msg.algoId)
    return
  }

  if (msg.type === 'frame') {
    if (!currentPlugin?.detect) return
    const frameRms = rms(msg.samples)
    if (Number.isFinite(config.rmsGate) && frameRms < config.rmsGate) {
      const result = {
        tAcSec: Number(msg.tAcSec) || 0,
        f0Hz: null,
        midi: null,
        confidence: 0,
        rms: frameRms,
        algoId: currentPlugin.id,
      }
      self.postMessage({ type: 'pitch', result })
      return
    }
    const raw = currentPlugin.detect({ samples: msg.samples, sampleRate: msg.sampleRate })
    if (!raw) return

    let { f0Hz, confidence } = raw

    if (config.smoothing) {
      smoothState = smoothMovingAverage(smoothState, f0Hz, smoothWindowSize)
      f0Hz = smoothState.value
    }
    const midi = Number.isFinite(f0Hz) ? hzToMidi(f0Hz) : raw?.midi ?? null

    const result = {
      tAcSec: Number(msg.tAcSec) || 0,
      f0Hz: f0Hz ?? null,
      midi: midi ?? null,
      confidence: Number.isFinite(confidence) ? confidence : 0,
      rms: frameRms,
      algoId: currentPlugin.id,
    }

    self.postMessage({ type: 'pitch', result })
  }
}
