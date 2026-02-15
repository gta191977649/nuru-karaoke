import { useEffect, useRef, useCallback } from 'react'
import { getTargetNoteAtTick } from '../../engine/audio/midi/referenceMelody.js'
import { DEFAULT_CONFIG } from '../../engine/audioEngine.js'
import { SimpleScoreCalculator } from '../scoring/SimpleScoreCalculator.js'

export function useKaraokeScoring({
    pitchEngine,
    reference,
    currentTimeRef,
    transpositionRef,
    rmsGate = 0.01,
    userOffsetSec = 0,
    historyRef,
    enabled = true,
    resetKey,
    debug = false,
    debugIntervalMs = 1000,
    debugRef,
    onDebug,
    onScoreChange,
}) {
    // Scoring Engine Instance
    const calculatorRef = useRef(new SimpleScoreCalculator())
    const scoringRef = useRef(null)
    const lastDebugTimeRef = useRef(0)

    // To avoid duplicate processing
    const lastProcessedTimeRef = useRef(-1)
    const lastScoreRef = useRef(0)

    // Reset score when resetKey changes
    useEffect(() => {
        // Initialize with total notes from reference
        const rawNotes = reference?.notes || []
        const breakToleranceSec = Number(DEFAULT_CONFIG.breakToleranceMs) / 1000
        // Scoring: avoid merging so note finalization happens sooner.
        scoringRef.current = reference ? { ...reference, notes: rawNotes } : reference
        calculatorRef.current.reset(rawNotes, {
            reference,
            breakToleranceSec,
            edgeToleranceSec: Math.min(0.08, Math.max(0, breakToleranceSec / 2)),
            pitchToleranceSemis: Number(DEFAULT_CONFIG.pitchToleranceSemis) || 1.5,
            rmsGate,
            defaultSampleSec: 0.05,
            scoreDelaySec: 0.2,
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
            const offsetSec = Number.isFinite(userOffsetSec) ? Number(userOffsetSec) : 0
            const alignedTime = Number.isFinite(songTime) ? songTime - offsetSec : songTime
            // basic debounce/forward check
            if (alignedTime <= lastProcessedTimeRef.current + 0.001) return
            lastProcessedTimeRef.current = alignedTime

            const ref = scoringRef.current || reference
            const ticksPerBeat = Number(ref?.timeDivision) || 480
            const tick = ref?.getTickAtTime ? ref.getTickAtTime(alignedTime) : alignedTime
            const bpsNow = ref?.getBeatsPerSecond ? ref.getBeatsPerSecond(alignedTime) : 2
            const ticksPerSec = (Number.isFinite(bpsNow) ? bpsNow : 2) * ticksPerBeat
            const maxGapTick = calculatorRef.current.getMaxGapSec() * ticksPerSec
            const edgeToleranceTick = calculatorRef.current.getEdgeToleranceSec() * ticksPerSec
            const rawTargetNote = getTargetNoteAtTick(ref, tick, {
                maxGapTick,
                edgeToleranceTick,
            })
            // Note: rawTargetNote is null if no note is active

            let userPitch = latestPitchRef.current
            const history = historyRef?.current
            if (Array.isArray(history) && history.length && Number.isFinite(alignedTime)) {
                let best = null
                let minDiff = Infinity
                for (let i = history.length - 1; i >= 0; i -= 1) {
                    const point = history[i]
                    const diff = Math.abs(point.t - alignedTime)
                    if (diff < minDiff) {
                        minDiff = diff
                        best = point
                    }
                    if (diff > 0.25) break
                }
                if (best && minDiff <= 0.2 && Number.isFinite(best.userMidi)) {
                    userPitch = { midi: Number(best.userMidi), rms: best.rms ?? null, f0Hz: null }
                }
            }
            if (!userPitch || !Number.isFinite(userPitch.midi)) {
                const last = Array.isArray(history) && history.length ? history[history.length - 1] : null
                if (last && Number.isFinite(last.userMidi)) {
                    userPitch = { midi: Number(last.userMidi), rms: last.rms ?? null, f0Hz: null }
                }
            }
            const transposition = transpositionRef.current || 0

            // Delegate to calculator
            const beat = Number.isFinite(tick) ? tick / ticksPerBeat : alignedTime
            calculatorRef.current.process({
                targetNote: rawTargetNote,
                userPitch,
                transposition,
                timeSec: alignedTime,
                beat,
                beatsPerSec: bpsNow,
                historyRef,
            })

            const finalizeInfo = calculatorRef.current.getFinalizeInfo?.()
            const finalized = Number(finalizeInfo?.count) || 0
            if (finalized > 0) {
                const score = Number(finalizeInfo?.score) || calculatorRef.current.getScore()
                if (!Number.isFinite(lastScoreRef.current) || Math.abs(score - lastScoreRef.current) > 0.001) {
                    lastScoreRef.current = score
                    if (typeof onScoreChange === 'function') onScoreChange(score)
                }
                if (debug) {
                    const info = calculatorRef.current.getDebugInfo()
                    const ratio = info.totalWeightedBeats > 0 ? info.correctWeightedBeats / info.totalWeightedBeats : 0
                    console.log('[KaraokeScoreDebug]', {
                        score,
                        ratio,
                        correctWeightedBeats: info.correctWeightedBeats,
                        totalWeightedBeats: info.totalWeightedBeats,
                        pendingNotes: info.pendingNotes,
                        last: info.last,
                    })
                }
            }

            if (debug || debugRef || onDebug) {
                const now = performance.now()
                if (!debug || now - lastDebugTimeRef.current >= debugIntervalMs) {
                    const info = calculatorRef.current.getDebugInfo()
                    if (debugRef) debugRef.current = info
                    if (typeof onDebug === 'function') onDebug(info)
                    if (debug) {
                        const ratio = info.totalWeightedBeats > 0 ? info.correctWeightedBeats / info.totalWeightedBeats : 0
                        console.log('[KaraokeScoreDebug]', {
                            score: Number(info.score) || 0,
                            ratio,
                            correctWeightedBeats: info.correctWeightedBeats,
                            totalWeightedBeats: info.totalWeightedBeats,
                            pendingNotes: info.pendingNotes,
                            last: info.last,
                        })
                    }
                    lastDebugTimeRef.current = now
                }
            }

        }, 50) // 20 times per second

        return () => clearInterval(interval)
    }, [
        enabled,
        reference,
        currentTimeRef,
        transpositionRef,
        rmsGate,
        userOffsetSec,
        historyRef,
        debug,
        debugIntervalMs,
        debugRef,
        onDebug,
        onScoreChange,
    ])

    const getScore = useCallback(() => {
        return calculatorRef.current.getScore()
    }, [])

    return { getScore }
}
