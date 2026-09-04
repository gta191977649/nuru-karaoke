import { parseLyricSegments } from '../engine/lrc.js'

const placeholder = { segments: [{ text: '…', ruby: '', falsetto: false }], plainText: '…' }

function resolveLyricEntry(entry) {
    if (!entry) return placeholder
    if (Array.isArray(entry.segments) && entry.segments.length) return entry
    return parseLyricSegments(entry.text)
}

// Derive rows from playback state so seeking never leaves a stale preview.
export function getLyricRows(entries = [], activeIndex = -1, karaokeProgress = 0) {
    const progressPercent = Math.round(karaokeProgress * 1000) / 10
    const pairStart = activeIndex >= 0 ? activeIndex - (activeIndex % 2) : -1
    const activeInPair = activeIndex >= 0 ? activeIndex % 2 : 0
    const preview = activeInPair === 1 && karaokeProgress >= 0.5 && Boolean(entries[pairStart + 2])
    const current = pairStart >= 0
        ? resolveLyricEntry(entries[pairStart + (preview ? 2 : 0)])
        : placeholder
    const next = resolveLyricEntry(entries[pairStart + 1])
    const prev = resolveLyricEntry(entries[activeIndex - 1])
    const curr = activeIndex >= 0 ? resolveLyricEntry(entries[activeIndex]) : placeholder
    const nextThree = resolveLyricEntry(entries[activeIndex + 1])

    return {
        lineRowsTwo: [
            { segments: current.segments, align: 'text-left', progress: preview ? 0 : activeInPair === 0 ? progressPercent : 100 },
            { segments: next.segments, align: 'text-right lyric-row--indent', progress: activeInPair === 1 ? progressPercent : 0 },
        ],
        lineRowsThree: [
            { segments: prev.segments, align: 'text-center', progress: activeIndex - 1 >= 0 ? 100 : 0 },
            { segments: curr.segments, align: 'text-center', progress: progressPercent },
            { segments: nextThree.segments, align: 'text-center', progress: 0 },
        ],
        measureLeftSegments: current.segments,
        measureRightSegments: next.segments,
    }
}
