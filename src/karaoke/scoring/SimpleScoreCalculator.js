/**
 * SimpleScoreCalculator
 * 
 * Scores based on the ratio of "correct notes" vs "total melody notes" * 100.
 * A note is considered "correct" if the user sings the correct pitch for > 50% of the note's observed duration.
 * This produces a cumulative score that grows from 0 to 100 over the course of the song.
 */
export class SimpleScoreCalculator {
    constructor() {
        this.reset([])
    }

    /**
     * Initialize/Reset the calculator with the song's notes.
     * @param {Array} referenceNotes - Array of note objects from reference melody.
     */
    reset(referenceNotes = []) {
        this.totalMelodyNotes = referenceNotes.length || 1 // Avoid division by zero
        this.correctNotes = 0

        // Track the currently active note processing
        this.activeNoteState = {
            note: null, // The note object reference
            hitSamples: 0,
            processedSamples: 0
        }
    }

    /**
     * Process a single time slice.
     * @param {Object|null} targetNote - The expected Note object { t0Sec, t1Sec, midi } or null.
     * @param {Object|null} userPitch - The user's detected pitch object { midi, rms }, or null.
     * @param {number} transposition - Key shift to apply to target.
     */
    process(targetNote, userPitch, transposition) {
        // 1. Detect Note Change (or end of note)
        if (this.activeNoteState.note !== targetNote) {
            this.evaluateActiveNote()
            // Start new note
            if (targetNote) {
                this.activeNoteState = {
                    note: targetNote,
                    hitSamples: 0,
                    processedSamples: 0
                }
            } else {
                this.activeNoteState = { note: null, hitSamples: 0, processedSamples: 0 }
            }
        }

        // If no target active, nothing to do
        if (!targetNote) return

        this.activeNoteState.processedSamples++

        if (!userPitch) return

        // Check RMS
        if (userPitch.rms !== undefined && userPitch.rms < 0.01) return

        const userMidi = userPitch.midi
        if (!Number.isFinite(userMidi)) return

        // Adjust Target
        const finalTarget = targetNote.midi + transposition

        // Map Octave
        const mappedMidi = this.mapUserToTargetOctave(userMidi, finalTarget)
        if (mappedMidi === null) return

        // Check Tolerance (1.5 semitones)
        const diff = Math.abs(mappedMidi - finalTarget)
        if (diff <= 1.5) {
            this.activeNoteState.hitSamples++
        }
    }

    evaluateActiveNote() {
        const { note, hitSamples, processedSamples } = this.activeNoteState
        if (!note) return

        // If we processed some samples for this note
        if (processedSamples > 0) {
            // Threshold: 50% correctness
            const accuracy = hitSamples / processedSamples
            if (accuracy >= 0.5) {
                this.correctNotes++
                // console.log(`[ScoreCalc] Note Correct! ${hitSamples}/${processedSamples}`)
            }
        }
    }

    getScore() {
        if (this.totalMelodyNotes === 0) return 0
        // Cumulative Score: (Correct / Total) * 100
        return (this.correctNotes / this.totalMelodyNotes) * 100
    }

    // Helper: Map user note to nearest octave of target
    mapUserToTargetOctave(userMidi, targetMidi) {
        if (!Number.isFinite(userMidi) || !Number.isFinite(targetMidi)) return null
        const diff = targetMidi - userMidi
        const octaves = Math.round(diff / 12)
        return userMidi + (octaves * 12)
    }
}
