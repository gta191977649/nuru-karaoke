const A4_HZ = 440
const A4_MIDI = 69

function midiFromHz(hz) {
    const f = Number(hz)
    if (!Number.isFinite(f) || f <= 0) return null
    return A4_MIDI + 12 * Math.log2(f / A4_HZ)
}

function hzFromMidi(midi) {
    const m = Number(midi)
    if (!Number.isFinite(m)) return null
    return A4_HZ * Math.pow(2, (m - A4_MIDI) / 12)
}

function mod12Distance(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null
    const diff = ((a % 12) - (b % 12) + 18) % 12 - 6
    return diff
}

function clamp01(value) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(1, value))
}

/**
 * Beat-weighted score calculator with PlayerNote aggregation.
 * Scoring: correct beat length * note weight -> normalize to 100.
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
        this.referenceNotes = Array.isArray(referenceNotes) ? referenceNotes : []
        this.reference = options.reference || null
        this.noteWeights = options.noteWeights || { normal: 1, default: 1 }
        this.recentSegmentsMax = Number.isFinite(options.recentSegmentsMax)
            ? Math.max(1, Math.floor(options.recentSegmentsMax))
            : 40
        this.scoreDelaySec = Number.isFinite(options.scoreDelaySec) ? options.scoreDelaySec : 0.2
        this.breakToleranceSec = Number.isFinite(options.breakToleranceSec) ? options.breakToleranceSec : 0.1
        this.edgeToleranceSec = Number.isFinite(options.edgeToleranceSec) ? options.edgeToleranceSec : 0.05
        this.pitchToleranceSemis = Number.isFinite(options.pitchToleranceSemis) ? options.pitchToleranceSemis : 1.5
        this.rmsGate = Number.isFinite(options.rmsGate) ? options.rmsGate : 0.01
        this.defaultSampleSec = Number.isFinite(options.defaultSampleSec) ? options.defaultSampleSec : 0.05

        this.totalWeightedBeats = this._computeTotalWeightedBeats()
        this.correctWeightedBeats = 0

        this.playerNotes = []
        this._recentSegments = []
        this._activeSegment = null
        this._activeNoteStats = null
        this._pendingNotes = []
        this._lastFinalizeCount = 0
        this._lastFinalizeScore = 0
        this._lastSampleTime = null
        this._lastBeat = null
        this._lastValidPitch = null
        this._lastValidPitchTime = null
        this._lastDebug = {
            timeSec: null,
            beat: null,
            dtBeat: null,
            targetMidi: null,
            userMidi: null,
            distance: null,
            correct: false,
        }
    }

    getMaxGapSec() {
        return this.breakToleranceSec
    }

    getEdgeToleranceSec() {
        return this.edgeToleranceSec
    }

    _getNoteWeight(note) {
        const type = note?.type || 'normal'
        const weight = this.noteWeights[type]
        if (Number.isFinite(weight)) return weight
        return Number.isFinite(this.noteWeights.default) ? this.noteWeights.default : 1
    }

    _noteBeatLength(note) {
        if (!note) return 0
        if (Number.isFinite(note.t0Beat) && Number.isFinite(note.t1Beat)) {
            return Math.max(0, note.t1Beat - note.t0Beat)
        }
        if (this.reference?.getBeatAtTime && Number.isFinite(note.t0Sec) && Number.isFinite(note.t1Sec)) {
            const b0 = this.reference.getBeatAtTime(note.t0Sec)
            const b1 = this.reference.getBeatAtTime(note.t1Sec)
            if (Number.isFinite(b0) && Number.isFinite(b1)) return Math.max(0, b1 - b0)
        }
        return 0
    }

    _computeTotalWeightedBeats() {
        if (!this.referenceNotes?.length) return 1
        let total = 0
        for (const note of this.referenceNotes) {
            const beats = this._noteBeatLength(note)
            const weight = this._getNoteWeight(note)
            if (Number.isFinite(beats) && Number.isFinite(weight)) {
                total += beats * weight
            }
        }
        return total > 0 ? total : 1
    }

    _getBreakToleranceBeat(beatsPerSec) {
        const bps = Number(beatsPerSec)
        if (!Number.isFinite(bps) || bps <= 0) return null
        return this.breakToleranceSec * bps
    }

    _closeActiveSegment() {
        if (!this._activeSegment) return
        const seg = this._activeSegment
        seg.lengthBeats = Math.max(0, seg.endBeat - seg.startBeat)
        if (seg.preciseDistanceCount > 0) {
            seg.preciseDistanceAvg = seg.preciseDistanceSum / seg.preciseDistanceCount
        } else {
            seg.preciseDistanceAvg = null
        }
        this.playerNotes.push(seg)
        this._recentSegments.push(seg)
        if (this._recentSegments.length > this.recentSegmentsMax) {
            this._recentSegments.splice(0, this._recentSegments.length - this.recentSegmentsMax)
        }
        this._activeSegment = null
    }

    _computeNoteStatsFromHistory(note, historyRef, transposition) {
        if (!note || !historyRef?.current || !this.reference?.getBeatAtTime) return null
        const t0 = Number(note.t0Sec)
        const t1 = Number(note.t1Sec)
        if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return null

        const history = historyRef.current
        if (!Array.isArray(history) || !history.length) return null

        const targetMidi = Number(note.midi) + (Number.isFinite(transposition) ? transposition : 0)
        let totalBeats = 0
        let correctBeats = 0

        for (let i = 0; i < history.length; i += 1) {
            const point = history[i]
            // Determine the end of this sample's validity window
            const next = i + 1 < history.length
                ? history[i + 1].t
                : point.t + (this.defaultSampleSec || 0.05)

            // Skip if this segment ends before the note starts
            if (next <= t0) continue
            // Stop if this segment starts after the note ends (assuming sorted history)
            if (point.t >= t1) break

            const sliceStart = Math.max(point.t, t0)
            const sliceEnd = Math.min(next, t1)
            if (sliceEnd <= sliceStart) continue
            const userMidi = Number.isFinite(point.userMidi) ? Number(point.userMidi) : null
            if (!Number.isFinite(userMidi)) continue
            const pointRms = Number.isFinite(point.rms) ? Number(point.rms) : null
            if (Number.isFinite(pointRms) && pointRms < this.rmsGate) continue

            const beatStart = this.reference.getBeatAtTime(sliceStart)
            const beatEnd = this.reference.getBeatAtTime(sliceEnd)
            const dtBeat = Math.max(0, beatEnd - beatStart)
            if (!Number.isFinite(dtBeat) || dtBeat <= 0) continue
            totalBeats += dtBeat

            const distance = mod12Distance(Math.round(userMidi), Math.round(targetMidi))
            if (Number.isFinite(distance) && Math.abs(distance) <= this.pitchToleranceSemis) {
                correctBeats += dtBeat
            }
        }

        return { correctBeats, totalBeats }
    }

    _finalizeActiveNote(nowSec, transposition, historyRef) {
        if (!this._activeNoteStats) return
        const note = this._activeNoteStats.note
        let correctBeats = this._activeNoteStats.correctBeats
        let totalBeats = this._activeNoteStats.totalBeats
        if (historyRef) {
            const computed = this._computeNoteStatsFromHistory(note, historyRef, transposition)
            if (computed && computed.totalBeats > 0) {
                correctBeats = computed.correctBeats
                totalBeats = computed.totalBeats
                // console.log('[ScoreCalc] Computed from history:', { t: note.t0Sec, correct: correctBeats, total: totalBeats })
            }
        }
        const weight = this._getNoteWeight(note)
        const finalizeTime = Number.isFinite(note?.t1Sec)
            ? note.t1Sec + this.scoreDelaySec
            : (Number.isFinite(nowSec) ? nowSec : 0) + this.scoreDelaySec
        this._pendingNotes.push({
            note,
            correctBeats,
            totalBeats,
            weight,
            finalizeTime,
        })
        this._activeNoteStats = null
    }

    _flushPendingNotes(nowSec) {
        if (!this._pendingNotes.length) {
            this._lastFinalizeCount = 0
            return
        }
        const now = Number.isFinite(nowSec) ? nowSec : 0
        let finalized = 0
        const remaining = []
        for (const item of this._pendingNotes) {
            if (now >= item.finalizeTime) {
                this.correctWeightedBeats += item.correctBeats * item.weight
                finalized += 1
            } else {
                remaining.push(item)
            }
        }
        this._pendingNotes = remaining
        if (finalized > 0) {
            this._lastFinalizeCount = finalized
            this._lastFinalizeScore = this.getScore()
            // console.log('[ScoreCalc] Finalized Score:', this._lastFinalizeScore, 'CorrectWeighted:', this.correctWeightedBeats, 'TotalWeighted:', this.totalWeightedBeats)
        } else {
            this._lastFinalizeCount = 0
        }
    }

    _calcDistance(f0Hz, userMidi, targetMidi) {
        const target = Number(targetMidi)
        if (!Number.isFinite(target)) return { distance: null, preciseDistance: null, quantizedMidi: null }
        let midiFloat = null
        if (Number.isFinite(f0Hz) && f0Hz > 0) {
            midiFloat = midiFromHz(f0Hz)
        } else if (Number.isFinite(userMidi)) {
            midiFloat = Number(userMidi)
        }
        if (!Number.isFinite(midiFloat)) return { distance: null, preciseDistance: null, quantizedMidi: null }
        const quantized = Math.round(midiFloat)
        let distance = mod12Distance(quantized, Math.round(target))
        if (!Number.isFinite(distance)) return { distance: null, preciseDistance: null, quantizedMidi: quantized }
        if (Math.abs(distance) <= this.pitchToleranceSemis) distance = 0

        let preciseDistance = null
        if (distance === 0 && Number.isFinite(f0Hz) && f0Hz > 0) {
            const targetHz = hzFromMidi(target)
            if (Number.isFinite(targetHz) && Number.isFinite(f0Hz) && f0Hz > 0) {
                const cents = 1200 * Math.log2(f0Hz / targetHz)
                preciseDistance = cents / (100 * this.pitchToleranceSemis + 50)
            }
        }

        return { distance, preciseDistance, quantizedMidi: quantized }
    }

    /**
     * Process a single time slice.
     * @param {Object} args
     * @param {Object|null} args.targetNote
     * @param {Object|null} args.userPitch
     * @param {number} args.transposition
     * @param {number} args.timeSec
     * @param {number} args.beat
     * @param {number} args.beatsPerSec
     */
    process({
        targetNote,
        userPitch,
        transposition,
        timeSec,
        beat,
        beatsPerSec,
        historyRef,
    }) {
        const t = Number(timeSec)
        if (!Number.isFinite(t)) {
            this._lastDebug = {
                timeSec: null,
                beat: Number.isFinite(beat) ? beat : null,
                dtBeat: null,
                targetMidi: null,
                userMidi: Number.isFinite(userPitch?.midi) ? Number(userPitch.midi) : null,
                distance: null,
                correct: false,
            }
            return
        }

        let dtSec = this.defaultSampleSec
        if (Number.isFinite(this._lastSampleTime)) {
            dtSec = Math.max(0, t - this._lastSampleTime)
        }
        this._lastSampleTime = t

        let dtBeat = 0
        if (Number.isFinite(beat) && Number.isFinite(this._lastBeat)) {
            dtBeat = Math.max(0, beat - this._lastBeat)
        } else if (Number.isFinite(beatsPerSec)) {
            dtBeat = Math.max(0, dtSec * beatsPerSec)
        }
        if (Number.isFinite(beat)) this._lastBeat = beat

        const fallbackUserMidi = Number.isFinite(userPitch?.midi) ? Number(userPitch.midi) : null

        const hasUserPitch = userPitch && Number.isFinite(userPitch.midi)
        const hasRms = userPitch && Number.isFinite(userPitch.rms)
        const rmsOk = hasRms ? userPitch.rms >= this.rmsGate : true

        if (hasUserPitch && rmsOk) {
            this._lastValidPitch = userPitch
            this._lastValidPitchTime = t
        } else if (Number.isFinite(this._lastValidPitchTime)) {
            if (t - this._lastValidPitchTime > this.breakToleranceSec) {
                this._lastValidPitch = null
            }
        }

        const effectivePitch =
            this._lastValidPitch &&
                (!Number.isFinite(this._lastValidPitchTime) || t - this._lastValidPitchTime <= this.breakToleranceSec)
                ? this._lastValidPitch
                : null

        if (!targetNote) {
            this._finalizeActiveNote(t, transposition, historyRef)
            this._closeActiveSegment()
            this._flushPendingNotes(t)
            this._lastDebug = {
                timeSec: t,
                beat: Number.isFinite(beat) ? beat : null,
                dtBeat,
                targetMidi: null,
                userMidi: fallbackUserMidi,
                distance: null,
                correct: false,
            }
            return
        }

        if (!effectivePitch) {
            const gapBeat = dtBeat
            const breakTolBeat = this._getBreakToleranceBeat(beatsPerSec)
            if (Number.isFinite(breakTolBeat) && gapBeat > breakTolBeat) {
                this._finalizeActiveNote(t, transposition, historyRef)
                this._closeActiveSegment()
            }
            this._flushPendingNotes(t)
            this._lastDebug = {
                timeSec: t,
                beat: Number.isFinite(beat) ? beat : null,
                dtBeat,
                targetMidi: Number.isFinite(targetNote?.midi) ? Number(targetNote.midi) : null,
                userMidi: fallbackUserMidi,
                distance: null,
                correct: false,
            }
            return
        }

        const f0Hz = Number.isFinite(effectivePitch.f0Hz) ? Number(effectivePitch.f0Hz) : null
        const userMidi = Number.isFinite(effectivePitch.midi) ? Number(effectivePitch.midi) : null

        const targetMidi = Number(targetNote.midi) + (Number.isFinite(transposition) ? transposition : 0)
        const { distance, preciseDistance } = this._calcDistance(f0Hz, userMidi, targetMidi)
        if (!Number.isFinite(distance)) {
            this._lastDebug = {
                timeSec: t,
                beat: Number.isFinite(beat) ? beat : null,
                dtBeat,
                targetMidi,
                userMidi,
                distance: null,
                correct: false,
            }
            return
        }

        if (!this._activeNoteStats || this._activeNoteStats.note !== targetNote) {
            this._finalizeActiveNote(t, transposition, historyRef)
            this._activeNoteStats = {
                note: targetNote,
                correctBeats: 0,
                totalBeats: 0,
            }
        }

        const gapBeat = dtBeat
        const breakTolBeat = this._getBreakToleranceBeat(beatsPerSec)
        const isNewSegment =
            !this._activeSegment ||
            this._activeSegment.note !== targetNote ||
            this._activeSegment.distance !== distance ||
            (Number.isFinite(breakTolBeat) && gapBeat > breakTolBeat)

        if (isNewSegment) {
            this._closeActiveSegment()
            const startBeat = Number.isFinite(beat) ? beat : this._lastBeat ?? 0
            this._activeSegment = {
                note: targetNote,
                distance,
                startBeat,
                endBeat: startBeat,
                preciseDistanceSum: 0,
                preciseDistanceCount: 0,
                preciseDistanceAvg: null,
            }
        }

        if (this._activeSegment) {
            this._activeSegment.endBeat += dtBeat
            if (distance === 0 && Number.isFinite(preciseDistance)) {
                this._activeSegment.preciseDistanceSum += preciseDistance
                this._activeSegment.preciseDistanceCount += 1
            }
        }

        if (this._activeNoteStats && dtBeat > 0) {
            this._activeNoteStats.totalBeats += dtBeat
            if (distance === 0) {
                this._activeNoteStats.correctBeats += dtBeat
            }
        }

        this._flushPendingNotes(t)

        this._lastDebug = {
            timeSec: t,
            beat: Number.isFinite(beat) ? beat : null,
            dtBeat,
            targetMidi,
            userMidi,
            distance,
            correct: distance === 0,
        }
    }

    getScore() {
        if (!Number.isFinite(this.totalWeightedBeats) || this.totalWeightedBeats <= 0) return 0
        const ratio = this.correctWeightedBeats / this.totalWeightedBeats
        return clamp01(ratio) * 100
    }

    getDebugInfo() {
        return {
            score: this.getScore(),
            correctWeightedBeats: this.correctWeightedBeats,
            totalWeightedBeats: this.totalWeightedBeats,
            activeSegment: this._activeSegment,
            recentSegments: this._recentSegments.slice(),
            pendingNotes: this._pendingNotes.length,
            last: { ...this._lastDebug },
        }
    }

    getFinalizeInfo() {
        return {
            count: this._lastFinalizeCount,
            score: this._lastFinalizeScore,
        }
    }
}
