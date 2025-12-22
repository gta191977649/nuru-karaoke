import { createDefaultPitchRegistry } from '../registry.js'

const registry = createDefaultPitchRegistry()
let currentPlugin = registry.get('pitchy')
let config = {
  windowSize: 2048,
  hopSize: 128,
  rmsGate: 0.01,
  clarityGate: 0.3,
  smoothing: true,
}

const smoothWindowSize = 5
let recentMidi = []
let recentF0 = []

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
  recentMidi = []
  recentF0 = []
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
        recentMidi = []
        recentF0 = []
      } else {
        recentMidi.push(midi)
        recentF0.push(f0Hz)
        if (recentMidi.length > smoothWindowSize) recentMidi.shift()
        if (recentF0.length > smoothWindowSize) recentF0.shift()
        const sumMidi = recentMidi.reduce((sum, value) => sum + value, 0)
        const sumF0 = recentF0.reduce((sum, value) => sum + value, 0)
        midi = sumMidi / recentMidi.length
        f0Hz = sumF0 / recentF0.length
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
