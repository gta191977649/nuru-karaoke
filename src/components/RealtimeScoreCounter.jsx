import React from 'react'
import './RealtimeScoreCounter.css'

export default function RealtimeScoreCounter({ score = 0, label = '総合得点' }) {
    // We want to update the score ONLY when the cube is "rotating" or hidden behind the "In Progress" face.
    // The animation cycle is 24s.
    // 0-1s: Move (Front -> Right)
    // 1-6s: Wait (Right/Progress is visible) -> SAFE TO UPDATE
    // 6-7s: Move (Right -> Back)
    // 7-12s: Wait (Back/Score is visible) -> DO NOT UPDATE
    // 12-13s: Move (Back -> Left)
    // 13-18s: Wait (Left/Progress is visible) -> SAFE TO UPDATE
    // 18-19s: Move (Left -> Front)
    // 19-24s: Wait (Front/Score is visible) -> DO NOT UPDATE
    //
    // Optimal update times: t=3.5s (Phase 1) and t=15.5s (Phase 3).
    // Loop length: 12s between updates. (3.5 -> 15.5 -> 27.5/3.5)

    const [frozenScore, setFrozenScore] = React.useState(score)
    const currentScoreRef = React.useRef(score)

    // Keep ref updated with latest prop
    React.useEffect(() => {
        currentScoreRef.current = score
    }, [score])

    React.useEffect(() => {
        // Function to latch the current score
        const update = () => {
            setFrozenScore(currentScoreRef.current)
        }

        // Initial Delay to sync with CSS Animation (mount at t=0)
        // Target t=3.5s
        const initialTimer = setTimeout(() => {
            update()
            // Start Interval for every 12s (t=15.5s, t=27.5s...)
            const interval = setInterval(update, 12000)

            // Cleanup interval on unmount (or if effects re-run)
            return () => clearInterval(interval)
        }, 3500)

        return () => clearTimeout(initialTimer)
    }, []) // Run once on mount to sync with CSS start

    const displayScore = Math.round(frozenScore)

    return (
        <div className="score-cube-scene">
            <div className="score-cube">
                {/* Front */}
                <div className="score-cube-face front">
                    <div className="score-cube-label">{label}</div>
                    <div className="score-cube-value">{displayScore}</div>
                    <div className="score-cube-sub">100</div>
                </div>

                {/* Right - In Progress */}
                <div className="score-cube-face right">
                    <div className="score-cube-value" style={{ fontSize: '1.5rem', textAlign: 'center' }}>集計中</div>
                </div>

                {/* Back - Score (Mirrored logic or just same) */}
                <div className="score-cube-face back">
                    <div className="score-cube-label">{label}</div>
                    <div className="score-cube-value">{displayScore}</div>
                    <div className="score-cube-sub">100</div>
                </div>

                {/* Left - In Progress */}
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
