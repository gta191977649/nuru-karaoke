import { describe, expect, it } from 'vitest'
import { estimateMidiInitialGainDb } from './midiGainEstimator.js'

const event = (ticks, statusByte, ...data) => ({ ticks, statusByte, data: Uint8Array.from(data) })
const midi = (...events) => ({ tracks: [{ events }] })
const unclamped = { renderedReferenceDb: -20, minGainDb: -30, maxGainDb: 30 }

describe('MIDI initial gain estimation', () => {
  it('accounts for time-weighted polyphony', () => {
    const mono = estimateMidiInitialGainDb(midi(
      event(0, 0x90, 60, 127),
      event(480, 0x80, 60, 0),
    ), unclamped)
    const poly = estimateMidiInitialGainDb(midi(
      event(0, 0x90, 60, 127),
      event(0, 0x91, 64, 127),
      event(480, 0x80, 60, 0),
      event(480, 0x81, 64, 0),
    ), unclamped)

    expect(mono.noteCount).toBe(1)
    expect(poly.noteCount).toBe(2)
    expect(poly.gainDb).toBeCloseTo(mono.gainDb - 3.0103, 3)
  })

  it('uses CC7 and CC11 values active at each note', () => {
    const fullVolume = estimateMidiInitialGainDb(midi(
      event(0, 0xb0, 7, 127),
      event(0, 0xb0, 11, 127),
      event(0, 0x90, 60, 100),
      event(480, 0x80, 60, 0),
    ), unclamped)
    const quiet = estimateMidiInitialGainDb(midi(
      event(0, 0xb0, 7, 64),
      event(0, 0xb0, 11, 64),
      event(0, 0x90, 60, 100),
      event(480, 0x80, 60, 0),
    ), unclamped)

    expect(quiet.gainDb).toBeGreaterThan(fullVolume.gainDb + 11)
  })

  it('ignores silent spans between musical sections', () => {
    const continuous = estimateMidiInitialGainDb(midi(
      event(0, 0x90, 60, 100),
      event(480, 0x80, 60, 0),
    ), unclamped)
    const withLongIntro = estimateMidiInitialGainDb(midi(
      event(9600, 0x90, 60, 100),
      event(10080, 0x80, 60, 0),
    ), unclamped)

    expect(withLongIntro.gainDb).toBeCloseTo(continuous.gainDb, 6)
  })

  it('returns null when the MIDI has no audible notes', () => {
    expect(estimateMidiInitialGainDb(midi(event(0, 0xb0, 7, 100)))).toBeNull()
  })
})
