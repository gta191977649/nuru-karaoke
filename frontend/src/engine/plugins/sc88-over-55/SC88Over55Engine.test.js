import { describe, expect, it } from 'vitest'
import { BasicMIDI } from 'spessasynth_core'
import { readFile } from 'node:fs/promises'
import {
  convertSc88MidiBuffer,
  createSC88Over55EventMapper,
  resolveSc88Tone,
  SC88Over55Engine,
} from './SC88Over55Engine.js'

const regressionMidiPath = globalThis.process?.env?.SC88_REGRESSION_MIDI

function trackChunk(events) {
  const length = events.length
  return [
    0x4d, 0x54, 0x72, 0x6b,
    (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff,
    ...events,
  ]
}

function createTwoPortSc88Midi(map = 2) {
  const conductor = [
    0, 0xf0, 10, 0x41, 0x10, 0x42, 0x12, 0x40, 0, 0x7f, 0, 0x41, 0xf7,
    0, 0xf0, 10, 0x41, 0x10, 0x42, 0x12, 0x50, 0x1a, 0x15, 2, 0x7f, 0xf7,
    0, 0xff, 0x2f, 0,
  ]
  const port0 = [
    0, 0xff, 0x21, 1, 0,
    0, 0xb0, 0, 8, 0, 0xb0, 32, map, 0, 0xc0, 1,
    0, 0x90, 60, 80, 96, 0x80, 60, 0,
    0, 0xff, 0x2f, 0,
  ]
  const port1 = [
    0, 0xff, 0x21, 1, 1,
    0, 0xb0, 0, 5, 0, 0xb0, 32, map, 0, 0xc0, 124,
    0, 0x90, 86, 64, 96, 0x80, 86, 0,
    0, 0xff, 0x2f, 0,
  ]
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 3, 0, 0x60,
    ...trackChunk(conductor), ...trackChunk(port0), ...trackChunk(port1),
  ]).buffer
}

function gsData(address1, address2, address3, values = []) {
  return {
    type: 'sysex',
    data: Uint8Array.from([
      0xf0, 0x41, 0x10, 0x42, 0x12, address1, address2, address3, ...values, 0, 0xf7,
    ]),
  }
}

describe('SC88Over55Engine', () => {
  it('accepts Map 2/3 modules but leaves SC-8850 Map 4 alone', () => {
    expect(SC88Over55Engine.canHandle(createTwoPortSc88Midi(2))).toBe(true)
    expect(SC88Over55Engine.canHandle(createTwoPortSc88Midi(3))).toBe(true)
    expect(SC88Over55Engine.canHandle(createTwoPortSc88Midi(4))).toBe(false)
    expect(convertSc88MidiBuffer(createTwoPortSc88Midi(3)).sourceModule).toBe('88PRO')
  })

  it('resolves reviewed shared voices and deterministic capital fallbacks', () => {
    expect(resolveSc88Tone(2, 8, 1)).toMatchObject({
      bank: 8, program: 1, name: 'Piano 2w', curated: true,
    })
    expect(resolveSc88Tone(2, 5, 124)).toMatchObject({
      bank: 0, program: 124, name: 'Telephone 1', reason: 'source-variation-fallback',
    })
    expect(resolveSc88Tone(2, 8, 1, { sc88ToneProfile: 'conservative' })).toMatchObject({
      bank: 0, program: 1, reason: 'capital-fallback',
    })
    expect(resolveSc88Tone(2, 8, 1, { sc88ToneProfile: 'passthrough' })).toMatchObject({
      bank: 8, map: 2, program: 1, reason: 'passthrough',
    })
  })

  it('keeps same-numbered channels on two MIDI ports independent', () => {
    const source = createTwoPortSc88Midi()
    expect(SC88Over55Engine.canHandle(source)).toBe(true)
    const result = convertSc88MidiBuffer(source, { fileName: 'two-port.mid' })
    const midi = BasicMIDI.fromArrayBuffer(result.buffer, 'two-port.mid')
    const programs = midi.tracks.slice(1).map((track) => track.events
      .filter((event) => (event.statusByte & 0xf0) === 0xc0)
      .map((event) => event.data[0]))

    expect(programs).toEqual([[1], [124]])
    expect(result).toMatchObject({ conversionApplied: true, sourceModule: '88', partCount: 32 })
    expect(result.telemetry.translationTimeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ logicalPart: 0, target: expect.stringContaining('Piano 2w') }),
      expect.objectContaining({ logicalPart: 16, target: expect.stringContaining('Telephone 1') }),
    ]))
    expect(Array.from(result.telemetry.partActivity[0].velocities)).toEqual([80])
    expect(Array.from(result.telemetry.partActivity[16].velocities)).toEqual([64])
  })

  it('handles the 0x40 and 0x50 rhythm-part blocks independently', () => {
    const mapper = createSC88Over55EventMapper()
    mapper(gsData(0x40, 0x10, 0x15, [0]))
    mapper(gsData(0x50, 0x1a, 0x15, [2]))
    const state = mapper.getState()
    expect(state.drumParts[9]).toBe(0)
    expect(state.drumParts[26]).toBe(1)

    mapper(gsData(0x50, 0x1a, 0x15, [0]))
    expect(mapper.getState().drumParts[26]).toBe(0)
  })

  it('resolves User Tone base patches and consumes their unsupported modifiers', () => {
    const mapper = createSC88Over55EventMapper()
    mapper(gsData(0x20, 0x00, 5, [2]))
    mapper(gsData(0x20, 0x01, 5, [8]))
    mapper(gsData(0x20, 0x02, 5, [1]))
    mapper({ type: 'cc', channel: 0, controller: 0, value: 64 })
    mapper({ type: 'cc', channel: 0, controller: 32, value: 2 })
    expect(mapper({ type: 'program', channel: 0, value: 5 })).toEqual([
      { type: 'cc', channel: 0, controller: 0, value: 8 },
      { type: 'cc', channel: 0, controller: 32, value: 1 },
      { type: 'program', channel: 0, value: 1 },
    ])
    expect(mapper.getState()).toMatchObject({
      userToneResolvedCount: 1, toneCuratedCount: 1, filteredGsSysexCount: 3,
    })

    const undefinedUserTone = createSC88Over55EventMapper()
    undefinedUserTone({ type: 'cc', channel: 0, controller: 0, value: 65 })
    undefinedUserTone({ type: 'cc', channel: 0, controller: 32, value: 2 })
    expect(undefinedUserTone({ type: 'program', channel: 0, value: 28 }).at(-1)).toEqual({
      type: 'program', channel: 0, value: 28,
    })
    expect(undefinedUserTone.getState().translationTimeline.at(-1).reason).toBe('user-tone-undefined')
  })

  it('maps User Drum source kit, note and level before dynamic balance', () => {
    const mapper = createSC88Over55EventMapper()
    const row = (value) => Array.from({ length: 128 }, (_, note) => note === 36 ? value : 0)
    mapper(gsData(0x29, 0x08, 0, row(2)))
    mapper(gsData(0x29, 0x09, 0, row(0)))
    mapper(gsData(0x29, 0x0a, 0, row(36)))
    mapper(gsData(0x29, 0x01, 0, row(64)))
    mapper({ type: 'program', channel: 9, value: 64 })

    expect(mapper({ type: 'note_on', channel: 9, note: 36, velocity: 100 }).at(-1)).toEqual({
      type: 'note_on', channel: 9, note: 36, velocity: 61,
    })
    expect(mapper({ type: 'note_off', channel: 9, note: 36, velocity: 7 })).toEqual([
      { type: 'note_off', channel: 9, note: 36, velocity: 7 },
    ])
    expect(mapper.getState().userDrumMappedCount).toBe(1)
  })

  it('passes supported GS effects, consumes user bulk and filters unknown Roland data', () => {
    const mapper = createSC88Over55EventMapper()
    const native = gsData(0x40, 0x01, 0x30, [2])
    expect(mapper(native)).toEqual([native])
    expect(mapper(gsData(0x29, 0x0b, 0, [83, 84, 65, 78, 68, 65, 82, 68, 32, 49]))).toEqual([])
    expect(mapper(gsData(0x60, 0, 0, [1]))).toEqual([])
    expect(mapper.getState()).toMatchObject({
      nativeGsSysexCount: 1, filteredGsSysexCount: 2, unknownGsSysexCount: 1,
    })

    const passthrough = createSC88Over55EventMapper({ sc88EffectProfile: 'passthrough' })
    const unknown = gsData(0x60, 0, 0, [1])
    expect(passthrough(unknown)).toEqual([unknown])
    const userBulk = gsData(0x29, 0x0b, 0, [83, 84, 65, 78, 68, 65, 82, 68, 32, 49])
    expect(passthrough(userBulk)).toEqual([userBulk])
  })

  it.runIf(Boolean(regressionMidiPath))(
    'preserves the structure of the opt-in 32-part regression song',
    async () => {
      const bytes = await readFile(regressionMidiPath)
      const sourceBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      const source = BasicMIDI.fromArrayBuffer(sourceBuffer, 'sc88-regression.mid')
      const result = convertSc88MidiBuffer(sourceBuffer.slice(0), { fileName: 'sc88-regression.mid' })
      const target = BasicMIDI.fromArrayBuffer(result.buffer, 'sc88-regression-converted.mid')
      const eventSignature = (midi, status) => midi.timeline
        .map(({ tr, ev }) => ({ tr, event: midi.tracks[tr].events[ev] }))
        .filter(({ event }) => status(event))
        .map(({ tr, event }) => [tr, event.ticks])
      const noteOn = ({ statusByte, data }) => (statusByte & 0xf0) === 0x90 && data[1] > 0
      const structuralMeta = ({ statusByte }) => [0x05, 0x06, 0x51].includes(statusByte)

      expect(source.tracks).toHaveLength(27)
      expect(eventSignature(source, noteOn)).toHaveLength(20329)
      expect(eventSignature(target, noteOn)).toEqual(eventSignature(source, noteOn))
      expect(eventSignature(target, structuralMeta)).toEqual(eventSignature(source, structuralMeta))
      const finalTick = (midi) => Math.max(...midi.timeline.map(({ tr, ev }) => midi.tracks[tr].events[ev].ticks))
      expect(target.midiTicksToSeconds(finalTick(target)))
        .toBeCloseTo(source.midiTicksToSeconds(finalTick(source)), 6)
      expect(result.sourceModule).toBe('88')
      expect(result.partCount).toBe(32)
      expect(result.drumParts[9]).toBe(1)
      expect(result.drumParts[26]).toBe(1)
      expect(result.userDrumMappedCount).toBeGreaterThan(0)
      expect(result.state.userDrumNames[0]).toContain('STANDARD 1')
      expect(result.telemetry.translationTimeline).toEqual(expect.arrayContaining([
        expect.objectContaining({ target: expect.stringContaining('Piano 2w') }),
        expect.objectContaining({ target: expect.stringContaining('Telephone 1') }),
      ]))
    },
    30000,
  )
})
