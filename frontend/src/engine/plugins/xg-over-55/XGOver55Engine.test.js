import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { BasicMIDI, MIDIPatchTools, SoundBankLoader } from 'spessasynth_core'
import { MIDI_DB_REVISION, XG_DRUM_KITS } from './data/midiDb.generated.js'
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
    expect(result.version).toBe(2)
    expect(result.drumChannels[9]).toBe(1)
    expect(result.state).toMatchObject({
      conversionEngine: 'xg-over-55',
      detectedStandard: 'XG',
      xgVoiceProfile: 'conservative',
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

  it('uses the XG default drum bank on part 10 when bank select is omitted', () => {
    const mapper = createXGOver55EventMapper(createXgMidi(), { drumBalanceProfile: 'off' })
    mapper({
      type: 'sysex',
      data: Uint8Array.from([0xf0, 0x43, 0x10, 0x4c, 0, 0, 0x7e, 0, 0xf7]),
    })
    mapper({ type: 'program', channel: 9, value: 0 })
    expect(mapper({ type: 'note_on', channel: 9, note: 29, velocity: 64 }).at(-1)).toEqual({
      type: 'note_on', channel: 9, note: 38, velocity: 64,
    })
  })

  it('sanitizes XG variation banks and supports the two reviewed wide approximations', () => {
    const mapper = createXGOver55EventMapper(createXgMidi())
    mapper({ type: 'cc', channel: 0, controller: 0, value: 0 })
    mapper({ type: 'cc', channel: 0, controller: 32, value: 8 })
    expect(mapper({ type: 'program', channel: 0, value: 1 })).toEqual([
      { type: 'cc', channel: 0, controller: 0, value: 0 },
      { type: 'cc', channel: 0, controller: 32, value: 0 },
      { type: 'program', channel: 0, value: 1 },
    ])

    mapper({ type: 'cc', channel: 1, controller: 0, value: 0 })
    mapper({ type: 'cc', channel: 1, controller: 32, value: 3 })
    expect(mapper({ type: 'program', channel: 1, value: 1 })).toEqual([
      { type: 'cc', channel: 1, controller: 0, value: 0 },
      { type: 'cc', channel: 1, controller: 32, value: 8 },
      { type: 'program', channel: 1, value: 1 },
    ])
    expect(mapper({ type: 'program', channel: 1, value: 6 })).toEqual([
      { type: 'cc', channel: 1, controller: 0, value: 0 },
      { type: 'cc', channel: 1, controller: 32, value: 16 },
      { type: 'program', channel: 1, value: 6 },
    ])
    expect(mapper.getState()).toMatchObject({
      midiDbRevision: MIDI_DB_REVISION,
      voiceExactCount: 2,
      voiceFallbackCount: 1,
    })
  })

  it('maps XG SFX voice blocks and can preserve legacy bank behavior', () => {
    const mapper = createXGOver55EventMapper(createXgMidi())
    for (const [channel, program] of [[0, 0], [1, 16], [2, 127]]) {
      mapper({ type: 'cc', channel, controller: 0, value: 64 })
      mapper({ type: 'cc', channel, controller: 32, value: 0 })
      expect(mapper({ type: 'program', channel, value: program }).at(-1).value)
        .toBe(120 + Math.floor(program / 16))
    }

    const passthrough = createXGOver55EventMapper(createXgMidi(), { xgVoiceProfile: 'passthrough' })
    const bank = { type: 'cc', channel: 0, controller: 32, value: 8 }
    const program = { type: 'program', channel: 0, value: 1 }
    expect(passthrough(bank)).toEqual([bank])
    expect(passthrough(program)).toEqual([program])
    expect(passthrough.getState().voiceFallbackCount).toBe(0)
  })

  it('routes data-listed and unknown XG drum kits through safe SC-55 profiles', () => {
    const mapper = createXGOver55EventMapper(createXgMidi(), { drumBalanceProfile: 'off' })
    mapper({ type: 'cc', channel: 9, controller: 0, value: 127 })
    mapper({ type: 'cc', channel: 9, controller: 32, value: 0 })
    expect(mapper({ type: 'program', channel: 9, value: 87 }).at(-1)).toEqual({
      type: 'program', channel: 9, value: 16,
    })
    expect(mapper({ type: 'program', channel: 9, value: 127 }).at(-1)).toEqual({
      type: 'program', channel: 9, value: 0,
    })
    expect(Object.keys(XG_DRUM_KITS).some((key) => key.endsWith(':87'))).toBe(true)
    expect(mapper.getState().drumAliasCount).toBe(2)
  })

  it('resolves every data-listed bank 127 kit to an available SC-55 drum program', () => {
    const targetPrograms = new Set([0, 8, 16, 24, 25, 32, 40, 48])
    for (const key of Object.keys(XG_DRUM_KITS)) {
      const [lsb, program] = key.split(':').map(Number)
      const mapper = createXGOver55EventMapper(createXgMidi(), { drumBalanceProfile: 'off' })
      mapper({ type: 'cc', channel: 9, controller: 0, value: 127 })
      mapper({ type: 'cc', channel: 9, controller: 32, value: lsb })
      const output = mapper({ type: 'program', channel: 9, value: program })
      expect(targetPrograms.has(output.at(-1).value), key).toBe(true)
    }
  })

  it('does not boost derived Brush profiles', () => {
    const mapper = createXGOver55EventMapper(createXgMidi())
    mapper({ type: 'cc', channel: 9, controller: 0, value: 127 })
    mapper({ type: 'program', channel: 9, value: 82 })
    expect(mapper({ type: 'note_on', channel: 9, note: 36, velocity: 64 }).at(-1).velocity).toBe(64)
  })

  it('normalizes XG Part Setup bank/program SysEx through the same resolver', () => {
    const mapper = createXGOver55EventMapper(createXgMidi())
    const sysex = (parameter, value) => ({
      type: 'sysex',
      time: 1.25,
      data: Uint8Array.from([0xf0, 0x43, 0x10, 0x4c, 0x08, 0x00, parameter, value, 0xf7]),
    })
    expect(mapper(sysex(1, 0))).toEqual([])
    expect(mapper(sysex(2, 8))).toEqual([])
    expect(mapper(sysex(3, 1))).toEqual([
      { type: 'cc', channel: 0, controller: 0, value: 0 },
      { type: 'cc', channel: 0, controller: 32, value: 0 },
      { type: 'program', channel: 0, value: 1 },
    ])
    expect(mapper.getState()).toMatchObject({
      convertedXgSysexCount: 3,
      voiceFallbackCount: 1,
    })
  })

  it('reports named native, converted, filtered, and unknown SysEx telemetry', () => {
    const mapper = createXGOver55EventMapper(createXgMidi())
    const sysex = (address1, address2, address3, ...data) => ({
      type: 'sysex',
      time: 2,
      data: Uint8Array.from([0xf0, 0x43, 0x10, 0x4c, address1, address2, address3, ...data, 0xf7]),
    })
    expect(mapper(sysex(0, 0, 4, 100))).toHaveLength(1)
    expect(mapper(sysex(2, 1, 0, 2, 0))[0].data[1]).toBe(0x41)
    expect(mapper(sysex(2, 1, 0x40, 1, 0))).toEqual([])
    expect(mapper(sysex(5, 0, 1, 1))).toEqual([])
    const state = mapper.getState()
    expect(state).toMatchObject({
      nativeXgSysexCount: 1,
      convertedXgSysexCount: 1,
      filteredXgSysexCount: 2,
      unknownXgSysexCount: 1,
    })
    expect(state.translationTimeline.map((entry) => entry.source)).toEqual([
      'system.master.volume',
      'effect.global.reverbType',
      'effect.global.mfxType',
      'model4c.5.0.1',
    ])
  })

  it('only emits target presets that exist in the bundled SC-55 SoundFont', async () => {
    const bytes = await readFile(new URL('../../../soundfont/sc55.sf2', import.meta.url))
    const soundBank = SoundBankLoader.fromArrayBuffer(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    )
    const presets = new Set(soundBank.presets
      .filter((preset) => !preset.isGMGSDrum)
      .map((preset) => `${preset.bankMSB}:${preset.program}`))
    expect(presets.has('8:1')).toBe(true)
    expect(presets.has('16:6')).toBe(true)
    for (let program = 0; program < 128; program += 1) expect(presets.has(`0:${program}`)).toBe(true)

    const selected = MIDIPatchTools.selectPatch(soundBank.presets, {
      bankMSB: 0,
      bankLSB: 8,
      program: 1,
      isGMGSDrum: false,
    }, 'xg')
    expect(selected).toMatchObject({ name: 'Piano 2w', bankMSB: 8, program: 1 })
  })
})
