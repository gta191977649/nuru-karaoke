
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
