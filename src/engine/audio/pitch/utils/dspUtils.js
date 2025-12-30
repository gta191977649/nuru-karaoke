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

export { rms, hzToMidi, centsError, smoothValue, smoothMovingAverage, pushWindow, medianOfWindow }
export { removeDcOffsetInPlace, createHpfState, updateHpfState, applyHpfInPlace }
