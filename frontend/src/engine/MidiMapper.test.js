import { describe, expect, it } from 'vitest'
import { createMidiMapper } from './MidiMapper.js'

function createXgSystemOnMidi() {
    return Uint8Array.from([
        // MThd, format 0, one track, 96 PPQN
        0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x60,
        // MTrk: XG System On followed by End of Track
        0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x0f,
        0x00, 0xf0, 0x08, 0x43, 0x10, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7,
        0x00, 0xff, 0x2f, 0x00,
    ]).buffer
}

function createSc88Midi() {
    const track = [
        // GS Reset
        0x00, 0xf0, 0x0a, 0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7,
        // An address in the SC-88 second-module block identifies an SC-88-class file.
        0x00, 0xf0, 0x0a, 0x41, 0x10, 0x42, 0x12, 0x50, 0x1a, 0x15, 0x02, 0x7f, 0xf7,
        // Enable Drum 2 on channel 11.
        0x00, 0xf0, 0x0a, 0x41, 0x10, 0x42, 0x12, 0x40, 0x1a, 0x15, 0x02, 0x0f, 0xf7,
        0x00, 0xff, 0x2f, 0x00,
    ]
    const trackLength = track.length
    return Uint8Array.from([
        0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x60,
        0x4d, 0x54, 0x72, 0x6b,
        (trackLength >>> 24) & 0xff, (trackLength >>> 16) & 0xff,
        (trackLength >>> 8) & 0xff, trackLength & 0xff,
        ...track,
    ]).buffer
}

describe('XG to SC-55 mapping', () => {
    it('maps supported XG reverb and chorus types to checksummed GS SysEx', () => {
        const mapper = createMidiMapper(createXgSystemOnMidi())
        const cases = [
            [[0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x00, 0x02, 0x00, 0xf7],
                [0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x30, 0x00, 0x0f, 0xf7]],
            [[0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x00, 0x02, 0x01, 0xf7],
                [0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x30, 0x01, 0x0e, 0xf7]],
            [[0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x00, 0x02, 0x02, 0xf7],
                [0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x30, 0x02, 0x0d, 0xf7]],
            [[0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x00, 0x01, 0x00, 0xf7],
                [0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x30, 0x03, 0x0c, 0xf7]],
            [[0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x00, 0x01, 0x01, 0xf7],
                [0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x30, 0x04, 0x0b, 0xf7]],
            [[0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x00, 0x04, 0x00, 0xf7],
                [0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x30, 0x05, 0x0a, 0xf7]],
            [[0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x20, 0x41, 0x00, 0xf7],
                [0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x38, 0x00, 0x07, 0xf7]],
            [[0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x20, 0x41, 0x01, 0xf7],
                [0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x38, 0x01, 0x06, 0xf7]],
            [[0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x20, 0x41, 0x02, 0xf7],
                [0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x38, 0x02, 0x05, 0xf7]],
            [[0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x20, 0x41, 0x08, 0xf7],
                [0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x38, 0x03, 0x04, 0xf7]],
            [[0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x20, 0x43, 0x00, 0xf7],
                [0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x38, 0x05, 0x02, 0xf7]],
            [[0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x20, 0x43, 0x01, 0xf7],
                [0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x38, 0x05, 0x02, 0xf7]],
        ]

        for (const [source, destination] of cases) {
            const events = mapper({ type: 'sysex', data: Uint8Array.from(source) })
            expect(events).toHaveLength(1)
            expect(Array.from(events[0].data)).toEqual(destination)
        }
    })

    it('maps XG reverb time with the SC-55 curve and clamps its boundaries', () => {
        const mapper = createMidiMapper(createXgSystemOnMidi())
        const convert = (value) => Array.from(mapper({
            type: 'sysex',
            data: Uint8Array.from([0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x02, value, 0xf7]),
        })[0].data)

        expect(convert(0)).toEqual([0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x34, 0x00, 0x0b, 0xf7])
        expect(convert(40)).toEqual([0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x34, 80, 0x3b, 0xf7])
        expect(convert(127)).toEqual([0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x01, 0x34, 127, 0x0c, 0xf7])
    })

    it('passes native-supported XG controls and filters unsupported XG effects', () => {
        const mapper = createMidiMapper(createXgSystemOnMidi())
        const nativeMessages = [
            [0xf0, 0x43, 0x10, 0x4c, 0x00, 0x00, 0x04, 100, 0xf7],
            [0xf0, 0x43, 0x10, 0x4c, 0x08, 0x00, 0x18, 90, 0xf7],
            [0xf0, 0x43, 0x10, 0x4c, 0x30, 36, 0x02, 100, 0xf7],
        ]
        for (const bytes of nativeMessages) {
            const event = { type: 'sysex', data: Uint8Array.from(bytes) }
            expect(mapper(event)).toEqual([event])
        }

        const unsupported = { type: 'sysex', data: Uint8Array.from([
            0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x40, 0x01, 0x00, 0xf7,
        ]) }
        const universal = { type: 'sysex', data: Uint8Array.from([
            0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7,
        ]) }
        expect(mapper(unsupported)).toEqual([])
        expect(mapper(universal)).toEqual([universal])
        expect(mapper.getState()).toMatchObject({
            xgEffectProfile: 'compatible',
            filteredXgSysexCount: 1,
        })
    })

    it('supports XG effect passthrough and preserves standard channel controls', () => {
        const mapper = createMidiMapper(createXgSystemOnMidi(), { xgEffectProfile: 'passthrough' })
        const unsupported = { type: 'sysex', data: Uint8Array.from([
            0xf0, 0x43, 0x10, 0x4c, 0x02, 0x01, 0x40, 0x01, 0x00, 0xf7,
        ]) }
        expect(mapper(unsupported)).toEqual([unsupported])

        for (const controller of [7, 10, 11, 91, 93, 101, 100, 6]) {
            const event = { type: 'cc', channel: 0, controller, value: 77 }
            expect(mapper(event)).toEqual([event])
        }
        const pitch = { type: 'pitch', channel: 0, value: 9000 }
        expect(mapper(pitch)).toEqual([pitch])
        expect(mapper.getState()).toMatchObject({
            xgEffectProfile: 'passthrough',
            filteredXgSysexCount: 0,
        })
    })

    it('applies the moderate drum balance curve by destination note', () => {
        const mapper = createMidiMapper(createXgSystemOnMidi())
        mapper({ type: 'cc', channel: 9, controller: 0, value: 127 })
        mapper({ type: 'program', channel: 9, value: 0 })

        const expectedByNote = new Map([
            [36, [44, 73, 103, 118, 127]],
            [38, [41, 71, 102, 118, 127]],
            [45, [38, 69, 102, 118, 127]],
            [46, [36, 68, 101, 118, 127]],
            [49, [35, 67, 101, 118, 127]],
            [56, [30, 64, 100, 118, 127]],
        ])
        const inputVelocities = [30, 64, 100, 118, 127]

        for (const [note, expectedVelocities] of expectedByNote) {
            const actual = inputVelocities.map((velocity) => mapper({
                type: 'note_on', channel: 9, note, velocity,
            })[0].velocity)
            expect(actual).toEqual(expectedVelocities)
            expect(actual).toEqual([...actual].sort((a, b) => a - b))
        }
    })

    it('can disable drum balancing without changing mapped notes', () => {
        const mapper = createMidiMapper(createXgSystemOnMidi(), { drumBalanceProfile: 'off' })
        mapper({ type: 'cc', channel: 9, controller: 0, value: 127 })
        mapper({ type: 'program', channel: 9, value: 0 })

        expect(mapper({ type: 'note_on', channel: 9, note: 31, velocity: 64 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 38, velocity: 64 }])
        expect(mapper({ type: 'note_off', channel: 9, note: 31, velocity: 0 }))
            .toEqual([{ type: 'note_off', channel: 9, note: 38, velocity: 0 }])
    })

    it('leaves channel 1 voices untouched while remapping Room Kit snare and bass drum notes', () => {
        const mapper = createMidiMapper(createXgSystemOnMidi())

        expect(mapper.getState()).toMatchObject({
            detectedStandard: 'XG',
            configName: 'XGSC55.CFG',
            mappingDestination: 'Roland SC-55',
        })

        expect(mapper({ type: 'cc', channel: 0, controller: 0, value: 0 })).toEqual([
            { type: 'cc', channel: 0, controller: 0, value: 0 },
        ])
        expect(mapper({ type: 'cc', channel: 0, controller: 32, value: 0 })).toEqual([
            { type: 'cc', channel: 0, controller: 32, value: 0 },
        ])
        expect(mapper({ type: 'program', channel: 0, value: 0 })).toEqual([
            { type: 'cc', channel: 0, controller: 0, value: 0 },
            { type: 'cc', channel: 0, controller: 32, value: 0 },
            { type: 'program', channel: 0, value: 0 },
        ])
        expect(mapper({ type: 'cc', channel: 0, controller: 7, value: 100 })).toEqual([
            { type: 'cc', channel: 0, controller: 7, value: 100 },
        ])
        expect(mapper({ type: 'note_on', channel: 0, note: 60, velocity: 96 })).toEqual([
            { type: 'note_on', channel: 0, note: 60, velocity: 96 },
        ])

        mapper({ type: 'program', channel: 9, value: 8 })

        expect(mapper({ type: 'note_on', channel: 9, note: 31, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 38, velocity: 99 }])
        expect(mapper({ type: 'note_on', channel: 9, note: 33, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 36, velocity: 100 }])
    })

    it('waits for the MIDI to redeclare a non-default drum channel after XG System On', () => {
        const initialDrumChannels = new Uint8Array(16)
        initialDrumChannels[8] = 1
        initialDrumChannels[9] = 1
        const mapper = createMidiMapper(createXgSystemOnMidi(), { initialDrumChannels })

        mapper({
            type: 'sysex',
            data: Uint8Array.from([0xf0, 0x43, 0x10, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7]),
        })
        expect(mapper.getState().drumChannels[8]).toBe(0)
        expect(mapper.getState().drumChannels[9]).toBe(1)

        mapper({ type: 'cc', channel: 8, controller: 0, value: 127 })
        expect(mapper.getState().drumChannels[8]).toBe(1)
    })

    it('covers the XG drum-kit families and remaps XG-only keys to SC-55 sounds', () => {
        const mapper = createMidiMapper(createXgSystemOnMidi(), { enableDrumBankRemap: true })

        mapper({ type: 'cc', channel: 9, controller: 0, value: 127 })
        mapper({ type: 'cc', channel: 9, controller: 32, value: 0 })

        const expectedPrograms = new Map([
            [0, 0], [1, 0], [2, 0], [3, 0], [5, 0], [6, 0],
            [7, 24], [8, 8], [9, 8], [16, 16], [17, 16],
            [24, 24], [25, 25], [26, 25], [27, 24], [28, 25],
            [29, 25], [30, 25], [31, 25], [32, 32], [33, 32],
            [40, 40], [41, 40], [48, 48], [64, 25], [65, 25], [66, 25],
        ])

        for (const [sourceProgram, destinationProgram] of expectedPrograms) {
            mapper({ type: 'cc', channel: 9, controller: 7, value: 100 })
            mapper({ type: 'cc', channel: 9, controller: 11, value: 127 })
            mapper({ type: 'cc', channel: 9, controller: 10, value: 127 })
            const events = mapper({ type: 'program', channel: 9, value: sourceProgram })
            expect(events).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'cc', channel: 9, controller: 32, value: 1 }),
                expect.objectContaining({ type: 'program', channel: 9, value: destinationProgram }),
            ]))
            expect(events).not.toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'cc', channel: 9, controller: 7 }),
            ]))
            expect(events).not.toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'cc', channel: 9, controller: 11 }),
            ]))
            expect(events).not.toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'cc', channel: 9, controller: 10 }),
            ]))
        }

        mapper({ type: 'program', channel: 9, value: 16 })
        expect(mapper({ type: 'note_on', channel: 9, note: 29, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 38, velocity: 0 }])
        expect(mapper({ type: 'note_on', channel: 9, note: 40, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 38, velocity: 99 }])

        mapper({ type: 'program', channel: 9, value: 25 })
        expect(mapper({ type: 'note_on', channel: 9, note: 29, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 38, velocity: 99 }])
        expect(mapper({ type: 'note_off', channel: 9, note: 29, velocity: 0 }))
            .toEqual([{ type: 'note_off', channel: 9, note: 38, velocity: 0 }])
        expect(mapper({ type: 'note_on', channel: 9, note: 35, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 36, velocity: 100 }])
        expect(mapper({ type: 'note_on', channel: 9, note: 40, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 38, velocity: 99 }])
        expect(mapper({ type: 'note_on', channel: 9, note: 38, velocity: 16 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 38, velocity: 27 }])
        expect(mapper({ type: 'note_on', channel: 9, note: 78, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 29, velocity: 96 }])

        mapper({ type: 'program', channel: 9, value: 40 })
        expect(mapper({ type: 'note_on', channel: 9, note: 25, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 38, velocity: 96 }])
        expect(mapper({ type: 'note_on', channel: 9, note: 27, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 39, velocity: 96 }])

        mapper({ type: 'program', channel: 9, value: 48 })
        expect(mapper({ type: 'note_on', channel: 9, note: 49, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 59, velocity: 96 }])

        mapper({ type: 'cc', channel: 9, controller: 0, value: 126 })
        mapper({ type: 'cc', channel: 9, controller: 10, value: 127 })
        expect(mapper({ type: 'program', channel: 9, value: 0 })).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'cc', channel: 9, controller: 10 }),
        ]))
        expect(mapper({ type: 'note_on', channel: 9, note: 36, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 48, velocity: 96 }])
        mapper({ type: 'program', channel: 9, value: 1 })
        expect(mapper({ type: 'note_on', channel: 9, note: 84, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 73, velocity: 96 }])
    })
})

describe('SC-88 to SC-55 mapping', () => {
    it('forces every mapped drum kit to center pan', () => {
        const mapper = createMidiMapper(createSc88Midi())
        const drumProgramsByBank = new Map([
            [2, [0, 1, 8, 16, 24, 25, 26, 32, 40, 48, 49, 50, 56, 57, 64, 65]],
            [1, [0, 8, 16, 25, 32, 40, 48, 56, 127]],
        ])

        for (const [bankLsb, programs] of drumProgramsByBank) {
            mapper({ type: 'cc', channel: 9, controller: 0, value: 0 })
            mapper({ type: 'cc', channel: 9, controller: 32, value: bankLsb })

            for (const program of programs) {
                mapper({ type: 'cc', channel: 9, controller: 10, value: 0 })
                expect(mapper({ type: 'program', channel: 9, value: program })).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ type: 'cc', channel: 9, controller: 10, value: 64 }),
                    ]),
                )
            }
        }
    })

    it('maps primary and secondary drums without changing melodic programs', () => {
        const mapper = createMidiMapper(createSc88Midi())

        expect(mapper.getState()).toMatchObject({
            detectedStandard: 'GS',
            detectedModule: '88',
            configName: 'SC88SC55.CFG',
            mappingDestination: 'Roland SC-55',
        })
        expect(mapper.getState().drumChannels[10]).toBe(1)

        mapper({ type: 'cc', channel: 0, controller: 0, value: 0 })
        mapper({ type: 'cc', channel: 0, controller: 32, value: 2 })
        expect(mapper({ type: 'program', channel: 0, value: 33 }))
            .toEqual([{ type: 'program', channel: 0, value: 33 }])

        mapper({ type: 'cc', channel: 12, controller: 0, value: 0 })
        mapper({ type: 'cc', channel: 12, controller: 32, value: 2 })
        expect(mapper({ type: 'program', channel: 12, value: 47 }).slice(0, 3)).toEqual([
            expect.objectContaining({ type: 'cc', channel: 12, controller: 0, value: 0 }),
            expect.objectContaining({ type: 'cc', channel: 12, controller: 32, value: 1 }),
            expect.objectContaining({ type: 'program', channel: 12, value: 47 }),
        ])

        mapper({
            type: 'sysex',
            data: Uint8Array.from([0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x1a, 0x15, 0x02, 0x0f, 0xf7]),
        })

        mapper({ type: 'cc', channel: 9, controller: 0, value: 0 })
        mapper({ type: 'cc', channel: 9, controller: 32, value: 2 })
        expect(mapper({ type: 'program', channel: 9, value: 50 })[0])
            .toEqual(expect.objectContaining({ type: 'program', channel: 9, value: 0 }))
        expect(mapper({ type: 'note_on', channel: 9, note: 45, velocity: 100 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 35, velocity: 95 }])
        expect(mapper({ type: 'note_on', channel: 9, note: 66, velocity: 100 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 38, velocity: 100 }])

        mapper({ type: 'cc', channel: 10, controller: 0, value: 0 })
        mapper({ type: 'cc', channel: 10, controller: 32, value: 2 })
        expect(mapper({ type: 'program', channel: 10, value: 1 })[0])
            .toEqual(expect.objectContaining({ type: 'program', channel: 10, value: 0 }))
    })
})
