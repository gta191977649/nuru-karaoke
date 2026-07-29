import { describe, expect, it } from 'vitest'
import {
  SCORING_ALGORITHM_VERSION,
  SimpleScoreCalculator,
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
    expect(SCORING_ALGORITHM_VERSION).toBe('pitch-v9-allkaraoke-dynamic-join')
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
})

describe('SimpleScoreCalculator pitch-v9-allkaraoke-dynamic-join', () => {
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

  it('derives fragment-join and edge tolerances from each note duration', () => {
    const calculator = makeCalculator([])

    expect(calculator.getMaxGapSec(makeNote(0, 0.5))).toBeCloseTo(0.1, 6)
    expect(calculator.getMaxGapSec(makeNote(0, 2))).toBeCloseTo(0.4, 6)
    expect(getNoteFragmentJoinToleranceSec(makeNote(0, 1))).toBeCloseTo(0.2, 6)
    expect(calculator.getEdgeToleranceSec(makeNote(0, 0.5))).toBeCloseTo(0.05, 6)
    expect(calculator.getEdgeToleranceSec(makeNote(0, 2))).toBeCloseTo(0.2, 6)
  })

  it('bridges an unvoiced gap within 20% of the note duration', () => {
    const note = makeNote(0, 1)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 1, (timeSec) => (
      timeSec >= 0.4 && timeSec <= 0.56 ? null : 60
    ))

    expect(calculator.finalize(1)).toBeCloseTo(100, 6)
    expect(calculator.getDebugInfo().recentNotes[0].stableSegments).toHaveLength(1)
  })

  it('splits an unvoiced gap longer than 20% of the note duration', () => {
    const note = makeNote(0, 1)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 1, (timeSec) => (
      timeSec >= 0.4 && timeSec <= 0.62 ? null : 60
    ))

    const score = calculator.finalize(1)
    expect(score).toBeGreaterThan(70)
    expect(score).toBeLessThan(82)
    expect(calculator.getDebugInfo().recentNotes[0].stableSegments).toHaveLength(2)
  })

  it('bridges correct fragments across a wrong-pitch interval within the note ratio', () => {
    const note = makeNote(0, 1)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 1, (timeSec) => (
      timeSec >= 0.4 && timeSec <= 0.56 ? 63 : 60
    ))

    expect(calculator.finalize(1)).toBeCloseTo(100, 6)
    expect(calculator.getDebugInfo().recentNotes[0].stableSegments).toHaveLength(1)
  })

  it('splits correct fragments across a wrong-pitch interval beyond the note ratio', () => {
    const note = makeNote(0, 1)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 1, (timeSec) => (
      timeSec >= 0.4 && timeSec <= 0.62 ? 63 : 60
    ))

    const score = calculator.finalize(1)
    expect(score).toBeGreaterThan(70)
    expect(score).toBeLessThan(82)
    expect(calculator.getDebugInfo().recentNotes[0].stableSegments).toHaveLength(2)
  })

  it('rounds hits near both edges using the note-duration ratio', () => {
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
  })

  it('does not round a late onset beyond the note-duration ratio', () => {
    const note = makeNote(0, 1)
    const calculator = makeCalculator([note])
    runSamples(calculator, 0, 1, (timeSec) => timeSec >= 0.12 ? 60 : null)

    expect(calculator.finalize(1)).toBeGreaterThan(86)
    expect(calculator.getScore()).toBeLessThan(89)
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
