import { useCallback, useEffect, useRef } from 'react'
import { DEFAULT_CONFIG } from '../../engine/audioEngine.js'
import {
    SCORING_ALGORITHM_VERSION,
    SimpleScoreCalculator,
} from '../scoring/SimpleScoreCalculator.js'

export function resolvePitchSongTime({ pitch, songTimeSec, userOffsetSec = 0, audioContext }) {
    const songTime = Number(songTimeSec)
    if (!Number.isFinite(songTime)) return null
    const offset = Number.isFinite(userOffsetSec) ? Number(userOffsetSec) : 0
    let alignedTime = songTime - offset
    const contextTime = Number(audioContext?.currentTime)
    const frameTime = Number(pitch?.tAcSec)
    if (Number.isFinite(contextTime) && Number.isFinite(frameTime)) {
        const callbackLag = Math.max(0, Math.min(0.25, contextTime - frameTime))
        const sampleRate = Number(audioContext?.sampleRate) || DEFAULT_CONFIG.sampleRate
        const halfWindowSec = Number(DEFAULT_CONFIG.windowSize) / (2 * sampleRate)
        alignedTime -= callbackLag + halfWindowSec
    }
    return alignedTime
}

export function useKaraokeScoring({
    pitchEngine,
    reference,
    currentTimeRef,
    transpositionRef,
    rmsGate = 0.01,
    userOffsetSec = 0,
    enabled = true,
    resetKey,
    debug = false,
    debugIntervalMs = 1000,
    debugRef,
    onDebug,
    onScoreChange,
}) {
    const calculatorRef = useRef(new SimpleScoreCalculator())
    const scoringVisualRef = useRef({
        algorithmVersion: SCORING_ALGORITHM_VERSION,
        octaveShift: 0,
        octavePolicy: 'pitch-class',
        currentFrame: null,
        liveNote: null,
        recentNotes: [],
        confirmedSegments: [],
        pendingDecisionCount: 0,
        decisionWindowSec: null,
        confirmedThroughSec: null,
    })
    const lastDebugTimeRef = useRef(0)
    const lastScoreRef = useRef(0)
    const lastProcessedTimeRef = useRef(null)

    useEffect(() => {
        const notes = reference?.notes || []
        calculatorRef.current.reset(notes, {
            reference,
            rmsGate,
        })
        lastScoreRef.current = 0
        lastProcessedTimeRef.current = null
        scoringVisualRef.current = calculatorRef.current.getVisualState()
        if (typeof onScoreChange === 'function') {
            onScoreChange(0, {
                ready: true,
                finalizedNotes: 0,
                cumulative: true,
            })
        }
    }, [resetKey, reference, rmsGate, onScoreChange])

    useEffect(() => {
        if (!pitchEngine || !enabled || !reference) return undefined

        return pitchEngine.onPitch((pitch) => {
            const songTime = Number(currentTimeRef.current)
            if (!Number.isFinite(songTime)) return
            const alignedTime = resolvePitchSongTime({
                pitch,
                songTimeSec: songTime,
                userOffsetSec,
                audioContext: pitchEngine.getAudioContext?.(),
            })
            if (
                Number.isFinite(lastProcessedTimeRef.current) &&
                alignedTime < lastProcessedTimeRef.current - 0.05
            ) {
                lastScoreRef.current = 0
                if (typeof onScoreChange === 'function') {
                    onScoreChange(0, {
                        ready: true,
                        finalizedNotes: 0,
                        cumulative: true,
                        reset: true,
                    })
                }
            }
            lastProcessedTimeRef.current = alignedTime
            calculatorRef.current.process({
                userPitch: pitch,
                transposition: Number(transpositionRef.current) || 0,
                timeSec: alignedTime,
            })
            scoringVisualRef.current = calculatorRef.current.getVisualState()

            const finalized = calculatorRef.current.getFinalizeInfo()
            if (Number(finalized.count) > 0) {
                const live = calculatorRef.current.getLiveScoreInfo()
                const score = calculatorRef.current.getScore()
                const cumulative = {
                    ...live,
                    score,
                    ready: true,
                    cumulative: true,
                }
                if (Math.abs(score - lastScoreRef.current) > 0.001) {
                    lastScoreRef.current = score
                    if (typeof onScoreChange === 'function') onScoreChange(score, cumulative)
                } else if (typeof onScoreChange === 'function') {
                    onScoreChange(score, cumulative)
                }
            }

            if (debug || debugRef || onDebug) {
                const now = performance.now()
                if (now - lastDebugTimeRef.current >= debugIntervalMs) {
                    const info = calculatorRef.current.getDebugInfo()
                    if (debugRef) debugRef.current = info
                    if (typeof onDebug === 'function') onDebug(info)
                    if (debug) console.log(`[KaraokeScore:${SCORING_ALGORITHM_VERSION}]`, info)
                    lastDebugTimeRef.current = now
                }
            }
        })
    }, [
        pitchEngine,
        enabled,
        reference,
        currentTimeRef,
        transpositionRef,
        userOffsetSec,
        debug,
        debugIntervalMs,
        debugRef,
        onDebug,
        onScoreChange,
    ])

    const getScore = useCallback(() => calculatorRef.current.getScore(), [])
    const getLiveScore = useCallback(() => calculatorRef.current.getLiveScore(), [])

    const finalizeScore = useCallback((endTimeSec) => {
        const fallbackTime = Number(currentTimeRef.current)
        const resolvedEnd = Number.isFinite(Number(endTimeSec)) ? Number(endTimeSec) : fallbackTime
        const score = calculatorRef.current.finalize(resolvedEnd)
        scoringVisualRef.current = calculatorRef.current.getVisualState()
        lastScoreRef.current = score
        if (typeof onScoreChange === 'function') {
            onScoreChange(score, {
                ready: true,
                final: true,
                cumulative: true,
                finalizedNotes: calculatorRef.current.getLiveScoreInfo().finalizedNotes,
            })
        }
        return score
    }, [currentTimeRef, onScoreChange])

    return { getScore, getLiveScore, finalizeScore, scoringVisualRef }
}
