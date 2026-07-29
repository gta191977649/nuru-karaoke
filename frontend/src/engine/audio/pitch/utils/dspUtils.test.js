import { describe, expect, it } from 'vitest'
import { hzToMidi, updateStepAwarePitchSmoother } from './dspUtils.js'

function midiToHz(midi) {
  return 440 * (2 ** ((midi - 69) / 12))
}

function push(state, midi, rawMidi = midi) {
  return updateStepAwarePitchSmoother(state, midiToHz(midi), midiToHz(rawMidi), {
    alpha: 0.5,
    beta: 0.1,
    thresholdCents: 80,
    clusterCents: 45,
    confirmFrames: 2,
  })
}

describe('step-aware pitch smoothing', () => {
  it('does not reset for a single raw pitch spike', () => {
    let state = push(null, 60)
    state = push(state, 67)
    expect(state.reset).toBe(false)
    state = push(state, 60)
    expect(state.reset).toBe(false)
    expect(state.resetCount).toBe(0)
  })

  it('resets on the second coherent frame of a real pitch step', () => {
    let state = push(null, 60)
    state = push(state, 64)
    expect(state.reset).toBe(false)
    state = push(state, 64.1)
    expect(state.reset).toBe(true)
    expect(state.resetCount).toBe(1)
    expect(hzToMidi(state.value)).toBeCloseTo(64.05, 5)
    expect(state.resetCents).toBeGreaterThan(100)
  })

  it('also confirms a one-semitone step against the pre-candidate baseline', () => {
    let state = push(null, 60)
    state = push(state, 61)
    expect(state.reset).toBe(false)
    state = push(state, 61)
    expect(state.reset).toBe(true)
    expect(hzToMidi(state.value)).toBeCloseTo(61, 5)
  })

  it('clears a pending step when the next raw frame is invalid', () => {
    let state = push(null, 60)
    state = push(state, 64)
    state = updateStepAwarePitchSmoother(state, null, null)
    expect(state.value).toBeNull()
    state = push(state, 64)
    expect(state.reset).toBe(false)
  })
})
