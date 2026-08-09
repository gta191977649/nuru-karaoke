import { describe, expect, it } from 'vitest'
import {
  SCORING_ALGORITHM_VERSION,
  SimpleScoreCalculator,
  getDurationLogError,
  getDurationToleranceLog,
  getLiveF0DisplayMidi,
  getLiveHitDisplayMidi,
  getNoteFragmentJoinToleranceSec,
  getPitchClassDistance,
  normalizePitchClass,
  scorePitchCredit,
} from './SimpleScoreCalculator.js'

function makeReference(notes, beatsPerSecond = 2) {
  return {
    notes,
    getBeatAtTime: (timeSec) => timeSec * beatsPerSecond,
  }
}

function makeNote(t0Sec, t1Sec, midi = 60) {
  return {
    t0Sec,
    t1Sec,
    t0Beat: t0Sec * 2,
    t1Beat: t1Sec * 2,
    midi,
    type: 'normal',
  }
}

function runSamples(calculator, start, end, resolveMidi, options = {}) {
  const step = options.step ?? 0.01
  const transposition = options.transposition ?? 0
  for (let timeSec = start; timeSec <= end + 1e-8; timeSec += step) {
    const midi = resolveMidi(timeSec)
    const rawMidi = typeof options.resolveRawMidi === 'function'
      ? options.resolveRawMidi(timeSec, midi)
      : midi
    const rms = typeof options.resolveRms === 'function' ? options.resolveRms(timeSec) : 0.1
    calculator.process({
      timeSec,
      transposition,
      userPitch: {
        midi: Number.isFinite(midi) ? midi : null,
        rawMidi: Number.isFinite(rawMidi) ? rawMidi : null,
        rms,
        confidence: Number.isFinite(midi) ? 1 : 0,
        rawConfidence: Number.isFinite(rawMidi) ? 1 : 0,
      },
    })
  }
}

function makeCalculator(notes, options = {}) {
  const calculator = new SimpleScoreCalculator()
  calculator.reset(notes, {
    reference: makeReference(notes),
    ...options,
  })
  return calculator
}

describe('allkaraoke pitch-class matching', () => {
  it('publishes the new competitive algorithm version', () => {
    expect(SCORING_ALGORITHM_VERSION).toBe('pitch-v11-log-duration-tolerance')
  })

  it('uses rounded MIDI notes and a hard ±2-semitone hit window', () => {
    expect(scorePitchCredit(60, 60).credit).toBe(1)
    expect(scorePitchCredit(62.49, 60).credit).toBe(1)
    expect(scorePitchCredit(62.5, 60).credit).toBe(0)
    expect(scorePitchCredit(57, 60).credit).toBe(0)
    expect(scorePitchCredit(null, 60).classification).toBe('unvoiced')
  })

  it('finds the shortest modulo-12 distance at pitch-class boundaries', () => {
    expect(getPitchClassDistance(59, 60)).toBe(-1)
    expect(getPitchClassDistance(71, 60)).toBe(-1)
    expect(getPitchClassDistance(65, 60)).toBe(5)
    expect(getPitchClassDistance(66, 60)).toBe(-6)
  })

  it('keeps continuous octave normalization for the existing visual trail', () => {
    expect(normalizePitchClass(36.25, 60)).toMatchObject({
      normalizedMidi: 60.25,
      octaveFoldSemitones: -24,
      centsError: 25,
    })
    expect(normalizePitchClass(71, 60)).toMatchObject({
      normalizedMidi: 59,
      octaveFoldSemitones: 12,
      centsError: -100,
    })
  })

  it('keeps the live white hit marker near the target with relative F0 movement', () => {
    expect(getLiveHitDisplayMidi(36.25, 60)).toBeCloseTo(60.125, 6)
    expect(getLiveHitDisplayMidi(59, 60)).toBeCloseTo(59.5, 6)
    expect(getLiveHitDisplayMidi(62, 60)).toBeCloseTo(60.75, 6)
    expect(getLiveHitDisplayMidi(63, 60)).toBeNull()
    expect(getLiveHitDisplayMidi(null, 60)).toBeNull()
  })

  it('keeps the live F0 marker visible for voiced misses inside a target note', () => {
    expect(getLiveF0DisplayMidi(36.25, 60)).toBeCloseTo(60.125, 6)
    expect(getLiveF0DisplayMidi(63, 60)).toBeCloseTo(60.75, 6)
    expect(getLiveF0DisplayMidi(57, 60)).toBeCloseTo(59.25, 6)
    expect(getLiveF0DisplayMidi(null, 60)).toBeNull()
    expect(getLiveF0DisplayMidi(60, null)).toBeNull()
  })
})

describe('SimpleScoreCalculator pitch-v11-log-duration-tolerance', () => {
  it.each([-36, -24, -12, 0, 12, 24, 36])(
    'accepts the same pitch class at a %s-semitone octave shift',
    (shift) => {
      const note = makeNote(0, 1)
      const calculator = makeCalculator([note])
      runSamples(calculator, 0, 1, () => 60 + shift)

      expect(calculator.finalize(1)).toBeCloseTo(100, 6)
      expect(calculator.getDebugInfo()).toMatchObject({
        octaveShift: 0,
        octavePolicy: 'pitch-class',
        calibrationStatus: 'disabled',
      })
    },
  )

  it('accepts ±2 semitones and rejects ±3 semitones', () => {
    for (const offset of [-2, -1, 0, 1, 2]) {
      const note = makeNote(0, 1)
      const calculator = makeCalculator([note])
      runSamples(calculator, 0, 1, () => 60 + offset)
      expect(calculator.finalize(1)).toBeCloseTo(100, 6)
    }
    for (const offset of [-3, 3]) {
      const note = makeNote(0, 1)
      const calculator = makeCalculator([note])
      runSamples(calculator, 0, 1, () => 60 + offset)
      expect(calculator.finalize(1)).toBe(0)
    }
  })

  it('applies manual transposition before pitch-class matching', () => {
    const note = makeNote(0, 1, 60)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 1, () => 62, { transposition: 2 })

    expect(calculator.finalize(1)).toBeCloseTo(100, 6)
  })

  it('keeps unvoiced time in the whole-song denominator', () => {
    const note = makeNote(0, 2)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 2, (timeSec) => timeSec < 1 ? 60 : null)

    expect(calculator.finalize(2)).toBeGreaterThan(49)
    expect(calculator.getScore()).toBeLessThan(51)
  })

  it('returns zero for an entirely unvoiced performance', () => {
    const note = makeNote(0, 1)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 1, () => null)

    expect(calculator.finalize(1)).toBe(0)
    expect(calculator.getDebugInfo().recentNotes[0].rejectionReason).toBe('unvoiced')
  })

  it('makes relative edge and absolute break tolerance stricter for long notes', () => {
    const calculator = makeCalculator([])

    expect(calculator.getMaxGapSec(makeNote(0, 0.5))).toBeCloseTo(0.095, 6)
    expect(calculator.getMaxGapSec(makeNote(0, 2))).toBeCloseTo(0.068, 6)
    expect(getNoteFragmentJoinToleranceSec(makeNote(0, 1))).toBeCloseTo(0.08, 6)
    expect(calculator.getEdgeToleranceSec(makeNote(0, 0.5))).toBeCloseTo(0.09, 6)
    expect(calculator.getEdgeToleranceSec(makeNote(0, 2))).toBeCloseTo(0.18, 6)
    expect(calculator.getEdgeToleranceSec(makeNote(0, 0.5)) / 0.5)
      .toBeGreaterThan(calculator.getEdgeToleranceSec(makeNote(0, 2)) / 2)
  })

  it('uses symmetric log-ratio errors and lowers duration tolerance for long notes', () => {
    expect(getDurationLogError(1, 0.5)).toBeCloseTo(getDurationLogError(1, 2), 10)
    expect(getDurationToleranceLog(0.2)).toBeGreaterThan(getDurationToleranceLog(2))
  })

  it('bridges an unvoiced gap inside the dynamic break tolerance', () => {
    const note = makeNote(0, 1)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 1, (timeSec) => (
      timeSec >= 0.4 && timeSec <= 0.45 ? null : 60
    ))

    expect(calculator.finalize(1)).toBeCloseTo(100, 6)
    expect(calculator.getDebugInfo().recentNotes[0].stableSegments).toHaveLength(1)
  })

  it('splits an unvoiced gap longer than the dynamic break tolerance', () => {
    const note = makeNote(0, 1)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 1, (timeSec) => (
      timeSec >= 0.4 && timeSec <= 0.49 ? null : 60
    ))

    const score = calculator.finalize(1)
    expect(score).toBeGreaterThan(85)
    expect(score).toBeLessThan(92)
    expect(calculator.getDebugInfo().recentNotes[0].stableSegments).toHaveLength(2)
  })

  it('bridges correct fragments across a wrong-pitch interval inside the dynamic tolerance', () => {
    const note = makeNote(0, 1)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 1, (timeSec) => (
      timeSec >= 0.4 && timeSec <= 0.45 ? 63 : 60
    ))

    expect(calculator.finalize(1)).toBeCloseTo(100, 6)
    expect(calculator.getDebugInfo().recentNotes[0].stableSegments).toHaveLength(1)
  })

  it('splits correct fragments across a wrong-pitch interval beyond the dynamic tolerance', () => {
    const note = makeNote(0, 1)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 1, (timeSec) => (
      timeSec >= 0.4 && timeSec <= 0.49 ? 63 : 60
    ))

    const score = calculator.finalize(1)
    expect(score).toBeGreaterThan(85)
    expect(score).toBeLessThan(92)
    expect(calculator.getDebugInfo().recentNotes[0].stableSegments).toHaveLength(2)
  })

  it('fills the whole note when log duration and center alignment both pass', () => {
    const note = makeNote(0, 1)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 1, (timeSec) => (
      timeSec >= 0.08 && timeSec <= 0.92 ? 60 : null
    ))

    expect(calculator.finalize(1)).toBeCloseTo(100, 6)
    expect(calculator.getDebugInfo().recentNotes[0].stableSegments[0]).toMatchObject({
      t0Sec: 0,
      t1Sec: 1,
    })
    expect(calculator.getDebugInfo().recentNotes[0].filledWholeNote).toBe(true)
  })

  it('does not fill a late onset beyond the log-duration tolerance', () => {
    const note = makeNote(0, 1)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 1, (timeSec) => timeSec >= 0.22 ? 60 : null)

    expect(calculator.finalize(1)).toBeGreaterThan(74)
    expect(calculator.getScore()).toBeLessThan(80)
    expect(calculator.getDebugInfo().recentNotes[0].filledWholeNote).toBe(false)
  })

  it('accepts the same relative shortening on a short note but rejects it on a long note', () => {
    const shortNote = makeNote(0, 0.2)
    const shortCalculator = makeCalculator([shortNote])
    runSamples(shortCalculator, 0, 0.2, (timeSec) => (
      timeSec >= 0.028 && timeSec <= 0.172 ? 60 : null
    ), { step: 0.002 })

    const longNote = makeNote(0, 2)
    const longCalculator = makeCalculator([longNote])
    runSamples(longCalculator, 0, 2, (timeSec) => (
      timeSec >= 0.28 && timeSec <= 1.72 ? 60 : null
    ), { step: 0.002 })

    expect(shortCalculator.finalize(0.2)).toBeCloseTo(100, 6)
    expect(longCalculator.finalize(2)).toBeLessThan(75)
  })

  it('closes adjacent reference notes independently', () => {
    const notes = [
      makeNote(0, 0.5, 60),
      makeNote(0.5, 1, 64),
    ]
    const calculator = makeCalculator(notes)
    runSamples(calculator, 0, 1, (timeSec) => timeSec < 0.5 ? 60 : 64)

    expect(calculator.finalize(1)).toBeCloseTo(100, 6)
    const results = calculator.getDebugInfo().recentNotes
    expect(results[0].stableSegments.at(-1).t1Sec).toBeCloseTo(0.5, 6)
    expect(results[1].stableSegments[0].t0Sec).toBeCloseTo(0.5, 6)
  })

  it('rejects frames below the RMS gate', () => {
    const note = makeNote(0, 1)
    const calculator = makeCalculator([note], { rmsGate: 0.01 })
    runSamples(calculator, 0, 1, () => 60, { resolveRms: () => 0.001 })

    expect(calculator.finalize(1)).toBe(0)
    expect(calculator.getDebugInfo().rejectedRms).toBeGreaterThan(0)
  })

  it('explicitly finalizes a perfect last note without a following frame', () => {
    const note = makeNote(0, 1)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 0.99, () => 60)

    expect(calculator.getScore()).toBe(0)
    expect(calculator.finalize(1)).toBeCloseTo(100, 6)
    expect(calculator.getDebugInfo().pendingNotes).toBe(0)
  })

  it('reports finalized performance separately from the whole-song score', () => {
    const notes = [
      makeNote(0, 1, 60),
      makeNote(2, 3, 60),
      makeNote(4, 5, 60),
      makeNote(6, 7, 60),
    ]
    const calculator = makeCalculator(notes)
    runSamples(calculator, 0, 1.2, (timeSec) => timeSec < 1 ? 60 : null)

    expect(calculator.getScore()).toBeCloseTo(25, 5)
    expect(calculator.getLiveScore()).toBeCloseTo(100, 5)
    expect(calculator.getLiveScoreInfo()).toMatchObject({
      ready: false,
      finalizedNotes: 1,
    })
  })

  it('withholds a short-note result until the full note and decision delay have elapsed', () => {
    const note = makeNote(0, 0.18, 60)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 0.17, () => 60, { step: 0.01 })

    expect(calculator.getVisualState().liveNote.pendingConfirmation).toBe(true)
    expect(calculator.getVisualState().liveNote.stableSegments).toEqual([])
    expect(calculator.getVisualState().confirmedSegments).toEqual([])
    calculator.process({
      timeSec: 0.25,
      userPitch: { midi: null, rawMidi: null, rms: 0, rawConfidence: 0 },
    })
    expect(calculator.getScore()).toBe(0)
    expect(calculator.getVisualState().confirmedSegments).toEqual([])

    calculator.process({
      timeSec: 0.27,
      userPitch: { midi: null, rawMidi: null, rms: 0, rawConfidence: 0 },
    })
    expect(calculator.getScore()).toBeCloseTo(100, 6)
    expect(calculator.getVisualState().confirmedSegments).toHaveLength(1)
    expect(calculator.getVisualState().confirmedSegments[0]).toMatchObject({
      t0Sec: 0,
      t1Sec: 0.18,
    })
  })

  it('publishes a long-note score and its full visual result together after note end', () => {
    const note = makeNote(0, 1, 60)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 1.15, (timeSec) => timeSec < 1 ? 60 : null)

    expect(calculator.getScore()).toBe(0)
    expect(calculator.getVisualState().recentNotes).toEqual([])
    expect(calculator.getVisualState().confirmedSegments).toEqual([])

    calculator.process({
      timeSec: 1.17,
      userPitch: { midi: null, rawMidi: null, rms: 0, rawConfidence: 0 },
    })
    const visual = calculator.getVisualState()
    expect(visual.decisionWindowSec).toBeCloseTo(0.16, 6)
    expect(calculator.getScore()).toBeCloseTo(100, 6)
    expect(visual.recentNotes).toHaveLength(1)
    expect(visual.confirmedSegments).toHaveLength(1)
    expect(visual.confirmedSegments[0]).toMatchObject({
      t0Sec: 0,
      t1Sec: 1,
    })
    expect(visual.pendingDecisionCount).toBe(0)
  })
})
