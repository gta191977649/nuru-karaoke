import { describe, expect, it } from 'vitest'
import { PitchStabilityTracker } from './PitchStabilityTracker.js'

function evaluate(durationSec, resolveMidi, stepSec = 0.02) {
  const tracker = new PitchStabilityTracker(durationSec)
  for (let timeSec = 0; timeSec < durationSec - 1e-8; timeSec += stepSec) {
    const midi = resolveMidi(timeSec)
    const centsError = Number.isFinite(midi) ? (midi - 60) * 100 : null
    tracker.push({
      timeSec,
      endTimeSec: Math.min(durationSec, timeSec + stepSec),
      midi,
      centsError,
      rawCredit: Number.isFinite(midi) && Math.abs(centsError) <= 50 ? 1 : 0,
    })
  }
  return tracker
}

function stableDuration(tracker) {
  return tracker.getEvaluations().reduce((sum, sample) => {
    return sum + (sample.stable ? sample.endTimeSec - sample.timeSec : 0)
  }, 0)
}

describe('PitchStabilityTracker', () => {
  it('accepts a steady target pitch and retroactively confirms its observation window', () => {
    const tracker = evaluate(1, () => 60)
    expect(stableDuration(tracker)).toBeGreaterThanOrEqual(0.9)
    expect(tracker.getDiagnostics().stable).toBe(true)
  })

  it('rejects a one-second monotonic sweep through the target', () => {
    const tracker = evaluate(1, (timeSec) => 56 + 8 * timeSec)
    expect(stableDuration(tracker)).toBe(0)
  })

  it('rejects a short 200ms sweep through the target', () => {
    const tracker = evaluate(0.2, (timeSec) => 58 + 4 * (timeSec / 0.2))
    expect(stableDuration(tracker)).toBe(0)
  })

  it('starts stable scoring only after a glide has landed', () => {
    const tracker = evaluate(1, (timeSec) => timeSec < 0.15 ? 58 + 2 * (timeSec / 0.15) : 60)
    const evaluations = tracker.getEvaluations()
    expect(evaluations.some((sample) => sample.timeSec < 0.14 && sample.stable)).toBe(false)
    expect(evaluations.some((sample) => sample.timeSec >= 0.16 && sample.stable)).toBe(true)
    expect(stableDuration(tracker)).toBeGreaterThan(0.75)
  })

  it('keeps a normal 5Hz, ±30-cent vibrato stable', () => {
    const tracker = evaluate(1, (timeSec) => 60 + 0.3 * Math.sin(2 * Math.PI * 5 * timeSec))
    expect(stableDuration(tracker)).toBeGreaterThan(0.85)
  })

  it('keeps partial pitch credit for borderline wobble without showing a stable hit', () => {
    const tracker = evaluate(1, (timeSec) => {
      const frame = Math.round(timeSec / 0.02)
      return 60 + (frame % 2 === 0 ? -0.5 : 0.5)
    })
    const evaluations = tracker.getEvaluations()
    const peakCredit = Math.max(...evaluations.map((sample) => sample.gatedCredit))

    expect(stableDuration(tracker)).toBe(0)
    expect(peakCredit).toBeGreaterThan(0.5)
    expect(peakCredit).toBeLessThan(0.65)
    expect(evaluations.some((sample) => sample.isHit)).toBe(false)
  })

  it('accepts a small natural drift even when its per-second slope exceeds 80 cents', () => {
    const tracker = evaluate(1, (timeSec) => 60 + timeSec)
    expect(stableDuration(tracker)).toBeGreaterThanOrEqual(0.9)
    expect(Math.abs(tracker.getDiagnostics().trendCentsPerSec)).toBeGreaterThan(80)
    expect(tracker.getDiagnostics().movementCents).toBeLessThan(30)
  })

  it('drops a stable lock immediately for a clear directional pitch step', () => {
    const tracker = new PitchStabilityTracker(1)
    for (let timeSec = 0; timeSec <= 0.4; timeSec += 0.02) {
      tracker.push({ timeSec, endTimeSec: timeSec + 0.02, midi: 60, centsError: 0, rawCredit: 1 })
    }
    const firstDeviation = tracker.push({
      timeSec: 0.42,
      endTimeSec: 0.44,
      midi: 62,
      centsError: 200,
      rawCredit: 0,
    })
    expect(firstDeviation.stable).toBe(false)
    expect(firstDeviation.stableState).toBe('voiced')
    expect(tracker.getDiagnostics().clearDirectionalSlide).toBe(true)
  })
})
