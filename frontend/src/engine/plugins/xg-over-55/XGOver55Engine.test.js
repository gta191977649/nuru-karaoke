import { describe, expect, it } from 'vitest'
import { BasicMIDI } from 'spessasynth_core'
import { convertXgMidiBuffer, createXGOver55EventMapper, XGOver55Engine } from './XGOver55Engine.js'

function createXgMidi() {
  const track = [
    0x00, 0xf0, 0x08, 0x43, 0x10, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7,
    0x00, 0xff, 0x03, 0x04, 0x54, 0x65, 0x73, 0x74,
    0x00, 0xb9, 0x00, 0x7f,
    0x00, 0xc9, 0x00,
    0x00, 0x99, 0x24, 0x40,
    0x60, 0x89, 0x24, 0x00,
    0x00, 0xff, 0x2f, 0x00,
  ]
  const length = track.length
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0x60,
    0x4d, 0x54, 0x72, 0x6b,
    (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff,
    ...track,
  ]).buffer
}

describe('XGOver55Engine', () => {
  it('detects XG input and rejects ordinary SMF input', () => {
    const xg = createXgMidi()
    expect(XGOver55Engine.canHandle(xg)).toBe(true)
    const bytes = new Uint8Array(xg.slice(0))
    bytes[28] = 0x7e
    expect(XGOver55Engine.canHandle(bytes.buffer)).toBe(false)
  })

  it('converts a complete MIDI while preserving metadata and building telemetry', () => {
    const result = convertXgMidiBuffer(createXgMidi(), { fileName: 'test.mid' })
    const midi = BasicMIDI.fromArrayBuffer(result.buffer, 'test.mid')
    const channelEvents = midi.timeline
      .map(({ tr, ev }) => midi.tracks[tr].events[ev])
      .filter((event) => event.statusByte >= 0x80 && event.statusByte < 0xf0)

    expect(result.conversionApplied).toBe(true)
    expect(result.version).toBe(1)
    expect(result.drumChannels[9]).toBe(1)
    expect(result.state).toMatchObject({
      conversionEngine: 'xg-over-55',
      detectedStandard: 'XG',
    })
    expect(midi.tracks[0].events.some((event) =>
      event.statusByte === 0x03 && Array.from(event.data).join(',') === '84,101,115,116')).toBe(true)
    expect(channelEvents.map((event) => [event.ticks, event.statusByte, ...event.data])).toEqual([
      [0, 0xb9, 0, 127],
      [0, 0xc9, 0],
      [0, 0x99, 36, 73],
      [96, 0x89, 36, 0],
    ])
    expect(Array.from(result.telemetry.activity[9].velocities)).toEqual([73])
    expect(Array.from(result.telemetry.polyphonyCounts)).toEqual([1, 0])
  })

  it('keeps the event mapper available for realtime and maintenance use', () => {
    const mapper = createXGOver55EventMapper(createXgMidi(), { drumBalanceProfile: 'off' })
    mapper({ type: 'cc', channel: 9, controller: 0, value: 127 })
    mapper({ type: 'program', channel: 9, value: 0 })
    expect(mapper({ type: 'note_on', channel: 9, note: 36, velocity: 64 }))
      .toEqual([{ type: 'note_on', channel: 9, note: 36, velocity: 64 }])
  })
})
