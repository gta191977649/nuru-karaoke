import { describe, expect, it } from 'vitest'
import { getLyricRows } from './lyricRows.js'

const entries = ['A', 'B', 'C', 'D', 'E', 'F'].map((text) => ({ text }))
const texts = (rows) => rows.map((row) => row.segments.map((seg) => seg.text).join(''))

describe('getLyricRows', () => {
    it.each([0, 0.499, 0.49999])('keeps the old first line below halfway (%s)', (progress) => {
        const { lineRowsTwo } = getLyricRows(entries, 1, progress)
        expect(texts(lineRowsTwo)).toEqual(['A', 'B'])
        expect(lineRowsTwo.map((row) => row.progress)).toEqual([100, Math.round(progress * 1000) / 10])
    })

    it.each([0.5, 0.50001, 0.75, 1])('previews the next first line at/after halfway (%s)', (progress) => {
        const { lineRowsTwo } = getLyricRows(entries, 1, progress)
        expect(texts(lineRowsTwo)).toEqual(['C', 'B'])
        expect(lineRowsTwo.map((row) => row.progress)).toEqual([0, Math.round(progress * 1000) / 10])
    })

    it('starts the next pair normally and never previews while singing its first line', () => {
        for (const progress of [0, 0.5, 1]) {
            const { lineRowsTwo } = getLyricRows(entries, 2, progress)
            expect(texts(lineRowsTwo)).toEqual(['C', 'D'])
            expect(lineRowsTwo.map((row) => row.progress)).toEqual([progress * 100, 0])
        }
    })

    it('preserves the final pair when no preview exists', () => {
        expect(texts(getLyricRows(entries, 5, 0.75).lineRowsTwo)).toEqual(['E', 'F'])
        expect(getLyricRows(entries, 5, 0.75).lineRowsTwo[0].progress).toBe(100)
        expect(texts(getLyricRows(entries.slice(0, 3), 1, 0.5).lineRowsTwo)).toEqual(['C', 'B'])
        expect(texts(getLyricRows(entries.slice(0, 3), 2, 0).lineRowsTwo)).toEqual(['C', '…'])
    })

    it('handles empty lyrics and preserves the pre-song display', () => {
        expect(texts(getLyricRows().lineRowsTwo)).toEqual(['…', '…'])
        expect(texts(getLyricRows(entries).lineRowsTwo)).toEqual(['…', 'A'])
    })

    it('recomputes correctly for forward/backward seeks and repeated paused frames', () => {
        const positions = [[3, 0.8], [1, 0.2], [1, 0.8], [1, 0.8], [0, 0]]
        expect(positions.map(([i, p]) => texts(getLyricRows(entries, i, p).lineRowsTwo)))
            .toEqual([['E', 'D'], ['A', 'B'], ['C', 'B'], ['C', 'B'], ['A', 'B']])
    })

    it('leaves three-line selection and highlights unchanged', () => {
        const { lineRowsThree } = getLyricRows(entries, 1, 0.75)
        expect(texts(lineRowsThree)).toEqual(['A', 'B', 'C'])
        expect(lineRowsThree.map((row) => row.progress)).toEqual([100, 75, 0])
    })

    it('measures the displayed preview and preserves long text, ruby and falsetto', () => {
        const segments = [{ text: '長'.repeat(100), ruby: 'なが', falsetto: true }]
        const richEntries = [entries[0], entries[1], { segments }, entries[3]]
        const result = getLyricRows(richEntries, 1, 0.5)
        expect(result.lineRowsTwo[0].segments).toBe(segments)
        expect(result.measureLeftSegments).toBe(result.lineRowsTwo[0].segments)
        expect(result.measureRightSegments).toBe(result.lineRowsTwo[1].segments)
        expect(result.lineRowsTwo[1].align).toBe('text-right lyric-row--indent')
    })
})
