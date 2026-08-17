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
    it('preserves voice mapping while remapping Room Kit low snare and bass drum notes', () => {
        const mapper = createMidiMapper(createXgSystemOnMidi())

        expect(mapper.getState()).toMatchObject({
            detectedStandard: 'XG',
            configName: 'XGSC55.CFG',
            mappingDestination: 'Roland SC-55',
        })

        mapper({ type: 'cc', channel: 0, controller: 0, value: 0 })
        mapper({ type: 'cc', channel: 0, controller: 32, value: 0 })
        expect(mapper({ type: 'program', channel: 0, value: 0 }).slice(0, 3)).toEqual([
            expect.objectContaining({ type: 'cc', channel: 0, controller: 0, value: 0 }),
            expect.objectContaining({ type: 'cc', channel: 0, controller: 32, value: 2 }),
            expect.objectContaining({ type: 'program', channel: 0, value: 0 }),
        ])

        mapper({ type: 'program', channel: 9, value: 8 })

        expect(mapper({ type: 'note_on', channel: 9, note: 31, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 38, velocity: 96 }])
        expect(mapper({ type: 'note_on', channel: 9, note: 33, velocity: 96 }))
            .toEqual([{ type: 'note_on', channel: 9, note: 36, velocity: 96 }])
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
})

describe('SC-88 to SC-55 mapping', () => {
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
