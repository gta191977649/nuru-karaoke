import React, { useCallback, useEffect, useRef, useState } from 'react'
import './RealtimeScoreCounter.css'

const CUBE_ROTATION_MS = 1000
const CALCULATION_HOLD_MS = 2000
const SCORE_DISPLAY_HOLD_MS = 3000

export default function RealtimeScoreCounter({
    score = 0,
    ready = false,
    label = '現在得点',
    updateKey = 0,
}) {
    const [displayScore, setDisplayScore] = useState(0)
    const [rotationDeg, setRotationDeg] = useState(0)
    const displayRef = useRef(0)
    const rotationRef = useRef(0)
    const pendingScoreRef = useRef(null)
    const targetScoreRef = useRef(null)
    const collectingRef = useRef(false)
    const animatingRef = useRef(false)
    const timersRef = useRef([])
    const lastUpdateKeyRef = useRef(updateKey)

    const clearTimers = useCallback(() => {
        timersRef.current.forEach((timer) => window.clearTimeout(timer))
        timersRef.current = []
    }, [])

    const runPendingUpdate = useCallback(function runPendingUpdate() {
        if (animatingRef.current || pendingScoreRef.current == null) return

        const nextScore = pendingScoreRef.current
        pendingScoreRef.current = null
        targetScoreRef.current = nextScore
        animatingRef.current = true
        collectingRef.current = true

        // Show a calculation face first, retaining the old visible score.
        rotationRef.current -= 90
        setRotationDeg(rotationRef.current)

        const revealTimer = window.setTimeout(() => {
            // Keep collecting score events while the calculation face is
            // visible, then reveal the newest accumulated result in one step.
            const calculatedScore = Math.max(
                targetScoreRef.current ?? 0,
                Number.isFinite(pendingScoreRef.current) ? pendingScoreRef.current : 0,
            )
            pendingScoreRef.current = null
            targetScoreRef.current = calculatedScore
            collectingRef.current = false

            // Both score faces are hidden at this point. Update the value, then
            // rotate the freshly calculated result into view.
            displayRef.current = calculatedScore
            setDisplayScore(calculatedScore)
            rotationRef.current -= 90
            setRotationDeg(rotationRef.current)

            const completeTimer = window.setTimeout(() => {
                // Keep the calculated score readable for at least three
                // seconds. Updates received during this window are coalesced
                // in pendingScoreRef and shown in the next rotation.
                const displayHoldTimer = window.setTimeout(() => {
                    targetScoreRef.current = null
                    animatingRef.current = false
                    runPendingUpdate()
                }, SCORE_DISPLAY_HOLD_MS)
                timersRef.current.push(displayHoldTimer)
            }, CUBE_ROTATION_MS)
            timersRef.current.push(completeTimer)
        }, CUBE_ROTATION_MS + CALCULATION_HOLD_MS)
        timersRef.current.push(revealTimer)
    }, [])

    useEffect(() => {
        if (!ready || updateKey === lastUpdateKeyRef.current) return
        lastUpdateKeyRef.current = updateKey

        const requestedScore = Math.max(0, Math.min(100, Number(score) || 0))
        const scheduledScore = Number.isFinite(targetScoreRef.current)
            ? targetScoreRef.current
            : displayRef.current
        const baselineScore = Math.max(displayRef.current, scheduledScore)
        if (requestedScore <= baselineScore + 0.001) return

        pendingScoreRef.current = Math.max(
            Number.isFinite(pendingScoreRef.current) ? pendingScoreRef.current : baselineScore,
            requestedScore,
        )
        // While collecting, the pending value is consumed by the current
        // calculation window instead of scheduling an extra rotation.
        if (collectingRef.current) return
        runPendingUpdate()
    }, [ready, runPendingUpdate, score, updateKey])

    useEffect(() => {
        return () => clearTimers()
    }, [clearTimers])

    const formattedScore = Math.round(ready ? displayScore : 0)

    return (
        <div className="score-cube-scene">
            <div
                className="score-cube"
                style={{ transform: `rotateY(${rotationDeg}deg)` }}
            >
                {/* Front (0 deg) - Score */}
                <div className="score-cube-face front">
                    <div className="score-cube-label">{label}</div>
                    <div className="score-cube-value">
                        {ready ? formattedScore : <span className="score-cube-pending">集計中</span>}
                    </div>
                    <div className="score-cube-sub">100</div>
                </div>

                {/* Right (-90 deg) - Calculating */}
                <div className="score-cube-face right">
                    <div className="score-cube-value score-cube-calculating">集計中</div>
                </div>

                {/* Back (-180 deg) - Score */}
                <div className="score-cube-face back">
                    <div className="score-cube-label">{label}</div>
                    <div className="score-cube-value">{formattedScore}</div>
                    <div className="score-cube-sub">100</div>
                </div>

                {/* Left (-270 deg) - Calculating */}
                <div className="score-cube-face left">
                    <div className="score-cube-value score-cube-calculating">集計中</div>
                </div>

                <div className="score-cube-face top"></div>
                <div className="score-cube-face bottom"></div>
            </div>
        </div>
    )
}
