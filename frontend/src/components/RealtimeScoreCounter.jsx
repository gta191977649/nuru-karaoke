import React, { useState, useEffect, useRef } from 'react'
import './RealtimeScoreCounter.css'

export default function RealtimeScoreCounter({ score = 0, label = '総合得点' }) {
    // State for the visualized score (updates only when showing "Score" face)
    const [displayScore, setDisplayScore] = useState(score)
    // Target rotation angle (decrements by 90 deg)
    const [rotation, setRotation] = useState(0)

    const scoreRef = useRef(score)
    const stateRef = useRef({
        phase: 'IDLE', // 'IDLE' (Score face) or 'CALCULATING' (Computing face)
        lastSwitchTime: Date.now(),
        displayScore: score
    })

    // Keep score ref updated
    useEffect(() => {
        scoreRef.current = score
    }, [score])

    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now()
            const { phase, lastSwitchTime, displayScore: currentDisplay } = stateRef.current
            const latestScore = scoreRef.current
            const timeInState = now - lastSwitchTime

            // Tolerance for float comparison
            const hasChange = Math.abs(latestScore - currentDisplay) > 0.1

            if (phase === 'IDLE') {
                // Showing Score Face (0, -180, -360...)
                // Rule: Must stay at least 5 seconds.
                if (timeInState >= 5000) {
                    if (hasChange) {
                        // Switch to Calculating
                        stateRef.current.phase = 'CALCULATING'
                        stateRef.current.lastSwitchTime = now
                        setRotation(r => r - 90)
                    }
                }
            } else if (phase === 'CALCULATING') {
                // Showing Calculating Face (-90, -270...)
                // Rule: Must stay 5 seconds, then return to Score.
                if (timeInState >= 5000) {
                    // Update display score to latest
                    stateRef.current.displayScore = latestScore
                    setDisplayScore(latestScore)

                    // Switch back to Score
                    stateRef.current.phase = 'IDLE'
                    stateRef.current.lastSwitchTime = now
                    setRotation(r => r - 90)
                }
            }
        }, 200) // Check every 200ms

        return () => clearInterval(interval)
    }, [])

    const formattedScore = Math.round(displayScore)

    return (
        <div className="score-cube-scene">
            <div
                className="score-cube"
                style={{ transform: `rotateY(${rotation}deg)` }}
            >
                {/* Front (0 deg) - Score */}
                <div className="score-cube-face front">
                    <div className="score-cube-label">{label}</div>
                    <div className="score-cube-value">{formattedScore}</div>
                    <div className="score-cube-sub">100</div>
                </div>

                {/* Right (-90 deg) - Calculating */}
                <div className="score-cube-face right">
                    <div className="score-cube-value" style={{ fontSize: '1.5rem', textAlign: 'center' }}>集計中</div>
                </div>

                {/* Back (-180 deg) - Score */}
                <div className="score-cube-face back">
                    <div className="score-cube-label">{label}</div>
                    <div className="score-cube-value">{formattedScore}</div>
                    <div className="score-cube-sub">100</div>
                </div>

                {/* Left (-270 deg) - Calculating */}
                <div className="score-cube-face left">
                    <div className="score-cube-value" style={{ fontSize: '1.5rem', textAlign: 'center' }}>集計中</div>
                </div>

                {/* Top/Bottom Caps */}
                <div className="score-cube-face top"></div>
                <div className="score-cube-face bottom"></div>
            </div>
        </div>
    )
}
