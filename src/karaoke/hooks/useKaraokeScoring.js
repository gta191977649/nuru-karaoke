import { useState, useEffect, useRef, useCallback } from 'react'
import { getTargetNoteAtTime } from '../../engine/audio/midi/referenceMelody.js'
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

    // To avoid duplicate processing
    const lastProcessedTimeRef = useRef(-1)

    // Reset score when resetKey changes
    useEffect(() => {
        // Initialize with total notes from reference
        const notes = reference?.notes || []
        calculatorRef.current.reset(notes)
        lastProcessedTimeRef.current = -1
    }, [resetKey, reference]) // Add reference dependency to catch melody load

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

            const rawTargetNote = getTargetNoteAtTime(reference, songTime, { maxGap: 0.4 })
            // Note: rawTargetNote is null if no note is active

            const userPitch = latestPitchRef.current
            const transposition = transpositionRef.current || 0

            // Delegate to calculator
            calculatorRef.current.process(rawTargetNote, userPitch, transposition)

        }, 50) // 20 times per second

        return () => clearInterval(interval)
    }, [enabled, reference, currentTimeRef, transpositionRef, rmsGate])

    const getScore = useCallback(() => {
        return calculatorRef.current.getScore()
    }, [])

    return { getScore }
}

