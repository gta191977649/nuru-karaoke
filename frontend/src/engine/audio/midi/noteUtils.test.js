import { describe, expect, it } from 'vitest'
import {
    findInterludeRanges,
    getInterludeDisplayState,
} from './noteUtils.js'

const note = (t0Sec, t1Sec) => ({ t0Sec, t1Sec })

describe('findInterludeRanges', () => {
    it('finds internal note gaps longer than five seconds', () => {
        expect(findInterludeRanges([
            note(2, 4),
            note(10, 11),
        ])).toEqual([
            { startSec: 4, endSec: 10, durationSec: 6 },
        ])
    })

    it('does not treat gaps of exactly five seconds or less as interludes', () => {
        expect(findInterludeRanges([
            note(0, 2),
            note(7, 8),
            note(12, 13),
        ])).toEqual([])
    })

    it('only returns gaps surrounded by notes, excluding song boundaries', () => {
        expect(findInterludeRanges([note(8, 12)])).toEqual([])
    })

    it('sorts notes, merges overlaps, and ignores invalid notes', () => {
        expect(findInterludeRanges([
            note(14, 15),
            note(1, 4),
            note(3, 6),
            note(Number.NaN, 9),
            note(9, 9),
        ])).toEqual([
            { startSec: 6, endSec: 14, durationSec: 8 },
        ])
    })

    it('finds multiple internal interludes', () => {
        expect(findInterludeRanges([
            note(0, 1),
            note(7, 8),
            note(14, 15),
        ])).toEqual([
            { startSec: 1, endSec: 7, durationSec: 6 },
            { startSec: 8, endSec: 14, durationSec: 6 },
        ])
    })
})

describe('getInterludeDisplayState', () => {
    const ranges = [{ startSec: 10, endSec: 20, durationSec: 10 }]

    it('starts by fading lyrics out before showing the prompt', () => {
        expect(getInterludeDisplayState(ranges, 10)).toEqual({
            isInterlude: true,
            lyricsVisible: false,
            promptVisible: false,
        })
        expect(getInterludeDisplayState(ranges, 10.3).promptVisible).toBe(true)
    })

    it('fades the prompt and restores lyrics before the next note', () => {
        expect(getInterludeDisplayState(ranges, 19.39)).toMatchObject({
            lyricsVisible: false,
            promptVisible: true,
        })
        expect(getInterludeDisplayState(ranges, 19.4)).toMatchObject({
            lyricsVisible: false,
            promptVisible: false,
        })
        expect(getInterludeDisplayState(ranges, 19.7)).toMatchObject({
            lyricsVisible: true,
            promptVisible: false,
        })
    })

    it('supports seeking into and out of an interlude', () => {
        expect(getInterludeDisplayState(ranges, 15)).toEqual({
            isInterlude: true,
            lyricsVisible: false,
            promptVisible: true,
        })
        expect(getInterludeDisplayState(ranges, 20)).toEqual({
            isInterlude: false,
            lyricsVisible: true,
            promptVisible: false,
        })
    })
})
