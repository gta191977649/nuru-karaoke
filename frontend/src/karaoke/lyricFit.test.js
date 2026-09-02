import { describe, expect, it } from 'vitest'
import { fitLyricFontSize } from './lyricFit.js'

describe('fitLyricFontSize', () => {
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

