import { createDefaultPitchRegistry } from '../registry.js'
import { DEFAULT_CONFIG } from '../../../audioEngine.js'
import { hzToMidi, rms, smoothMovingAverage, pushWindow, medianOfWindow } from '../utils/dspUtils.js'

const registry = createDefaultPitchRegistry()
let currentPlugin = registry.get(DEFAULT_CONFIG.pitchAlgoId || 'pitchy')
let config = { ...DEFAULT_CONFIG }

const smoothWindowSize = 5
let smoothState = { value: null, window: [] }
let stabilityState = {
  window: [],
  lastStableF0: null,
  lastStableMidi: null,
  holdLeft: 0,
}

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
  stabilityState = { window: [], lastStableF0: null, lastStableMidi: null, holdLeft: 0 }
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
    const f0MinHz = Number(config.f0MinHz)
    const f0MaxHz = Number(config.f0MaxHz)
    const medianWindowSize = Number.isFinite(config.medianWindowSize) ? config.medianWindowSize : 5
    const maxJumpSemitones = Number.isFinite(config.maxJumpSemitones) ? config.maxJumpSemitones : 3
    const holdFrames = Number.isFinite(config.holdFrames) ? config.holdFrames : 2
    let usedHold = false

    const isValidRange =
      Number.isFinite(f0Hz) &&
      (!Number.isFinite(f0MinHz) || f0Hz >= f0MinHz) &&
      (!Number.isFinite(f0MaxHz) || f0Hz <= f0MaxHz)
    f0Hz = isValidRange ? f0Hz : null

    if (Number.isFinite(f0Hz)) {
      stabilityState.window = pushWindow(stabilityState.window, f0Hz, medianWindowSize)
      const medianF0 = medianOfWindow(stabilityState.window)
      f0Hz = Number.isFinite(medianF0) ? medianF0 : f0Hz

      const candidateMidi = hzToMidi(f0Hz)
      if (
        Number.isFinite(candidateMidi) &&
        Number.isFinite(stabilityState.lastStableMidi) &&
        Math.abs(candidateMidi - stabilityState.lastStableMidi) > maxJumpSemitones
      ) {
        f0Hz = null
      } else {
        stabilityState.lastStableF0 = f0Hz
        stabilityState.lastStableMidi = candidateMidi
        stabilityState.holdLeft = holdFrames
      }
    }

    if (!Number.isFinite(f0Hz)) {
      if (stabilityState.holdLeft > 0 && Number.isFinite(stabilityState.lastStableF0)) {
        f0Hz = stabilityState.lastStableF0
        usedHold = true
        stabilityState.holdLeft -= 1
      } else {
        stabilityState.holdLeft = 0
      }
    }

    if (config.smoothing) {
      smoothState = smoothMovingAverage(smoothState, f0Hz, smoothWindowSize)
      f0Hz = smoothState.value
    }
    const midi = Number.isFinite(f0Hz) ? hzToMidi(f0Hz) : raw?.midi ?? null

    const result = {
      tAcSec: Number(msg.tAcSec) || 0,
      f0Hz: f0Hz ?? null,
      midi: midi ?? null,
      confidence: usedHold || !Number.isFinite(f0Hz) ? 0 : Number.isFinite(confidence) ? confidence : 0,
      rms: frameRms,
      algoId: currentPlugin.id,
    }

    self.postMessage({ type: 'pitch', result })
  }
}
