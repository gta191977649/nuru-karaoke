import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { BasicMIDI, MIDIPatchTools, SoundBankLoader } from 'spessasynth_core'
import { detectDrumChannels, MIDI_STANDARDS } from '../../MidiStandardDetector.js'
import { createMidiMapper } from '../../MidiMapper.js'
import { convertGsMidiBuffer, createGSOver55EventMapper, GSOver55Engine, resolveSc55GsTone } from './GSOver55Engine.js'
import { SC55_MELODIC_PRESETS, SC55_SOUNDFONT_SHA256 } from './data/sc55Presets.generated.js'

function midiFromTrack(track) {
  const length = track.length
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0x60,
    0x4d, 0x54, 0x72, 0x6b,
    (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff,
    ...track,
  ]).buffer
}

function createTelephoneGsMidi(bank = 5) {
  return midiFromTrack([
    0x00, 0xf0, 0x0a, 0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7,
    0x00, 0xba, 0x00, bank,
    0x00, 0xba, 0x20, 0x00,
    0x00, 0xca, 0x7c,
    0x00, 0x9a, 0x56, 0x40,
    0x60, 0x8a, 0x56, 0x00,
    0x00, 0xff, 0x2f, 0x00,
  ])
}

describe('GSOver55Engine', () => {
  it('normalizes the Roland Telephone fixture to the real capital preset', () => {
    const source = createTelephoneGsMidi()
    expect(GSOver55Engine.canHandle(source)).toBe(true)
    const result = convertGsMidiBuffer(source, { fileName: 'telephone.mid' })
    const midi = BasicMIDI.fromArrayBuffer(result.buffer, 'telephone.mid')
    const channel11 = midi.timeline
      .map(({ tr, ev }) => midi.tracks[tr].events[ev])
      .filter((event) => (event.statusByte & 0x0f) === 10 && event.statusByte < 0xf0)
      .map((event) => [event.statusByte, ...event.data])

    expect(channel11).toEqual([
      [0xba, 0, 0], [0xba, 32, 0], [0xca, 124],
      [0x9a, 86, 64], [0x8a, 86, 0],
    ])
    expect(result.state).toMatchObject({
      conversionEngine: 'gs-over-55',
      gsVariationFallbackCount: 1,
      gsLegacyMapFallbackCount: 0,
    })
    expect(result.telemetry.translationTimeline[0]).toMatchObject({
      sourceBankMSB: 5,
      targetBankMSB: 0,
      targetProgram: 124,
      target: 'Telephone 1 (B0 P125)',
    })
  })

  it('is selected by the public MidiMapper API for plain GS files', () => {
    const mapper = createMidiMapper(createTelephoneGsMidi(), { gsToneProfile: 'compatible' })
    expect(mapper.getState()).toMatchObject({
      detectedStandard: 'GS',
      conversionEngine: 'gs-over-55',
      gsToneProfile: 'compatible',
    })
  })

  it('keeps exact variations and selects the nearest lower available SC-55 variation', () => {
    expect(resolveSc55GsTone(8, 1)).toMatchObject({ name: 'Piano 2w', bank: 8, exact: true })
    expect(resolveSc55GsTone(12, 1)).toMatchObject({ name: 'Piano 2w', bank: 8, exact: false })
    expect(resolveSc55GsTone(5, 126)).toMatchObject({ name: 'Applause', bank: 0, exact: false })
  })

  it('treats GS bank 126/127 as melodic legacy maps, never drum inference', () => {
    for (const bank of [126, 127]) {
      const buffer = createTelephoneGsMidi(bank)
      expect(detectDrumChannels(buffer, { standard: MIDI_STANDARDS.GS })[10]).toBe(0)
      const result = convertGsMidiBuffer(buffer)
      expect(result.drumChannels[10]).toBe(0)
      expect(result.gsLegacyMapFallbackCount).toBe(1)
      expect(result.gsDrumMisclassificationPreventedCount).toBe(1)
    }
  })

  it('keeps bank-based drum inference specific to XG and GM2', () => {
    expect(detectDrumChannels(createTelephoneGsMidi(127), { standard: MIDI_STANDARDS.XG })[10]).toBe(1)
    expect(detectDrumChannels(createTelephoneGsMidi(126), { standard: MIDI_STANDARDS.XG })[10]).toBe(1)
    expect(detectDrumChannels(createTelephoneGsMidi(120), { standard: MIDI_STANDARDS.GM2 })[10]).toBe(1)
    expect(detectDrumChannels(createTelephoneGsMidi(127), { standard: MIDI_STANDARDS.GM })[10]).toBe(0)
  })

  it('lets GS Part Mode enable and explicitly disable a rhythm part', () => {
    const mapper = createGSOver55EventMapper(createTelephoneGsMidi())
    const partMode = (value) => ({
      type: 'sysex',
      data: Uint8Array.from([0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x1a, 0x15, value, 0, 0xf7]),
    })
    mapper(partMode(1))
    expect(mapper.getState().drumChannels[10]).toBe(1)
    mapper(partMode(0))
    expect(mapper.getState().drumChannels[10]).toBe(0)
    mapper({ type: 'cc', channel: 10, controller: 0, value: 127 })
    expect(mapper.getState().drumChannels[10]).toBe(0)
  })

  it('preserves every byte-level event in passthrough mode', () => {
    const mapper = createGSOver55EventMapper(createTelephoneGsMidi(), { gsToneProfile: 'passthrough' })
    const events = [
      { type: 'cc', channel: 10, controller: 0, value: 5 },
      { type: 'cc', channel: 10, controller: 32, value: 0 },
      { type: 'program', channel: 10, value: 124 },
    ]
    for (const event of events) expect(mapper(event)).toEqual([event])
    expect(mapper.getState()).toMatchObject({ gsToneProfile: 'passthrough', gsVariationFallbackCount: 0 })
  })

  it('keeps the generated capability snapshot in sync with the bundled SoundFont', async () => {
    expect(SC55_SOUNDFONT_SHA256).toMatch(/^[a-f0-9]{64}$/)
    const bytes = await readFile(new URL('../../../soundfont/sc55.sf2', import.meta.url))
    const bank = SoundBankLoader.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    const actual = bank.presets.filter((preset) => !preset.isGMGSDrum)
      .map((preset) => `${preset.bankMSB}:${preset.program}:${preset.name}`)
      .sort()
    const snapshot = SC55_MELODIC_PRESETS.map((preset) => `${preset.bank}:${preset.program}:${preset.name}`).sort()
    expect(snapshot).toEqual(actual)
    const telephone = MIDIPatchTools.selectPatch(bank.presets, {
      bankMSB: 0, bankLSB: 0, program: 124, isGMGSDrum: false,
    }, 'gs')
    expect(telephone.name).toBe('Telephone 1')
  })
})
