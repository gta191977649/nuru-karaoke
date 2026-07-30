
export const INTERLUDE_MIN_GAP_SEC = 5
export const INTERLUDE_FADE_SEC = 0.3
export const INTERLUDE_END_LEAD_SEC = 0.6

/**
 * Groups notes into segments based on a time gap threshold.
 * If the gap between the end of one note and the start of the next is <= maxGap, they are merged.
 * 
 * @param {Array<{t0Sec: number, t1Sec: number}>} notes - Sorted list of notes
 * @param {number} maxGap - Maximum gap in seconds to allow merging
 * @returns {Array<{t0Sec: number, t1Sec: number}>} - List of merged segments
 */
export function groupNotesToSegments(notes, maxGap = 0.4) {
    if (!notes || notes.length === 0) return []

    const sorted = [...notes].sort((a, b) => a.t0Sec - b.t0Sec)
    const segments = []
    let current = { ...sorted[0] }

    for (let i = 1; i < sorted.length; i++) {
        const note = sorted[i]
        // If overlap or gap is small enough, merge
        // note.t0Sec is start of next note
        // current.t1Sec is end of current segment
        if (note.t0Sec - current.t1Sec <= maxGap) {
            // Extend current segment
            current.t1Sec = Math.max(current.t1Sec, note.t1Sec)
        } else {
            // Finish current segment and start new one
            segments.push(current)
            current = { ...note }
        }
    }
    segments.push(current)
    return segments
}

/**
 * Finds silent gaps surrounded by reference-melody notes.
 *
 * Leading and trailing silence cannot become interludes because a valid range
 * is only produced between two note groups.
 *
 * @param {Array<{t0Sec: number, t1Sec: number}>} notes
 * @param {number} minGapSec
 * @returns {Array<{startSec: number, endSec: number, durationSec: number}>}
 */
export function findInterludeRanges(notes, minGapSec = INTERLUDE_MIN_GAP_SEC) {
    if (!Array.isArray(notes) || notes.length < 2) return []

    const threshold = Number.isFinite(Number(minGapSec))
        ? Math.max(0, Number(minGapSec))
        : INTERLUDE_MIN_GAP_SEC
    const sorted = notes
        .map((note) => ({
            t0Sec: Number(note?.t0Sec),
            t1Sec: Number(note?.t1Sec),
        }))
        .filter((note) => (
            Number.isFinite(note.t0Sec) &&
            Number.isFinite(note.t1Sec) &&
            note.t1Sec > note.t0Sec
        ))
        .sort((a, b) => a.t0Sec - b.t0Sec || a.t1Sec - b.t1Sec)

    if (sorted.length < 2) return []

    const noteGroups = []
    let currentGroup = { ...sorted[0] }

    for (let i = 1; i < sorted.length; i += 1) {
        const note = sorted[i]
        if (note.t0Sec <= currentGroup.t1Sec) {
            currentGroup.t1Sec = Math.max(currentGroup.t1Sec, note.t1Sec)
        } else {
            noteGroups.push(currentGroup)
            currentGroup = { ...note }
        }
    }
    noteGroups.push(currentGroup)

    const interludes = []
    for (let i = 1; i < noteGroups.length; i += 1) {
        const startSec = noteGroups[i - 1].t1Sec
        const endSec = noteGroups[i].t0Sec
        const durationSec = endSec - startSec
        if (durationSec > threshold) {
            interludes.push({ startSec, endSec, durationSec })
        }
    }
    return interludes
}

/**
 * Derives the lyric/interlude visibility targets for a playback position.
 * CSS transitions animate between these targets.
 */
export function getInterludeDisplayState(
    ranges,
    currentTime,
    {
        fadeSec = INTERLUDE_FADE_SEC,
        endLeadSec = INTERLUDE_END_LEAD_SEC,
    } = {},
) {
    const defaultState = {
        isInterlude: false,
        lyricsVisible: true,
        promptVisible: false,
    }
    if (!Array.isArray(ranges) || !Number.isFinite(Number(currentTime))) return defaultState

    const time = Number(currentTime)
    const range = ranges.find(({ startSec, endSec }) => time >= startSec && time < endSec)
    if (!range) return defaultState

    const safeFadeSec = Math.max(0, Number(fadeSec) || 0)
    const safeEndLeadSec = Math.max(safeFadeSec, Number(endLeadSec) || 0)
    return {
        isInterlude: true,
        lyricsVisible: time >= range.endSec - safeFadeSec,
        promptVisible: (
            time >= range.startSec + safeFadeSec &&
            time < range.endSec - safeEndLeadSec
        ),
    }
}
