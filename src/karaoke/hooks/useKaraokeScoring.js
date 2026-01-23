import { useEffect, useRef, useCallback } from 'react'
import { getTargetNoteAtBeat, mergeAdjacentNotesByPitch } from '../../engine/audio/midi/referenceMelody.js'
import { DEFAULT_CONFIG } from '../../engine/audioEngine.js'
import { SimpleScoreCalculator } from '../scoring/SimpleScoreCalculator.js'

export function useKaraokeScoring({
    pitchEngine,
    reference,
    currentTimeRef,
    transpositionRef,
    rmsGate = 0.01,
    enabled = true,
    resetKey,
}) {
    // Scoring Engine Instance
    const calculatorRef = useRef(new SimpleScoreCalculator())
    const scoringRef = useRef(null)

    // To avoid duplicate processing
    const lastProcessedTimeRef = useRef(-1)

    // Reset score when resetKey changes
    useEffect(() => {
        // Initialize with total notes from reference
        const rawNotes = reference?.notes || []
        const breakToleranceSec = Number(DEFAULT_CONFIG.breakToleranceMs) / 1000
        const bps = reference?.getBeatsPerSecond ? reference.getBeatsPerSecond(0) : 2
        const maxGapBeat = breakToleranceSec * (Number.isFinite(bps) ? bps : 2)
        const scoringNotes = mergeAdjacentNotesByPitch(rawNotes, {
            maxGapBeat,
            pitchToleranceSemis: 0,
            useBeat: true,
        })
        scoringRef.current = reference ? { ...reference, notes: scoringNotes } : reference
        calculatorRef.current.reset(scoringNotes, {
            breakToleranceSec,
            edgeToleranceSec: Math.min(0.08, Math.max(0, breakToleranceSec / 2)),
            pitchToleranceSemis: 1.5,
            minHitRatio: 0.5,
            rmsGate,
            defaultSampleSec: 0.05,
        })
        lastProcessedTimeRef.current = -1
    }, [resetKey, reference, rmsGate]) // Add reference dependency to catch melody load

    // Subscription to Pitch Engine
    const latestPitchRef = useRef(null)
    useEffect(() => {
        if (!pitchEngine) return
        const unsub = pitchEngine.onPitch((p) => {
            latestPitchRef.current = p
        })
        return unsub
    }, [pitchEngine])

    // Processing Loop
    useEffect(() => {
        if (!enabled || !reference) return

        const interval = setInterval(() => {
            const songTime = currentTimeRef.current
            // basic debounce/forward check
            if (songTime <= lastProcessedTimeRef.current + 0.001) return
            lastProcessedTimeRef.current = songTime

            const ref = scoringRef.current || reference
            const beat = ref?.getBeatAtTime ? ref.getBeatAtTime(songTime) : songTime
            const bpsNow = ref?.getBeatsPerSecond ? ref.getBeatsPerSecond(songTime) : 2
            const maxGapBeat = calculatorRef.current.getMaxGapSec() * (Number.isFinite(bpsNow) ? bpsNow : 2)
            const edgeToleranceBeat = calculatorRef.current.getEdgeToleranceSec() * (Number.isFinite(bpsNow) ? bpsNow : 2)
            const rawTargetNote = getTargetNoteAtBeat(ref, beat, {
                maxGap: maxGapBeat,
                edgeToleranceBeat,
            })
            // Note: rawTargetNote is null if no note is active

            const userPitch = latestPitchRef.current
            const transposition = transpositionRef.current || 0

            // Delegate to calculator
            calculatorRef.current.process(rawTargetNote, userPitch, transposition, songTime)

        }, 50) // 20 times per second

        return () => clearInterval(interval)
    }, [enabled, reference, currentTimeRef, transpositionRef, rmsGate])

    const getScore = useCallback(() => {
        return calculatorRef.current.getScore()
    }, [])

    return { getScore }
}
