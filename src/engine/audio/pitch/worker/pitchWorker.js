import { createDefaultPitchRegistry } from '../registry.js'
import { smoothValue } from '../utils/dspUtils.js'

const registry = createDefaultPitchRegistry()
let currentPlugin = registry.get('pitchy')
let config = {
  windowSize: 2048,
  hopSize: 128,
  rmsGate: 0.01,
  smoothing: false,
}

let prevMidi = null
let prevF0 = null

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
  prevMidi = null
  prevF0 = null
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
    const raw = currentPlugin.detect({ samples: msg.samples, sampleRate: msg.sampleRate })
    if (!raw) return

    let { f0Hz, midi, confidence, rms } = raw

    if (config.smoothing) {
      if (midi == null || f0Hz == null) {
        prevMidi = null
        prevF0 = null
      } else {
        const smoothedMidi = smoothValue(prevMidi, midi, 0.35)
        const smoothedF0 = smoothValue(prevF0, f0Hz, 0.35)
        prevMidi = smoothedMidi
        prevF0 = smoothedF0
        midi = smoothedMidi
        f0Hz = smoothedF0
      }
    }

    const result = {
      tAcSec: Number(msg.tAcSec) || 0,
      f0Hz: f0Hz ?? null,
      midi: midi ?? null,
      confidence: Number.isFinite(confidence) ? confidence : 0,
      rms: Number.isFinite(rms) ? rms : 0,
      algoId: currentPlugin.id,
    }

    self.postMessage({ type: 'pitch', result })
  }
}
