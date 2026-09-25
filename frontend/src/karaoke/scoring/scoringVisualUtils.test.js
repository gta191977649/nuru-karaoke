import { describe, expect, it } from 'vitest'
import { SimpleScoreCalculator } from './SimpleScoreCalculator.js'
import {
  getConfirmedSegmentFillEnd,
  getLivePitchTrailSegments,
  getNearestNoteMidiAtTime,
  getStableHitTargetMidi,
  getStableLandingDuration,
  getTechniqueResolutionTime,
  hasStableTechniqueLanding,
  mergeConfirmedSpans,
  smoothLiveMarkerPosition,
  countValidatedTechniqueEvents,
  getTechniqueNote,
  getVibratoCandidateNote,
  hasConfirmedNoteHit,
  isTechniqueEventValid,
} from './scoringVisualUtils.js'

describe('validated technique counts', () => {
  const notes = [
    { t0Sec: 1, t1Sec: 2, midi: 60 },
    { t0Sec: 2, t1Sec: 3, midi: 62 },
  ]
  const confirmed = [
    { t0Sec: 1.1, t1Sec: 1.9, noteId: 'merged-note' },
    { t0Sec: 2.1, t1Sec: 2.9, noteId: 'second-note' },
  ]

  it('counts one vibrato per note when any part of that note has a yellow hit', () => {
    const events = [
      { type: 'vibrato', start: 1.4, end: 1.8, t: 1.6, centerMidi: 72 },
      { type: 'vibrato', start: 1.5, end: 1.9, t: 1.7, centerMidi: 48 },
      { type: 'vibrato', start: 2.3, end: 2.7, t: 2.5, centerMidi: 74 },
    ]
    const distantHits = [
      { t0Sec: 1.1, t1Sec: 1.2 },
      { t0Sec: 2.8, t1Sec: 2.9 },
    ]
    expect(countValidatedTechniqueEvents(events, notes, distantHits).vibrato).toBe(2)
    expect(countValidatedTechniqueEvents(events, notes, []).vibrato).toBe(0)
  })

  it('does not borrow a yellow hit from an adjacent note at the boundary', () => {
    const event = { type: 'vibrato', start: 2.05, end: 2.4, t: 2.2 }
    const note = getTechniqueNote(event, notes)
    expect(note).toBe(notes[1])
    expect(hasConfirmedNoteHit(note, [{ t0Sec: 1.8, t1Sec: 2 }])).toBe(false)
    expect(countValidatedTechniqueEvents([event], notes, [{ t0Sec: 1.8, t1Sec: 2 }]).vibrato).toBe(0)
  })

  it('uses the scorer yellow-hit policy for octave-equivalent transposed singing', () => {
    const note = { t0Sec: 0, t1Sec: 1, t0Beat: 0, t1Beat: 2, midi: 60, type: 'normal' }
    const calculator = new SimpleScoreCalculator()
    calculator.reset([note], { reference: { notes: [note], getBeatAtTime: time => time * 2 } })
    for (let frame = 0; frame <= 120; frame++) {
      const timeSec = frame / 100
      const midi = timeSec < 1 ? 74 : null // Target 60 + 2 semitones, sung one octave higher.
      calculator.process({
        timeSec,
        transposition: 2,
        userPitch: { midi, rawMidi: midi, rms: midi == null ? 0 : 0.1, rawConfidence: midi == null ? 0 : 1 },
      })
    }
    const yellowHits = calculator.getVisualState().confirmedSegments
    expect(yellowHits.length).toBeGreaterThan(0)
    expect(countValidatedTechniqueEvents([
      { type: 'vibrato', start: 0.3, end: 0.7, t: 0.5, centerMidi: 74 },
    ], [note], yellowHits).vibrato).toBe(1)
  })

  it('keeps slide validation tied to its stable landing', () => {
    expect(isTechniqueEventValid(
      { type: 'glissup', t: 1.6 }, notes[0], confirmed,
    )).toBe(true)
    expect(isTechniqueEventValid(
      { type: 'glissdown', t: 2.8 }, notes[1], confirmed,
    )).toBe(true)
    expect(isTechniqueEventValid(
      { type: 'glissdown', t: 2.1 }, notes[1], confirmed,
    )).toBe(false)
  })
})

describe('vibrato candidate note effect', () => {
  const notes = [
    { t0Sec: 1, t1Sec: 2, midi: 60 },
    { t0Sec: 2, t1Sec: 3, midi: 62 },
  ]

  it('follows only the latest active vibrato candidate within its note', () => {
    const first = { type: 'vibrato', t: 1.4 }
    const second = { type: 'vibrato', t: 2.3 }
    expect(getVibratoCandidateNote([first], notes, 1.6, true)).toBe(notes[0])
    expect(getVibratoCandidateNote([first], notes, 1.6, false)).toBeNull()
    expect(getVibratoCandidateNote([first], notes, 2, true)).toBeNull()
    expect(getVibratoCandidateNote([first, { type: 'kobushi', t: 1.8 }, second], notes, 2.5, true)).toBe(notes[1])
    expect(getVibratoCandidateNote([], notes, 2.5, true)).toBeNull()
  })
})

describe('nearest note visual anchor', () => {
  const notes = [
    { t0Sec: 1, t1Sec: 2, midi: 60 },
    { t0Sec: 2.3, t1Sec: 3, midi: 64 },
  ]

  it('uses the active note and remains anchored inside a between-note scoring gap', () => {
    expect(getNearestNoteMidiAtTime(notes, 1.5)).toBe(60)
    expect(getNearestNoteMidiAtTime(notes, 2.1)).toBe(60)
    expect(getNearestNoteMidiAtTime(notes, 2.2)).toBe(64)
  })

  it('returns null without a usable time or note', () => {
    expect(getNearestNoteMidiAtTime([], 2)).toBeNull()
    expect(getNearestNoteMidiAtTime(notes, null)).toBeNull()
  })
})

describe('live F0 trail', () => {
  it('draws voiced history immediately and fades older segments', () => {
    const segments = getLivePitchTrailSegments([
      { t: 8, userMidi: 60, rms: 0.1 },
      { t: 8.1, userMidi: 60.2, rms: 0.1 },
      { t: 9.9, userMidi: 61, rms: 0.1 },
      { t: 10, userMidi: 61.1, rms: 0.1 },
    ], 10, { durationSec: 2, maxGapSec: 0.15 })

    expect(segments).toHaveLength(2)
    expect(segments[0].alpha).toBeLessThan(segments[1].alpha)
    expect(segments[1]).toMatchObject({
      t0Sec: 9.9,
      t1Sec: 10,
      midi0: 61,
      midi1: 61.1,
      alpha: 1,
    })
  })

  it('breaks the trail across silence, low RMS, and long detector gaps', () => {
    const segments = getLivePitchTrailSegments([
      { t: 1, userMidi: 60, rms: 0.1 },
      { t: 1.1, userMidi: null, rms: 0 },
      { t: 1.2, userMidi: 60.2, rms: 0.1 },
      { t: 1.3, userMidi: 60.3, rms: 0.005 },
      { t: 1.4, userMidi: 60.4, rms: 0.1 },
      { t: 1.7, userMidi: 60.5, rms: 0.1 },
    ], 1.7, { durationSec: 2, rmsGate: 0.01, maxGapSec: 0.15 })

    expect(segments).toEqual([])
  })
})

describe('live marker smoothing', () => {
  it('starts at the target and approaches later positions smoothly', () => {
    expect(smoothLiveMarkerPosition(null, 100, 0.016)).toBe(100)
    const next = smoothLiveMarkerPosition(100, 80, 0.016)
    expect(next).toBeLessThan(100)
    expect(next).toBeGreaterThan(80)
    expect(smoothLiveMarkerPosition(next, 80, 0.5)).toBeCloseTo(80, 1)
  })

  it('returns null without a valid target position', () => {
    expect(smoothLiveMarkerPosition(100, null, 0.016)).toBeNull()
  })
})

describe('confirmed fragment merging', () => {
  const spans = [
    { t0: 0, t1: 0.4, showAt: 1 },
    { t0: 0.58, t1: 1, showAt: 1 },
  ]

  it('joins nearby fragments with the note-relative tolerance', () => {
    expect(mergeConfirmedSpans(spans, 0.2)).toEqual([
      { t0: 0, t1: 1, showAt: 1 },
    ])
  })

  it('keeps fragments separate when their gap exceeds the tolerance', () => {
    expect(mergeConfirmedSpans(spans, 0.15)).toHaveLength(2)
  })
})

describe('confirmed segment fill animation', () => {
  const segment = { t0Sec: 2, t1Sec: 3, confirmedAtSec: 4 }

  it('starts at the left edge and advances toward the right edge', () => {
    expect(getConfirmedSegmentFillEnd(segment, 4, 1.5)).toBe(2)
    expect(getConfirmedSegmentFillEnd(segment, 4.2, 1.5)).toBeCloseTo(2.3, 6)
    expect(getConfirmedSegmentFillEnd(segment, 5, 1.5)).toBe(3)
  })

  it('keeps legacy confirmed segments fully visible', () => {
    expect(getConfirmedSegmentFillEnd({ t0Sec: 2, t1Sec: 3 }, 2.5, 1.5)).toBe(3)
    expect(getConfirmedSegmentFillEnd({}, 2.5, 1.5)).toBeNull()
  })
})

describe('stable-hit target position', () => {
  it('uses the scored note height instead of the detected F0 height', () => {
    const segment = { noteId: 'note-1', midi: 60 }
    const results = [{ noteId: 'note-1', note: { midi: 64 } }]

    expect(getStableHitTargetMidi(segment, results, 2)).toBe(66)
  })

  it('falls back to the segment target and applies transposition', () => {
    expect(getStableHitTargetMidi({ midi: 60 }, [], -2)).toBe(58)
    expect(getStableHitTargetMidi({}, [], 0)).toBeNull()
  })
})

describe('stable technique landing', () => {
  it('accepts at least 80ms of stable target hit within 250ms', () => {
    const segments = [{ t0Sec: 1.12, t1Sec: 1.22 }]
    expect(getStableLandingDuration(segments, 1)).toBeCloseTo(0.1, 6)
    expect(hasStableTechniqueLanding(segments, 1)).toBe(true)
  })

  it('rejects a brief crossing and a landing after the deadline', () => {
    expect(hasStableTechniqueLanding([{ t0Sec: 1.08, t1Sec: 1.13 }], 1)).toBe(false)
    expect(hasStableTechniqueLanding([{ t0Sec: 1.26, t1Sec: 1.4 }], 1)).toBe(false)
  })

  it('sums adjacent confirmed stable segments inside the landing window', () => {
    const segments = [
      { t0Sec: 2.05, t1Sec: 2.1 },
      { t0Sec: 2.11, t1Sec: 2.15 },
    ]
    expect(hasStableTechniqueLanding(segments, 2)).toBe(true)
  })

  it('waits for delayed visual confirmation before expiring a technique event', () => {
    expect(getTechniqueResolutionTime(1, 1.22)).toBeCloseTo(1.38, 6)
    expect(getTechniqueResolutionTime(1, 1.22, 0.08)).toBeCloseTo(1.3, 6)
    expect(getTechniqueResolutionTime(1, 1.1)).toBeCloseTo(1.26, 6)
  })
})
