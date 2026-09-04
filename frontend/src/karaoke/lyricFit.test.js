import { describe, expect, it } from 'vitest'
import { fitLyricFontSize } from './lyricFit.js'

describe('fitLyricFontSize', () => {
    it('fits long lyrics on narrow screens without enlarging either row', () => {
        const rows = [
            { contentWidth: 2400, availableWidth: 320 },
            { contentWidth: 3200, availableWidth: 288 },
        ]
        const fontSize = fitLyricFontSize({ baseFontSize: 48, rows, safetyPx: 24 })
        expect(fontSize).toBeGreaterThan(0)
        expect(fontSize).toBeLessThan(48)
        for (const row of rows) {
            expect(row.contentWidth * fontSize / 48 + 24).toBeLessThanOrEqual(row.availableWidth)
        }
    })

    it('restores the base size when the next lyrics fit', () => {
        const baseFontSize = 64
        expect(fitLyricFontSize({ baseFontSize, rows: [{ contentWidth: 2000, availableWidth: 800 }] })).toBeLessThan(baseFontSize)
        expect(fitLyricFontSize({ baseFontSize, rows: [{ contentWidth: 400, availableWidth: 800 }] })).toBe(baseFontSize)
    })

    it('keeps the natural size when every line fits', () => {
        expect(fitLyricFontSize({
            baseFontSize: 64,
            rows: [
                { contentWidth: 800, availableWidth: 1200 },
                { contentWidth: 900, availableWidth: 1080 },
            ],
            safetyPx: 24,
        })).toBe(64)
    })

    it('uses one size based on the most constrained line', () => {
        expect(fitLyricFontSize({
            baseFontSize: 64,
            rows: [
                { contentWidth: 1200, availableWidth: 1000 },
                { contentWidth: 1800, availableWidth: 1200 },
            ],
        })).toBeCloseTo(42.667, 3)
    })

    it('accounts for the outline safety area and indented row width', () => {
        expect(fitLyricFontSize({
            baseFontSize: 64,
            rows: [{ contentWidth: 1000, availableWidth: 900 }],
            safetyPx: 20,
        })).toBeCloseTo(56.32, 2)
    })

    it('ignores an unmeasurable placeholder row', () => {
        expect(fitLyricFontSize({
            baseFontSize: 52,
            rows: [{ contentWidth: 0, availableWidth: 800 }],
        })).toBe(52)
    })
})
