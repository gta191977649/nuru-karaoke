import '../Karaoke.css'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useKaraokeStore } from '../../state/karaokeStore.js'
import { synthEngine } from '../../engine/SynthEngine.js'
import { sharedPitchEngine, startSharedMic, stopSharedMic } from '../../engine/audio/pitch/sharedPitchEngine.js'
import {
    findInterludeRanges,
    getInterludeDisplayState,
    groupNotesToSegments,
} from '../../engine/audio/midi/noteUtils.js'
import MelodyGuideCanvas from '../../components/MelodyGuideCanvas.jsx'
import useKeyChangeAlertStore from '../../state/keyChangeAlertStore.js'
import { useKaraokeReference } from '../hooks/useKaraokeReference.js'
import { useKaraokePitchHistory } from '../hooks/useKaraokePitchHistory.js'
import { useKaraokeSongIntro } from '../hooks/useKaraokeSongIntro.js'
import { useSingingTechnique } from '../hooks/useSingingTechnique.js'
import { countValidatedTechniqueEvents } from '../scoring/scoringVisualUtils.js'
import { useKaraokeScoring } from '../hooks/useKaraokeScoring.js'
import { createSingingScene } from '../rendering/SingingScene.js'
import { usePlayerScoreStore } from '../../state/playerScoreStore.js'
import {
    normalizeMicrophoneDeviceKey,
    useSettingsStore,
} from '../../state/settingsStore.js'

const medianNumber = (values) => {
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const buildF0CurveByBeat = ({ history, reference, rmsGate }) => {
    if (!Array.isArray(history) || !history.length) return []
    if (!reference || typeof reference.getTickAtTime !== 'function') {
        return history
            .filter((point) => Number.isFinite(point?.t))
            .map((point) => ({
                t: Number(point.t),
                f0Hz: Number.isFinite(point?.f0Hz) ? Number(point.f0Hz) : null,
                midi: Number.isFinite(point?.userMidi) ? Number(point.userMidi) : null,
            }))
    }

    const ticksPerBeat = Number(reference.timeDivision) || 480
    const ticksToSeconds = typeof reference.ticksToSeconds === 'function'
        ? (tick) => reference.ticksToSeconds(tick)
        : (tick) =>
            typeof reference.beatsToSeconds === 'function'
                ? reference.beatsToSeconds(tick / ticksPerBeat)
                : 0

    const endTime = Number.isFinite(reference.durationSec)
        ? Number(reference.durationSec)
        : Number(history[history.length - 1]?.t) || 0
    const endTick = reference.getTickAtTime(endTime)
    const beatEnd = Math.ceil(endTick / ticksPerBeat)

    const notes = Array.isArray(reference.notes) ? reference.notes : []
    const curve = []
    let historyIdx = 0
    let noteIdx = 0
    for (let b = 0; b < beatEnd; b += 1) {
        const t0Tick = b * ticksPerBeat
        const t1Tick = (b + 1) * ticksPerBeat
        const t0 = ticksToSeconds(t0Tick)
        const t1 = ticksToSeconds(t1Tick)
        if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue
        if (t0 > endTime) break

        while (noteIdx < notes.length && notes[noteIdx].t1Sec <= t0) noteIdx += 1
        let hasTargetNote = false
        for (let n = noteIdx; n < notes.length; n += 1) {
            const note = notes[n]
            if (note.t0Sec >= t1) break
            if (note.t1Sec > t0 && note.t0Sec < t1) {
                hasTargetNote = true
                break
            }
        }

        if (!hasTargetNote) continue

        const f0HzValues = []
        const midiValues = []

        while (historyIdx < history.length && history[historyIdx].t < t0) historyIdx += 1
        for (let i = historyIdx; i < history.length; i += 1) {
            const point = history[i]
            if (!Number.isFinite(point?.t) || point.t >= t1) {
                if (Number.isFinite(point?.t) && point.t >= t1) break
                continue
            }
            const pointRms = Number.isFinite(point?.rms) ? Number(point.rms) : null
            if (Number.isFinite(pointRms) && pointRms < rmsGate) continue
            if (Number.isFinite(point?.f0Hz) && point.f0Hz > 0) {
                f0HzValues.push(Number(point.f0Hz))
            }
            if (Number.isFinite(point?.userMidi)) {
                midiValues.push(Number(point.userMidi))
            }
        }

        const f0Hz = medianNumber(f0HzValues)
        const midi = medianNumber(midiValues)
        curve.push({
            t: (t0 + t1) * 0.5,
            f0Hz: Number.isFinite(f0Hz) ? f0Hz : null,
            midi: Number.isFinite(midi) ? midi : null,
        })
    }

    return curve
}

function SingingPage({ onFinish, showInterludePrompt = true }) {
    const state = useKaraokeStore(useShallow((store) => ({
        ready: store.ready,
        status: store.status,
        playbackFinished: store.playbackFinished,
        midiName: store.midiName,
        midiUrl: store.midiUrl,
        currentTime: store.currentTime,
        duration: store.duration,
        transposition: store.transposition,
        queue: store.queue,
        queueIndex: store.queueIndex,
        playbackSessionId: store.playbackSessionId,
        lrcEntries: store.lrcEntries,
        activeLyricIndex: store.activeLyricIndex,
        karaokeProgress: store.karaokeProgress,
    })))
    const karaokeBackgroundVideoEnabled = useSettingsStore(
        (store) => store.karaokeBackgroundVideoEnabled,
    )
    const microphoneDeviceId = useSettingsStore((store) => store.microphoneDeviceId)
    const microphoneLatencyByDevice = useSettingsStore(
        (store) => store.microphoneLatencyByDevice,
    )
    const pitchEngine = sharedPitchEngine
    const [micActive, setMicActive] = useState(false)
    const [activeMicDeviceId, setActiveMicDeviceId] = useState('')
    const currentTimeRef = useRef(0)
    const transpositionRef = useRef(0)
    const [scoreUpdateKey, setScoreUpdateKey] = useState(0)
    const micRmsGate = 0.01
    const microphoneLatencySec = useMemo(() => {
        const key = normalizeMicrophoneDeviceKey(activeMicDeviceId || microphoneDeviceId)
        const latencyMs = Number(microphoneLatencyByDevice?.[key]?.latencyMs)
        if (!Number.isFinite(latencyMs)) return 0
        return Math.max(0, Math.min(1000, latencyMs)) / 1000
    }, [activeMicDeviceId, microphoneDeviceId, microphoneLatencyByDevice])
    const liveScore = usePlayerScoreStore((store) => store.liveScore)
    const liveScoreReady = usePlayerScoreStore((store) => store.liveScoreReady)
    const setLiveScore = usePlayerScoreStore((store) => store.setLiveScore)
    const setTechniqueCounts = usePlayerScoreStore((store) => store.setTechniqueCounts)
    const setResults = usePlayerScoreStore((store) => store.setResults)
    const setF0Curve = usePlayerScoreStore((store) => store.setF0Curve)
    const scoreSessionId = usePlayerScoreStore((store) => store.scoreSessionId)
    const beginPlayerScoreSession = usePlayerScoreStore((store) => store.beginPlayerScoreSession)
    const setSongInfo = usePlayerScoreStore((store) => store.setSongInfo)
    const showKeyChangeAlert = useKeyChangeAlertStore((store) => store.showKeyChangeAlert)
    const reference = useKaraokeReference({
        ready: state.ready,
        midiName: state.midiName,
        midiUrl: state.midiUrl,
        queueIndex: state.queueIndex,
    })
    const handleLiveScoreChange = useCallback((score, meta) => {
        if (
            meta?.initialization === true &&
            scoreSessionId === state.playbackSessionId
        ) {
            return
        }
        setLiveScore(score, meta?.ready === true)
        if (
            meta?.ready === true &&
            meta?.reset !== true &&
            Number(meta?.finalizedNotes) > 0
        ) {
            setScoreUpdateKey((key) => key + 1)
        }
    }, [scoreSessionId, setLiveScore, state.playbackSessionId])
    const { showSongInfo, songInfo } = useKaraokeSongIntro({
        midiUrl: state.midiUrl,
        midiName: state.midiName,
        queue: state.queue,
        queueIndex: state.queueIndex,
        playbackSessionId: state.playbackSessionId,
        transposition: state.transposition,
        showKeyChangeAlert,
        reference,
        currentTime: state.currentTime,
    })

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

    const interludeRanges = useMemo(
        () => findInterludeRanges(reference?.notes),
        [reference?.notes],
    )
    const interludeDisplay = useMemo(
        () => getInterludeDisplayState(interludeRanges, state.currentTime),
        [interludeRanges, state.currentTime],
    )

    const { pitchHistoryRef, fullHistoryRef, lastPitchRef, framePitchHistoryRef } = useKaraokePitchHistory({
        pitchEngine,
        reference,
        currentTimeRef,
        transpositionRef,
        rmsGate: micRmsGate,
        resetKey: state.playbackSessionId,
        microphoneLatencySec,
    })

    // Technique Detection
    const {
        techniqueEventsRef,
        activeTechniques,
        resetCounts,
        flush: flushTechniques,
    } = useSingingTechnique(
        pitchEngine,
        currentTimeRef,
        micActive,
        microphoneLatencySec,
        reference,
        micRmsGate,
    )

    // Scoring
    const { finalizeScore, scoringVisualRef } = useKaraokeScoring({
        pitchEngine,
        reference,
        currentTimeRef,
        transpositionRef,
        rmsGate: micRmsGate,
        debug: false,
        debugIntervalMs: 500,
        onScoreChange: handleLiveScoreChange,
        resetKey: state.playbackSessionId,
        microphoneLatencySec,
    })

    // Display and saved results share the same confirmed, per-note count.
    const techniqueCountsRef = useRef({ glissup: 0, kobushi: 0, glissdown: 0, vibrato: 0 })
    const handleTechniqueCountsChange = useCallback((counts) => {
        techniqueCountsRef.current = counts
        setTechniqueCounts(counts)
    }, [setTechniqueCounts])




    useEffect(() => {
        if (!pitchEngine) return
        pitchEngine.configureDetector({
            rmsGate: micRmsGate,
            enableRmsGate: micRmsGate > 0,
        })
    }, [pitchEngine, micRmsGate])
    // Live score now updates via onScoreChange from the scoring hook.

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
        const startedNewSession = beginPlayerScoreSession(state.playbackSessionId)
        if (!startedNewSession) return
        resetCounts()
        setF0Curve(null)
    }, [beginPlayerScoreSession, resetCounts, setF0Curve, state.playbackSessionId])

    useEffect(() => {
        if (songInfo) setSongInfo(songInfo)
    }, [setSongInfo, songInfo])

    useEffect(() => {
        let cancelled = false
        const start = async () => {
            try {
                const resolvedDeviceId = await startSharedMic()
                if (!cancelled) {
                    setActiveMicDeviceId(resolvedDeviceId || microphoneDeviceId || '')
                    setMicActive(true)
                }
            } catch (err) {
                if (!cancelled) console.error(err)
            }
        }
        start()
        return () => {
            cancelled = true
            stopSharedMic()
            setMicActive(false)
            setActiveMicDeviceId('')
        }
    }, [pitchEngine, microphoneDeviceId])

    // End of Song Detection
    const hasFinishedRef = useRef(false)

    // Reset finished flag on new song
    useEffect(() => {
        hasFinishedRef.current = false
    }, [state.playbackSessionId])

    useEffect(() => {
        if (!state.duration || state.duration < 10) return // Skip very short/invalid duration
        if (hasFinishedRef.current) return

        // Wait until playback has actually reached the end, then explicitly flush
        // the final active note and delayed note evaluations before reading score.
        if (
            state.playbackFinished
            || state.currentTime >= state.duration - 0.03
            || state.status === 'Finished'
        ) {
            hasFinishedRef.current = true
            if (onFinish) {
                const finalScore = finalizeScore(state.duration)
                const finalConfirmedSegments = scoringVisualRef.current?.allConfirmedSegments
                    || scoringVisualRef.current?.confirmedSegments || []
                void flushTechniques().then(() => {
                    const finalTechniques = countValidatedTechniqueEvents(
                        techniqueEventsRef.current,
                        reference?.notes || [],
                        finalConfirmedSegments,
                    )
                    techniqueCountsRef.current = finalTechniques
                    setTechniqueCounts(finalTechniques)
                    const history = Array.isArray(fullHistoryRef.current) ? fullHistoryRef.current : []
                    const f0Curve = buildF0CurveByBeat({
                        history,
                        reference,
                        rmsGate: micRmsGate,
                    })
                    setResults({ score: finalScore, techniques: finalTechniques, songInfo, f0Curve })
                    setF0Curve(f0Curve)
                    onFinish({ score: finalScore, techniques: finalTechniques, songInfo, f0Curve })
                })
            }
        }
    }, [
        state.currentTime,
        state.duration,
        state.playbackFinished,
        onFinish,
        finalizeScore,
        songInfo,
        state.status,
        setResults,
        setF0Curve,
        reference,
        fullHistoryRef,
        micRmsGate,
        flushTechniques,
        techniqueEventsRef,
        scoringVisualRef,
        setTechniqueCounts,
    ])

    const sceneStateRef = useRef(null)
    useLayoutSceneState(sceneStateRef, {
        ...state, reference, showSongInfo, songInfo, isScoring,
        liveScore, liveScoreReady, scoreUpdateKey, karaokeBackgroundVideoEnabled,
        showInterludePrompt, interludeDisplay, techniqueCountsRef,
    })

    return (
        <div className="karaokePage karaokePage--webgl" role="img" aria-label={`演奏 ${songInfo.title || ''}`}>
            <MelodyGuideCanvas
                className="singingWebGL"
                sceneFactory={createSingingScene}
                sceneStateRef={sceneStateRef}
                reference={reference}
                historyRef={pitchHistoryRef}
                pitchFrameHistoryRef={framePitchHistoryRef}
                scoringVisualRef={scoringVisualRef}
                lastPitchRef={lastPitchRef}
                currentTimeRef={currentTimeRef}
                transpositionRef={transpositionRef}
                rmsGate={micRmsGate}
                gateUserByTarget
                forceUserOnScoring={isScoring}
                techniqueEventsRef={techniqueEventsRef}
                vibratoCandidateActive={micActive && Boolean(activeTechniques.vibrato)}
                onTechniqueCountsChange={handleTechniqueCountsChange}
            />
        </div>
    )
}

// Publish React-owned data after commit; animation frames never trigger a React render.
function useLayoutSceneState(ref, value) {
    useLayoutEffect(() => { ref.current = value })
}

export default SingingPage
