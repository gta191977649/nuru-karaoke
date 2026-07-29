function rms(samples) {
  const len = samples?.length || 0
  if (!len) return 0
  let sum = 0
  for (let i = 0; i < len; i += 1) {
    const v = samples[i]
    sum += v * v
  }
  return Math.sqrt(sum / len)
}

function hzToMidi(frequency) {
  const f = Number(frequency)
  if (!Number.isFinite(f) || f <= 0) return null
  return 69 + 12 * Math.log2(f / 440)
}

function centsError(userMidi, targetMidi) {
  const u = Number(userMidi)
  const t = Number(targetMidi)
  if (!Number.isFinite(u) || !Number.isFinite(t)) return null
  return (u - t) * 100
}

function smoothValue(prev, next, alpha = 0.3) {
  const p = Number(prev)
  const n = Number(next)
  if (!Number.isFinite(n)) return null
  if (!Number.isFinite(p)) return n
  const a = Math.max(0, Math.min(1, Number(alpha)))
  return p + (n - p) * a
}

function smoothMovingAverage(state, value, windowSize = 5) {
  if (!state) return { value: Number.isFinite(value) ? value : null, window: [] }
  const nextValue = Number.isFinite(value) ? value : null
  if (nextValue == null) {
    return { value: null, window: [] }
  }
  const nextWindow = Array.isArray(state.window) ? state.window.slice() : []
  nextWindow.push(nextValue)
  while (nextWindow.length > windowSize) nextWindow.shift()
  const sum = nextWindow.reduce((acc, v) => acc + v, 0)
  return {
    value: sum / nextWindow.length,
    window: nextWindow,
  }
}

function pushWindow(window, value, windowSize = 5) {
  const nextWindow = Array.isArray(window) ? window.slice() : []
  if (Number.isFinite(value)) {
    nextWindow.push(value)
  }
  while (nextWindow.length > windowSize) nextWindow.shift()
  return nextWindow
}

function medianOfWindow(window) {
  if (!Array.isArray(window) || window.length === 0) return null
  const sorted = window.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function removeDcOffsetInPlace(frame) {
  const len = frame?.length || 0
  if (!len) return frame
  let sum = 0
  for (let i = 0; i < len; i += 1) sum += frame[i]
  const mean = sum / len
  for (let i = 0; i < len; i += 1) {
    frame[i] -= mean
  }
  return frame
}

function createHpfState(cutoffHz, sampleRate) {
  const cutoff = Number(cutoffHz)
  if (!Number.isFinite(cutoff) || cutoff <= 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return { alpha: 0, x1: 0, y1: 0 }
  }
  const dt = 1 / sampleRate
  const rc = 1 / (2 * Math.PI * cutoff)
  return { alpha: rc / (rc + dt), x1: 0, y1: 0 }
}

function updateHpfState(state, cutoffHz, sampleRate) {
  const next = createHpfState(cutoffHz, sampleRate)
  return { ...next, x1: state?.x1 ?? 0, y1: state?.y1 ?? 0 }
}

function applyHpfInPlace(frame, state) {
  const len = frame?.length || 0
  if (!len) return state
  const alpha = Number(state?.alpha) || 0
  if (alpha <= 0) return state
  let x1 = state?.x1 ?? 0
  let y1 = state?.y1 ?? 0
  for (let i = 0; i < len; i += 1) {
    const x = frame[i]
    const y = alpha * (y1 + x - x1)
    x1 = x
    y1 = y
    frame[i] = y
  }
  return { ...state, x1, y1 }
}


function smoothDoubleExponential(state, value, alpha = 0.5, beta = 0.1) {
  const x = Number(value)
  // If input is invalid (null/NaN), return null but keep state if we want to bridge gaps? 
  // Usually for pitch we break continuity on silence.
  if (!Number.isFinite(x)) {
    return {
      level: null,
      trend: null,
      value: null
    }
  }

  // Initialize
  if (state?.level == null) {
    return {
      level: x,
      trend: 0,
      value: x
    }
  }

  // Holt's Linear Trend Method
  // Level(t) = alpha * value(t) + (1 - alpha) * (Level(t-1) + Trend(t-1))
  // Trend(t) = beta * (Level(t) - Level(t-1)) + (1 - beta) * Trend(t-1)

  const lastLevel = state.level
  const lastTrend = state.trend

  const currentLevel = alpha * x + (1 - alpha) * (lastLevel + lastTrend)
  const currentTrend = beta * (currentLevel - lastLevel) + (1 - beta) * lastTrend

  return {
    level: currentLevel,
    trend: currentTrend,
    value: currentLevel + currentTrend // Forecast or just Level? Usually Level is the smoothed value. 
    // Actually, Level is the smoothed value at time t. 
    // value returned should be currentLevel.
    // Some variants return level+trend as 1-step forecast using it as current estimate.
    // Let's return currentLevel as the smoothed "now" value.
  }
}

function midiToHz(midi) {
  const value = Number(midi)
  if (!Number.isFinite(value)) return null
  return 440 * (2 ** ((value - 69) / 12))
}

function updateStepAwarePitchSmoother(state, valueHz, rawValueHz, options = {}) {
  const alpha = Number.isFinite(options.alpha) ? Number(options.alpha) : 0.5
  const beta = Number.isFinite(options.beta) ? Number(options.beta) : 0.1
  const thresholdCents = Number.isFinite(options.thresholdCents) ? Number(options.thresholdCents) : 80
  const clusterCents = Number.isFinite(options.clusterCents) ? Number(options.clusterCents) : 45
  const confirmFrames = Math.max(2, Math.round(Number(options.confirmFrames) || 2))
  const previous = state || {}
  const value = Number.isFinite(valueHz) ? Number(valueHz) : null
  const rawValue = Number.isFinite(rawValueHz) ? Number(rawValueHz) : null

  if (!Number.isFinite(value)) {
    return {
      ...previous,
      smoothState: smoothDoubleExponential(previous.smoothState, null, alpha, beta),
      pendingMidis: [],
      pendingBaselineMidi: null,
      value: null,
      reset: false,
      resetCents: null,
    }
  }

  const rawMidi = hzToMidi(rawValue)
  const smoothedMidi = hzToMidi(previous.smoothState?.value)
  let pendingBaselineMidi = Number.isFinite(previous.pendingBaselineMidi)
    ? Number(previous.pendingBaselineMidi)
    : smoothedMidi
  const discrepancyCents = Number.isFinite(rawMidi) && Number.isFinite(pendingBaselineMidi)
    ? Math.abs(rawMidi - pendingBaselineMidi) * 100
    : 0
  let pendingMidis = Array.isArray(previous.pendingMidis) ? previous.pendingMidis.slice() : []

  if (Number.isFinite(rawMidi) && discrepancyCents > thresholdCents) {
    const lastPending = pendingMidis[pendingMidis.length - 1]
    if (!Number.isFinite(lastPending) || Math.abs(rawMidi - lastPending) * 100 <= clusterCents) {
      pendingMidis.push(rawMidi)
    } else {
      pendingMidis = [rawMidi]
      pendingBaselineMidi = smoothedMidi
    }
    while (pendingMidis.length > confirmFrames) pendingMidis.shift()

    if (pendingMidis.length >= confirmFrames) {
      const sorted = pendingMidis.slice().sort((a, b) => a - b)
      const middle = Math.floor(sorted.length / 2)
      const resetMidi = sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2
      const resetHz = midiToHz(resetMidi)
      return {
        smoothState: { level: resetHz, trend: 0, value: resetHz },
        pendingMidis: [],
        pendingBaselineMidi: null,
        value: resetHz,
        reset: true,
        resetCents: Number.isFinite(smoothedMidi) ? (resetMidi - smoothedMidi) * 100 : null,
        resetCount: (Number(previous.resetCount) || 0) + 1,
      }
    }
  } else {
    pendingMidis = []
    pendingBaselineMidi = null
  }

  const smoothState = smoothDoubleExponential(previous.smoothState, value, alpha, beta)
  return {
    ...previous,
    smoothState,
    pendingMidis,
    pendingBaselineMidi,
    value: smoothState.value,
    reset: false,
    resetCents: null,
    resetCount: Number(previous.resetCount) || 0,
  }
}

export {
  rms,
  hzToMidi,
  centsError,
  smoothValue,
  smoothMovingAverage,
  pushWindow,
  medianOfWindow,
  smoothDoubleExponential,
  updateStepAwarePitchSmoother,
}
export { removeDcOffsetInPlace, createHpfState, updateHpfState, applyHpfInPlace }
