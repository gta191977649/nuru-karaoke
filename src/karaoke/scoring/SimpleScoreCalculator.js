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
     * @param {Object} options - Scoring options.
     */
    reset(referenceNotes = [], options = {}) {
        this.totalMelodyNotes = referenceNotes.length || 1 // Avoid division by zero
        this.correctNotes = 0
        this.breakToleranceSec = Number.isFinite(options.breakToleranceSec) ? options.breakToleranceSec : 0.1
        this.edgeToleranceSec = Number.isFinite(options.edgeToleranceSec) ? options.edgeToleranceSec : 0.05
        this.pitchToleranceSemis = Number.isFinite(options.pitchToleranceSemis) ? options.pitchToleranceSemis : 1.5
        this.minHitRatio = Number.isFinite(options.minHitRatio) ? options.minHitRatio : 0.5
        this.rmsGate = Number.isFinite(options.rmsGate) ? options.rmsGate : 0.01
        this.defaultSampleSec = Number.isFinite(options.defaultSampleSec) ? options.defaultSampleSec : 0.05

        // Track the currently active note processing
        this.activeNoteState = {
            note: null, // The note object reference
            hitSec: 0,
            processedSec: 0
        }
        this._lastSampleTime = null
        this._lastValidPitch = null
        this._lastValidPitchTime = null
    }

    getMaxGapSec() {
        return this.breakToleranceSec
    }

    getEdgeToleranceSec() {
        return this.edgeToleranceSec
    }

    /**
     * Process a single time slice.
     * @param {Object|null} targetNote - The expected Note object { t0Sec, t1Sec, midi } or null.
     * @param {Object|null} userPitch - The user's detected pitch object { midi, rms }, or null.
     * @param {number} transposition - Key shift to apply to target.
     * @param {number} timeSec - Current song time in seconds.
     */
    process(targetNote, userPitch, transposition, timeSec) {
        const t = Number(timeSec)
        const hasTime = Number.isFinite(t)
        let dt = this.defaultSampleSec
        if (hasTime && Number.isFinite(this._lastSampleTime)) {
            dt = Math.max(0, t - this._lastSampleTime)
        }
        if (hasTime) this._lastSampleTime = t

        const hasUserPitch = userPitch && Number.isFinite(userPitch.midi)
        const hasRms = userPitch && Number.isFinite(userPitch.rms)
        const rmsOk = hasRms ? userPitch.rms >= this.rmsGate : true

        if (hasUserPitch && rmsOk) {
            this._lastValidPitch = Number(userPitch.midi)
            this._lastValidPitchTime = hasTime ? t : null
        } else if (hasTime && Number.isFinite(this._lastValidPitchTime)) {
            if (t - this._lastValidPitchTime > this.breakToleranceSec) {
                this._lastValidPitch = null
            }
        }

        const effectiveMidi =
            Number.isFinite(this._lastValidPitch) &&
            (!hasTime || !Number.isFinite(this._lastValidPitchTime) || t - this._lastValidPitchTime <= this.breakToleranceSec)
                ? this._lastValidPitch
                : null

        // 1. Detect Note Change (or end of note)
        if (this.activeNoteState.note !== targetNote) {
            this.evaluateActiveNote()
            // Start new note
            if (targetNote) {
                this.activeNoteState = {
                    note: targetNote,
                    hitSec: 0,
                    processedSec: 0
                }
            } else {
                this.activeNoteState = { note: null, hitSec: 0, processedSec: 0 }
            }
        }

        // If no target active, nothing to do
        if (!targetNote) return

        this.activeNoteState.processedSec += dt

        if (!Number.isFinite(effectiveMidi)) return

        // Adjust Target
        const finalTarget = targetNote.midi + transposition

        // Map Octave
        const mappedMidi = this.mapUserToTargetOctave(effectiveMidi, finalTarget)
        if (mappedMidi === null) return

        // Check Tolerance (1.5 semitones)
        const diff = Math.abs(mappedMidi - finalTarget)
        if (diff <= this.pitchToleranceSemis) {
            this.activeNoteState.hitSec += dt
        }
    }

    evaluateActiveNote() {
        const { note, hitSec, processedSec } = this.activeNoteState
        if (!note) return

        // If we processed some samples for this note
        if (processedSec > 0) {
            // Threshold: 50% correctness
            const accuracy = hitSec / processedSec
            if (accuracy >= this.minHitRatio) {
                this.correctNotes++
                // console.log(`[ScoreCalc] Note Correct! ${hitSec}/${processedSec}`)
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
