import { useState, useEffect, useRef } from 'react'
import { getTargetMidiAtTime } from '../../engine/audio/midi/referenceMelody.js'

// Helper functions (duplicated from MelodyGuideCanvas for now to avoid large refactor)
function mod12(value) {
    const m = value % 12
    return m < 0 ? m + 12 : m
}

function mapUserMidiToTargetOctave(userMidi, targetMidi) {
    const u = Number(userMidi)
    const t = Number(targetMidi)
    if (!Number.isFinite(u) || !Number.isFinite(t)) return null
    const userKey = Math.round(u)
    const targetKey = Math.round(t)
    const userPc = mod12(userKey)
    const targetPc = mod12(targetKey)
    if (userPc === targetPc) return t
    const detune = u - userKey
    const base = t - targetPc
    return base + userPc + detune
}

export function useKaraokeScoring({
    pitchEngine,
    reference,
    currentTimeRef,
    transpositionRef,
    rmsGate = 0.01,
    enabled = true,
    resetKey,
}) {
    // Score state
    const scoreRef = useRef({
        totalSamples: 0,
        correctSamples: 0,
        rawScore: 0,
    })

    // To avoid duplicate processing
    const lastProcessedTimeRef = useRef(-1)

    // Reset score when resetKey changes
    useEffect(() => {
        scoreRef.current = { totalSamples: 0, correctSamples: 0, rawScore: 0 }
        lastProcessedTimeRef.current = -1
    }, [resetKey])

    useEffect(() => {
        if (!enabled || !pitchEngine) return

        const interval = setInterval(() => {
            const songTime = currentTimeRef.current
            // Avoid processing backwards (seek) or duplicate times (paused)
            if (songTime <= lastProcessedTimeRef.current) return
            lastProcessedTimeRef.current = songTime

            // Get Target
            const rawTarget = reference ? getTargetMidiAtTime(reference, songTime) : null
            if (rawTarget === null) return // No singing required here

            const transposition = transpositionRef.current || 0
            const targetMidi = rawTarget + transposition

            // Get User Pitch (we use pitchEngine.lastPitch or similar if available, 
            // but pitchEngine is event based. 
            // Ideally we should use the same source as pitchHistory.
            // But useKaraokePitchHistory uses 'lastPitchRef' updated via subscription.
            // We can replicate that locally.)

            // We need strictly real-time access to the latest pitch.
            // Since this runs in an interval, we might miss transient events, 
            // but for scoring "duration held correctly", sampling is strictly ok.
        }, 50)

        return () => clearInterval(interval)
    }, [enabled, pitchEngine, reference, currentTimeRef, transpositionRef])

    // We need access to the "latest pitch".
    // Let's perform the subscription inside.
    const latestPitchRef = useRef(null)

    useEffect(() => {
        if (!pitchEngine) return
        const unsub = pitchEngine.onPitch((p) => {
            latestPitchRef.current = p
        })
        return unsub
    }, [pitchEngine])

    // Enhance the interval logic with actual comparison
    useEffect(() => {
        if (!enabled || !reference) return

        const interval = setInterval(() => {
            const songTime = currentTimeRef.current
            // basic debounce/forward check
            if (songTime <= lastProcessedTimeRef.current + 0.001) return
            lastProcessedTimeRef.current = songTime

            const rawTarget = getTargetMidiAtTime(reference, songTime)
            if (rawTarget === null) return // Silence/No note

            // If there is a target note, we increment total samples
            scoreRef.current.totalSamples++

            const userVal = latestPitchRef.current
            if (!userVal) return

            // Check RMS
            if (userVal.rms < rmsGate) return

            // Check Pitch
            const userMidi = userVal.midi
            if (!Number.isFinite(userMidi)) return

            const transposition = transpositionRef.current || 0
            const targetMidi = rawTarget + transposition

            const mappedMidi = mapUserMidiToTargetOctave(userMidi, targetMidi)
            if (mappedMidi !== null) {
                const diff = Math.abs(mappedMidi - targetMidi)
                if (diff <= 2) { // 2 Semitone Tolerance
                    scoreRef.current.correctSamples++
                }
            }

        }, 50) // 20 times per second

        return () => clearInterval(interval)
    }, [enabled, reference, currentTimeRef, transpositionRef, rmsGate])

    const getScore = () => {
        const { correctSamples, totalSamples } = scoreRef.current
        if (totalSamples === 0) return 0
        return (correctSamples / totalSamples) * 100
    }

    return { getScore }
}
