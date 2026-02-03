import '../Karaoke.css'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useKaraokeStore } from '../../state/karaokeStore.js'
import { synthEngine } from '../../engine/SynthEngine.js'
import { sharedPitchEngine, startSharedMic, stopSharedMic } from '../../engine/audio/pitch/sharedPitchEngine.js'
import { groupNotesToSegments } from '../../engine/audio/midi/noteUtils.js'
import MelodyGuideCanvas from '../../components/MelodyGuideCanvas.jsx'
import KeyChangeAlert from '../../components/KeyChangeAlert.jsx'
import useKeyChangeAlertStore from '../../state/keyChangeAlertStore.js'
import { useKaraokeReference } from '../hooks/useKaraokeReference.js'
import { useKaraokePitchHistory } from '../hooks/useKaraokePitchHistory.js'
import { useKaraokeSongIntro } from '../hooks/useKaraokeSongIntro.js'
import { useSingingTechnique } from '../hooks/useSingingTechnique.js'
import { useKaraokeScoring } from '../hooks/useKaraokeScoring.js'
import RealtimeScoreCounter from '../../components/RealtimeScoreCounter.jsx'
import { usePlayerScoreStore } from '../../state/playerScoreStore.js'
import logoTitle from '../../assets/logo_title.png'

function splitRubySegments(text) {
    const raw = String(text ?? '')
    if (!raw.includes('<')) return { segments: [{ text: raw, ruby: '' }], hasRuby: false }

    const segments = []
    let cursor = 0
    while (cursor < raw.length) {
        const open = raw.indexOf('<', cursor)
        if (open === -1) {
            segments.push({ text: raw.slice(cursor), ruby: '' })
            break
        }
        const close = raw.indexOf('>', open + 1)
        if (close === -1) {
            segments.push({ text: raw.slice(cursor), ruby: '' })
            break
        }
        const base = raw.slice(cursor, open)
        const ruby = raw.slice(open + 1, close)
        if (base) {
            const wordMatch = base.match(/[A-Za-z][A-Za-z0-9'-]*$/)
            if (wordMatch) {
                const word = wordMatch[0]
                const prefix = base.slice(0, base.length - word.length)
                if (prefix) segments.push({ text: prefix, ruby: '' })
                segments.push({ text: word, ruby })
            } else {
                const prefix = base.slice(0, -1)
                const lastChar = base.slice(-1)
                if (prefix) segments.push({ text: prefix, ruby: '' })
                segments.push({ text: lastChar, ruby })
            }
        }
        cursor = close + 1
    }
    const hasRuby = segments.some((seg) => seg.ruby)
    return { segments, hasRuby }
}

function renderRubySegments(segments) {
    return segments.map((seg, idx) =>
        seg.ruby ? (
            <ruby key={`${seg.text}-${idx}`}>
                {seg.text}
                <rt>{seg.ruby}</rt>
            </ruby>
        ) : (
            <span key={`${seg.text}-${idx}`}>{seg.text}</span>
        ),
    )
}

function SingingPage({ onFinish }) {
    const state = useKaraokeStore()
    const pitchEngine = sharedPitchEngine
    const [micActive, setMicActive] = useState(false)
    const currentTimeRef = useRef(0)
    const transpositionRef = useRef(0)
    const lyricsContainerRef = useRef(null)
    const lyricsMeasureLeftRef = useRef(null)
    const lyricsMeasureRightRef = useRef(null)
    const overflowLayoutRef = useRef(false)
    const overflowLockIndexRef = useRef(-1)
    const micRmsGate = 0.01
    const liveScore = usePlayerScoreStore((store) => store.liveScore)
    const setLiveScore = usePlayerScoreStore((store) => store.setLiveScore)
    const setTechniqueCounts = usePlayerScoreStore((store) => store.setTechniqueCounts)
    const setResults = usePlayerScoreStore((store) => store.setResults)
    const setF0Curve = usePlayerScoreStore((store) => store.setF0Curve)
    const resetPlayerScore = usePlayerScoreStore((store) => store.resetPlayerScore)
    const setSongInfo = usePlayerScoreStore((store) => store.setSongInfo)
    const showKeyChangeAlert = useKeyChangeAlertStore((store) => store.showKeyChangeAlert)
    const reference = useKaraokeReference({
        ready: state.ready,
        midiName: state.midiName,
        midiUrl: state.midiUrl,
        queueIndex: state.queueIndex,
    })
    const { showSongInfo, songInfo } = useKaraokeSongIntro({
        midiUrl: state.midiUrl,
        midiName: state.midiName,
        queue: state.queue,
        queueIndex: state.queueIndex,
        transposition: state.transposition,
        showKeyChangeAlert,
        reference,
        currentTime: state.currentTime,
    })
    const { pitchHistoryRef, lastPitchRef } = useKaraokePitchHistory({
        pitchEngine,
        reference,
        currentTimeRef,
        transpositionRef,
        rmsGate: micRmsGate,
        resetKey: `${state.midiName || ''}-${state.queueIndex ?? -1}`,
    })

    // Technique Detection
    const { techniqueEventsRef, resetCounts } = useSingingTechnique(pitchEngine, currentTimeRef, micActive)

    // Scoring
    const { getScore } = useKaraokeScoring({
        pitchEngine,
        reference,
        currentTimeRef,
        transpositionRef,
        rmsGate: micRmsGate,
        debug: false,
        debugIntervalMs: 500,
        onScoreChange: setLiveScore,
        historyRef: pitchHistoryRef,
        resetKey: `${state.midiName || ''}-${state.queueIndex ?? -1}`,
    })

    // Technique Counts (Validated)
    const techniqueCountsRef = useRef({ glissup: 0, kobushi: 0, glissdown: 0, vibrato: 0 })
    const handleTechniqueCountsChange = (counts) => {
        techniqueCountsRef.current = counts
        setTechniqueCounts(counts)
    }




    const scoringSegments = useMemo(() => {
        return groupNotesToSegments(reference?.notes, 0.4)
    }, [reference?.notes])

    const isScoring = useMemo(() => {
        if (!scoringSegments || state.currentTime == null) return false
        const t = state.currentTime
        // Check if current time is within any segment
        // Optimized: find first segment ending after t
        const seg = scoringSegments.find((s) => s.t1Sec >= t)
        if (!seg) return false
        return seg.t0Sec <= t
    }, [scoringSegments, state.currentTime])

    // Live score now updates via onScoreChange from the scoring hook.

    const progressPercent = Math.round((state.karaokeProgress ?? 0) * 1000) / 10

    const { lineRowsTwo, lineRowsThree, measureLeftSegments, measureRightSegments } = useMemo(() => {
        const entries = state.lrcEntries || []
        const i = state.activeLyricIndex ?? -1
        const placeholder = { segments: [{ text: '…', ruby: '' }], hasRuby: false }
        const stripRuby = (text) => String(text ?? '').replace(/<[^>]*>/g, '')
        const safeSegments = (text) => (text ? splitRubySegments(text) : placeholder)

        const pairStart = i >= 0 ? i - (i % 2) : -1
        const current = pairStart >= 0 ? safeSegments(entries[pairStart]?.text) : placeholder
        const next =
            pairStart + 1 < entries.length ? safeSegments(entries[pairStart + 1]?.text) : placeholder
        const activeInPair = i >= 0 ? i % 2 : 0
        const aText = stripRuby(entries[pairStart]?.text || '')
        const bText = stripRuby(entries[pairStart + 1]?.text || '')

        const prev = i - 1 >= 0 ? safeSegments(entries[i - 1]?.text) : placeholder
        const curr = i >= 0 ? safeSegments(entries[i]?.text) : placeholder
        const nextThree = i + 1 < entries.length ? safeSegments(entries[i + 1]?.text) : placeholder

        return {
            lineRowsTwo: [
                { segments: current.segments, align: 'text-left', progress: activeInPair === 0 ? progressPercent : 100 },
                { segments: next.segments, align: 'text-right lyric-row--indent', progress: activeInPair === 1 ? progressPercent : 0 },
            ],
            lineRowsThree: [
                { segments: prev.segments, align: 'text-center', progress: i - 1 >= 0 ? 100 : 0 },
                { segments: curr.segments, align: 'text-center', progress: progressPercent },
                { segments: nextThree.segments, align: 'text-center', progress: 0 },
            ],
            measureLeftSegments: aText ? splitRubySegments(aText).segments : placeholder.segments,
            measureRightSegments: bText ? splitRubySegments(bText).segments : placeholder.segments,
        }
    }, [progressPercent, state.activeLyricIndex, state.lrcEntries])

    useLayoutEffect(() => {
        const measureOverflow = () => {
            const container = lyricsContainerRef.current
            const measurerLeft = lyricsMeasureLeftRef.current
            const measurerRight = lyricsMeasureRightRef.current
            if (!container || !measurerLeft || !measurerRight) return
            const containerWidth = container.clientWidth
            const leftWidth = measurerLeft.scrollWidth
            const rightWidth = measurerRight.scrollWidth
            const textWidth = Math.max(leftWidth, rightWidth)
            const hysteresisPx = 24
            const currentlyOverflowing = overflowLayoutRef.current
            const next = currentlyOverflowing
                ? textWidth > containerWidth - hysteresisPx
                : textWidth > containerWidth + 1
            const activeIndex = Number.isFinite(state.activeLyricIndex) ? state.activeLyricIndex : -1
            const activePairStart = activeIndex >= 0 ? activeIndex - (activeIndex % 2) : -1
            if (next) {
                overflowLayoutRef.current = true
                overflowLockIndexRef.current = activePairStart
                if (container.dataset.layout !== 'three') {
                    container.dataset.layout = 'three'
                }
                return
            }

            const isLocked = overflowLockIndexRef.current >= 0 && activeIndex <= overflowLockIndexRef.current + 1
            if (isLocked) return

            overflowLayoutRef.current = false
            overflowLockIndexRef.current = -1
            if (container.dataset.layout !== 'two') {
                container.dataset.layout = 'two'
            }
        }

        measureOverflow()
        if (typeof ResizeObserver === 'undefined' || !lyricsContainerRef.current) return
        const observer = new ResizeObserver(measureOverflow)
        observer.observe(lyricsContainerRef.current)
        return () => observer.disconnect()
    }, [measureLeftSegments, measureRightSegments, state.activeLyricIndex, state.lrcEntries])

    // Audio start logic
    useEffect(() => {
        if (!state.ready) return
        synthEngine.playQueueIfIdle().catch(() => {
            // ignore
        })
    }, [state.ready])

    useEffect(() => {
        currentTimeRef.current = state.currentTime ?? 0
    }, [state.currentTime])

    useEffect(() => {
        transpositionRef.current = Number(state.transposition) || 0
    }, [state.transposition])

    useEffect(() => {
        resetPlayerScore()
        resetCounts()
    }, [resetPlayerScore, resetCounts, state.midiName, state.queueIndex])

    useEffect(() => {
        if (songInfo) setSongInfo(songInfo)
    }, [setSongInfo, songInfo])

    useEffect(() => {
        setF0Curve(null)
    }, [setF0Curve, state.midiName, state.queueIndex])

    useEffect(() => {
        let cancelled = false
        const start = async () => {
            try {
                await startSharedMic()
                if (!cancelled) setMicActive(true)
            } catch (err) {
                if (!cancelled) console.error(err)
            }
        }
        start()
        return () => {
            cancelled = true
            stopSharedMic()
            setMicActive(false)
        }
    }, [pitchEngine])

    // End of Song Detection
    const hasFinishedRef = useRef(false)

    // Reset finished flag on new song
    useEffect(() => {
        hasFinishedRef.current = false
    }, [state.midiName, state.queueIndex])

    useEffect(() => {
        if (!state.duration || state.duration < 10) return // Skip very short/invalid duration
        if (hasFinishedRef.current) return

        // Finish slightly before actual end to capture state before reset? 
        // Or just at end. duration is usually exact.
        // If autoAdvance is disabled, it will just stop or pause at end.
        // We check if currentTime is >= duration or near it.
        if (state.currentTime >= state.duration - 0.2 || (state.status === 'Finished' /* hypothetical status */)) {
            hasFinishedRef.current = true
            if (onFinish) {
                const finalScore = getScore()
                const finalTechniques = { ...techniqueCountsRef.current }
                const history = Array.isArray(pitchHistoryRef.current) ? pitchHistoryRef.current : []
                const f0Curve = history
                    .filter((point) => Number.isFinite(point?.t))
                    .map((point) => ({
                        t: Number(point.t),
                        f0Hz: Number.isFinite(point?.f0Hz) ? Number(point.f0Hz) : null,
                        midi: Number.isFinite(point?.userMidi) ? Number(point.userMidi) : null,
                    }))
                setResults({ score: finalScore, techniques: finalTechniques, songInfo, f0Curve })
                setF0Curve(f0Curve)
                onFinish({ score: finalScore, techniques: finalTechniques, songInfo, f0Curve })
            }
        }
    }, [state.currentTime, state.duration, onFinish, getScore, songInfo, state.status, setResults, setF0Curve])

    return (
        <div className={`karaokePage${showSongInfo ? ' karaokePage--intro' : ''}`}>
            <RealtimeScoreCounter score={liveScore} />
            <KeyChangeAlert />
            <div className="karaokeSongIntro">
                <div className="karaokeSongIntro__content">
                    <div className="karaokeSongIntro__title">{songInfo.title}</div>
                    {songInfo.artist ? <div className="karaokeSongIntro__artist">♪{songInfo.artist}</div> : null}
                </div>
                <img
                    src={logoTitle}
                    alt="Logo"
                    className="karaokeSongIntro__logo"
                />
            </div>
            <div className="karaoke-stage">
                <div className="karaoke-screen">
                    <div className="top-section">
                        <div className="info-container">
                            {isScoring && (
                                <div className="scoring-badge">
                                    <span className="scoring-text">🎤 採点中</span>
                                </div>
                            )}
                        </div>
                        <div className="melody-guide">
                            <MelodyGuideCanvas
                                className="melodyGuideCanvas"
                                reference={reference}
                                historyRef={pitchHistoryRef}
                                lastPitchRef={lastPitchRef}
                                currentTimeRef={currentTimeRef}
                                transpositionRef={transpositionRef}
                                rmsGate={micRmsGate}
                                gateUserByTarget
                                width={800}
                                height={220}
                                techniqueEventsRef={techniqueEventsRef}
                                onTechniqueCountsChange={handleTechniqueCountsChange}
                                totalSections={6}
                                currentSection={state.duration > 0
                                    ? Math.min(6, Math.floor((state.currentTime / state.duration) * 6) + 1)
                                    : 1}
                            />
                        </div>
                    </div>

                    <div className="bottom-section">
                        <div className="lyrics-container" ref={lyricsContainerRef} data-layout="two">
                            <span className="lyrics-measure" aria-hidden="true">
                                <span className="text" ref={lyricsMeasureLeftRef}>
                                    <span className="karaokeTextWrap">
                                        <span className="karaokeTextBase">{renderRubySegments(measureLeftSegments)}</span>
                                    </span>
                                </span>
                                <span className="text" ref={lyricsMeasureRightRef}>
                                    <span className="karaokeTextWrap">
                                        <span className="karaokeTextBase">{renderRubySegments(measureRightSegments)}</span>
                                    </span>
                                </span>
                            </span>
                            <div className="lyrics-lines lyrics-lines--two">
                                {lineRowsTwo.map((row, idx) => (
                                    <div className={`lyric-row ${row.align}`} key={`two-${row.align}-${idx}`}>
                                        <span className="text">
                                            <span
                                                className="karaokeTextWrap"
                                                style={{
                                                    '--karaoke-progress': `${row.progress}%`,
                                                }}
                                            >
                                                <span className="karaokeTextBase">{renderRubySegments(row.segments)}</span>
                                                <span className="karaokeTextFill" aria-hidden="true">
                                                    {renderRubySegments(row.segments)}
                                                </span>
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="lyrics-lines lyrics-lines--three">
                                {lineRowsThree.map((row, idx) => (
                                    <div className={`lyric-row ${row.align}`} key={`three-${row.align}-${idx}`}>
                                        <span className="text">
                                            <span
                                                className="karaokeTextWrap"
                                                style={{
                                                    '--karaoke-progress': `${row.progress}%`,
                                                }}
                                            >
                                                <span className="karaokeTextBase">{renderRubySegments(row.segments)}</span>
                                                <span className="karaokeTextFill" aria-hidden="true">
                                                    {renderRubySegments(row.segments)}
                                                </span>
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    )
}

export default SingingPage
