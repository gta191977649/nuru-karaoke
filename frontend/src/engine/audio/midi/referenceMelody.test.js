import { describe, expect, it } from 'vitest'
import { extractReferenceMelodyFromMidiData } from './referenceMelody.js'

function makeSerializedMidi(dataFactory = (values) => values) {
  return {
    timeDivision: 480,
    duration: 1,
    tempoChanges: [{ ticks: 0, tempo: 120 }],
    tracks: [
      {
        events: [
          {
            ticks: 0,
            statusByte: 0x90,
            data: dataFactory([60, 100]),
          },
          {
            ticks: 480,
            statusByte: 0x80,
            data: dataFactory([60, 0]),
          },
        ],
      },
    ],
  }
}

describe('extractReferenceMelodyFromMidiData', () => {
  it('uses raw MIDI events when a serialized MIDI object has no getNoteTimes method', () => {
    const reference = extractReferenceMelodyFromMidiData(makeSerializedMidi(), { channel: 0 })

    expect(reference.notes).toHaveLength(1)
    expect(reference.notes[0]).toMatchObject({
      midi: 60,
      channel: 0,
      t0Tick: 0,
      t1Tick: 480,
      t0Sec: 0,
      t1Sec: 0.5,
    })
  })

  it('accepts SpessaSynth-style array-like event data', () => {
    const reference = extractReferenceMelodyFromMidiData(
      makeSerializedMidi((values) => ({ 0: values[0], 1: values[1], length: 2 })),
      { channel: 0 },
    )

    expect(reference.notes).toHaveLength(1)
    expect(reference.notes[0].midi).toBe(60)
  })
})
