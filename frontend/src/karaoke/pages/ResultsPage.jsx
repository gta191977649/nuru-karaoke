import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import './ResultsPage.css'
import { LiquidTube } from './components/LiquidTube'
import { CenterScore } from './components/CenterScore'
import { SongInfo } from './components/SongInfo'
import { BottomPanel } from './components/BottomPanel'
import { usePlayerScoreStore } from '../../state/playerScoreStore.js'
import useUserStore from '../../state/userStore.js'
import { submitScore } from '../../services/scores.js'
import resultBgm from '../../assets/sfx/result.mp3'
import { UI_CONFIG } from '../../config.js'
import { getUiAudioEngine } from '../../engine/audioEngine.js'

// Importing icons for components if needed, but components likely handle their own or use text/emoji for now.
import { Play, Pause } from 'lucide-react'

function ResultsPage({ score, techniques, songInfo, onNext }) {
    const finalScore = usePlayerScoreStore((store) => store.finalScore)
    //const finalScore = 30
    const techniqueCounts = usePlayerScoreStore((store) => store.techniqueCounts)
    const storedSongInfo = usePlayerScoreStore((store) => store.songInfo)
    const f0Curve = usePlayerScoreStore((store) => store.f0Curve)
    const authStatus = useUserStore((store) => store.status)
    const isGuest = useUserStore((store) => store.isGuest)
    const accessToken = useUserStore((store) => store.accessToken)
    const submitOnceRef = useRef(false)

    // Mock Analysis Data (since we don't have real analytics for these yet)
    // In the future this should come from the backend/analysis engine
    const analysisdata = useMemo(() => ({
        pitch: { label: '音程', val: 0, max: 40 },
        stability: { label: '安定感', val: 0, max: 30 },
        intonation: { label: '抑揚', val: 0, max: 15 },
        longTone: { label: 'ロング\nトーン', val: 0, max: 10 },
        technique: { label: 'テク\nニック', val: 0, max: 5 },
    }), [])

    // While we don't have detailed breakdown, we can simulate "filled" tubes based on the total score ratio
    // or just leave them empty/random for now if that's preferred.
    // Let's approximate based on the total score percentage to make it look alive.
    const resolvedScore = Number.isFinite(score) ? score : finalScore
    const resolvedTechniques = techniques || techniqueCounts
    const resolvedSongInfo = songInfo || storedSongInfo
    const resolvedSongCode = resolvedSongInfo?.code || resolvedSongInfo?.id || ''
    const scoreRatio = (Number(resolvedScore) || 0) / 100;

    const stopResultBgm = useCallback((fadeMs) => {
        const uiAudio = getUiAudioEngine()
        // Keep playback position unchanged while fading out; next play will restart anyway.
        uiAudio.stopBgm({ fadeMs, reset: false })
    }, [])

    const bottomPanelCounts = useMemo(() => ({
        kobushi: resolvedTechniques?.kobushi || 0,
        fall: resolvedTechniques?.glissdown || 0,
        shakuri: resolvedTechniques?.glissup || 0,
        vibrato: resolvedTechniques?.vibrato || 0
    }), [resolvedTechniques]);

    useEffect(() => {
        if (submitOnceRef.current) return
        if (authStatus !== 'authenticated' || isGuest) return
        if (!accessToken) return
        if (!resolvedSongCode) return
        const numericScore = Number(resolvedScore)
        if (!Number.isFinite(numericScore)) return
        submitOnceRef.current = true
        const payload = {
            song: resolvedSongCode,
            score: Math.round(numericScore),
            technique_counts: resolvedTechniques || {},
        }
        if (Array.isArray(f0Curve) && f0Curve.length) {
            payload.f0_curve = f0Curve
        }
        submitScore(payload, accessToken).catch((error) => {
            console.error('Failed to submit score', error)
        })
    }, [authStatus, isGuest, accessToken, resolvedSongCode, resolvedScore, resolvedTechniques, f0Curve])

    // Results BGM: auto-play in a loop on entry, fade out on leave (including "演奏停止").
    useEffect(() => {
        const uiAudio = getUiAudioEngine()
        uiAudio.playBgm(resultBgm, { loop: true }).catch(() => { })
        return () => {
            // Avoid resetting currentTime while fading out; it can look/sound like it "jumped" to the start.
            uiAudio.stopBgm({ fadeMs: UI_CONFIG.karaokeTransitionMs, reset: false })
        }
    }, [])

    const handleNext = useCallback(() => {
        // Start fading immediately so the BGM doesn't keep playing during the transition overlay.
        stopResultBgm(UI_CONFIG.karaokeTransitionMs)
        onNext?.()
    }, [onNext, stopResultBgm])

    return (
        <div className="resultsPageNew">
            {/* Background Animation */}
            <div className="tech-grid-wrapper">
                <div className="tech-header-overlay"></div>
                <div className="tech-grid-floor"></div>
                <div className="tech-horizon-glow"></div>
                <div className="tech-vignette"></div>
            </div>

            <div className="rp-container font-mono-tech">

                {/* Header */}
                <header className="rp-header">
                    <div className="rp-header-left">
                        {/* <div className="rp-header-logo-circle">
                            <span style={{ fontSize: '1.5em', fontStyle: 'italic', color: 'white' }}>D</span>
                        </div> */}
                        <h1 className="rp-header-logo-text font-digital">
                            周波採点<span className="font-digital" style={{ color: '#ee9c22ff', fontStyle: 'normal', fontSize: '0.5em', marginLeft: '5px' }}>DX</span>
                        </h1>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>

                        <div style={{ fontWeight: 'bold', fontSize: '1.5em', whiteSpace: 'nowrap' }}>
                            ゲスト <span style={{ color: '#94a3b8', fontSize: '0.7em' }}>さん</span>
                        </div>
                        <div className="font-mono-tech" style={{ color: '#bae6fd', letterSpacing: '0.1em', opacity: 0.8, fontSize: '1.2em' }}>
                            {new Date().toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                </header>

                {/* Main Display Area */}
                <div className="rp-main-display">

                    {/* Left: Liquid Tubes */}
                    <div style={{ width: '33%', display: 'flex', justifyContent: 'space-between', gap: '2%', height: '100%', alignItems: 'flex-end', paddingBottom: '1%' }}>
                        <LiquidTube label={analysisdata.pitch.label} score={scoreRatio * 92} maxScoreDisplay={40} />
                        <LiquidTube label={analysisdata.stability.label} score={scoreRatio * 85} maxScoreDisplay={30} />
                        <LiquidTube label={analysisdata.intonation.label} score={scoreRatio * 98} maxScoreDisplay={15} />
                        <LiquidTube label={analysisdata.longTone.label} score={scoreRatio * 70} maxScoreDisplay={10} />
                        <LiquidTube label={analysisdata.technique.label} score={scoreRatio * 88} maxScoreDisplay={5} />
                    </div>

                    {/* Center: Score */}
                    <div style={{ width: '34%', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', position: 'relative' }}>
                        <CenterScore score={Number(resolvedScore) || 0} />
                    </div>

                    {/* Right: Song Info */}
                    <div style={{ width: '33%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', height: '100%', padding: '2% 0' }}>
                        <SongInfo data={{
                            title: resolvedSongInfo?.title || 'Unknown Title',
                            artist: resolvedSongInfo?.artist || 'Unknown Artist',
                            avgScore: 74.123,
                            rank: 0,
                            calories: 12.5 // Mock for now or calculate from song length
                        }} />
                    </div>
                </div>

                {/* Bottom Panel */}
                <div style={{ height: '22%', width: '100%', flexShrink: 0 }}>
                    <BottomPanel counts={bottomPanelCounts} />
                </div>

                {/* Footer Controls */}
                <div className="rp-footer">
                    <button className="rp-btn rp-btn-red" onClick={handleNext}>
                        <Pause style={{ fill: 'white', height: '50%', aspectRatio: '1/1' }} />
                        <span>演奏停止</span>
                    </button>

                    <div style={{ display: 'flex', height: '100%', alignItems: 'center' }}>
                        <button className="rp-btn rp-btn-blue">
                            <span>音程強化モード</span>
                        </button>
                        <button className="rp-btn rp-btn-blue">
                            <span>マイルームに保存</span>
                        </button>
                        <button className="rp-btn rp-btn-cyan" onClick={handleNext}>
                            <Play style={{ fill: 'white', height: '50%', aspectRatio: '1/1' }} />
                            <span>プレビュー</span>
                        </button>
                    </div>
                </div>

            </div>
        </div>
    )
}

export default ResultsPage
