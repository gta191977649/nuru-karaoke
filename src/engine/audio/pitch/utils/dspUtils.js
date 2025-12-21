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

export { rms, hzToMidi, centsError, smoothValue }
