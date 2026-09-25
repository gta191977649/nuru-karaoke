import { useRef, useEffect, useState, useCallback } from 'react'
import { resolveMicAlignedSongTime, resolveTechniqueFrameTime } from '../../engine/audio/micTiming.js'
import { getTargetNoteAtTick } from '../../engine/audio/midi/referenceMelody.js'

export function useSingingTechnique(
    pitchEngine,
    currentTimeRef,
    micActive,
    microphoneLatencySec = 0,
    reference = null,
    rmsGate = 0.01,
) {
    const workerRef = useRef(null)
    const flushRequestsRef = useRef(new Map())
    const flushIdRef = useRef(0)
    const detectionTimersRef = useRef(new Map())
    const previousActiveRef = useRef({})
    const debugPulseUntilRef = useRef({})

    // Real-time "active" state for debug UI
    const [activeTechniques, setActiveTechniques] = useState({})
    const [recentDetections, setRecentDetections] = useState({})

    // Trace history for debug graph (Circular buffers)
    const historySize = 300
    const techniqueEventsRef = useRef([])
    const latestAlignedTimeRef = useRef(0)
    const pitchClockRef = useRef(null)

    // Use state to hold stable mutable arrays - safe to access in render
    const [techniqueHistory] = useState(() => ({
        vibrato: new Array(historySize).fill(0),
        kobushi: new Array(historySize).fill(0),
        glissando: new Array(historySize).fill(0)
    }))

    useEffect(() => {
        if (!pitchEngine || !micActive) return
        const flushRequests = flushRequestsRef.current
        const detectionTimers = detectionTimersRef.current

        // Initialize Worker
        const worker = new Worker(
            new URL('../../engine/analysis/worker/technique.worker.js', import.meta.url),
            { type: 'module' }
        )
        workerRef.current = worker

        // Initialize the detector worker
        worker.postMessage({ type: 'init' })

        // Handle Worker Messages
        worker.onmessage = (e) => {
            const { type, events, activeTechniques: activeState, requestId } = e.data

            if (type === 'update') {
                // 1. Update Counts & History Log
                if (events && Object.keys(events).length > 0) {
                    for (const key in events) {
                        const evt = events[key]
                        if (!evt) continue
                        const detectedType = evt.type || key
                        const detectedEvent = { type: detectedType, t: latestAlignedTimeRef.current, ...evt }
                        techniqueEventsRef.current.push(detectedEvent)
                        console.log('[SingingTechnique] candidate', detectedEvent)
                        debugPulseUntilRef.current[detectedType] = latestAlignedTimeRef.current + 0.6
                        setRecentDetections(prev => ({ ...prev, [detectedType]: true }))
                        clearTimeout(detectionTimers.get(detectedType))
                        detectionTimers.set(detectedType, setTimeout(() => {
                            setRecentDetections(prev => ({ ...prev, [detectedType]: false }))
                            detectionTimers.delete(detectedType)
                        }, 1200))
                    }
                }

                // 2. Update Active State
                if (activeState) {
                    const active = activeState
                    for (const detectedType of ['vibrato', 'kobushi', 'glissup', 'glissdown']) {
                        if (active[detectedType] && !previousActiveRef.current[detectedType]) {
                            console.log('[SingingTechnique] active', {
                                type: detectedType,
                                t: latestAlignedTimeRef.current,
                            })
                        }
                    }
                    previousActiveRef.current = { ...active }
                    const hist = techniqueHistory

                    const pulsing = type => debugPulseUntilRef.current[type] > latestAlignedTimeRef.current
                    hist.vibrato.push(active.vibrato || pulsing('vibrato') ? 1.0 : 0.0)
                    if (hist.vibrato.length > historySize) hist.vibrato.shift()

                    hist.kobushi.push(active.kobushi || pulsing('kobushi') ? 1.0 : 0.0)
                    if (hist.kobushi.length > historySize) hist.kobushi.shift()

                    let gVal = 0.0
                    if (active.glissup || pulsing('glissup')) gVal = 1.0
                    else if (active.glissdown || pulsing('glissdown')) gVal = -1.0

                    hist.glissando.push(gVal)
                    if (hist.glissando.length > historySize) hist.glissando.shift()

                    setActiveTechniques({ ...active })
                }
                if (requestId != null) {
                    flushRequests.get(requestId)?.()
                    flushRequests.delete(requestId)
                }
            }
        }
        worker.onerror = () => {
            for (const resolve of flushRequests.values()) resolve()
            flushRequests.clear()
            for (const timer of detectionTimers.values()) clearTimeout(timer)
            detectionTimers.clear()
        }

        // Subscribe to high-frequency pitch updates
        const unsubscribe = pitchEngine.onPitch((result) => {
            const songTime = resolveMicAlignedSongTime({
                pitch: result,
                songTimeSec: currentTimeRef?.current,
                microphoneLatencySec,
                audioContext: pitchEngine.getAudioContext?.(),
            })
            const frameTime = Number.isFinite(result.tAcSec) ? result.tAcSec : null
            const previousClock = pitchClockRef.current
            const alignedSongTime = resolveTechniqueFrameTime({
                songTime, frameTime, previousClock, hasReference: Boolean(reference),
            })
            if (!Number.isFinite(alignedSongTime)) return
            pitchClockRef.current = { frameTime, songTime, alignedTime: alignedSongTime }
            latestAlignedTimeRef.current = alignedSongTime
            const tick = reference?.getTickAtTime?.(alignedSongTime) ?? alignedSongTime
            const note = reference ? getTargetNoteAtTick(reference, tick, { maxGapTick: 0, edgeToleranceTick: 0 }) : null
            const noteId = reference
                ? (note ? `${note.t0Sec}:${note.t1Sec}:${note.midi}` : '')
                : undefined

            worker.postMessage({
                type: 'push',
                payload: {
                    time: alignedSongTime,
                    rawMidi: result.rawMidi,
                    confidence: result.rawConfidence ?? result.confidence,
                    rms: result.rms,
                    rmsGate,
                    noteId,
                    noteStartSec: note?.t0Sec,
                    noteEndSec: note?.t1Sec,
                }
            })
        })

        return () => {
            unsubscribe()
            worker.terminate()
            if (workerRef.current === worker) workerRef.current = null
            for (const resolve of flushRequests.values()) resolve()
            flushRequests.clear()
            for (const timer of detectionTimers.values()) clearTimeout(timer)
            detectionTimers.clear()
            pitchClockRef.current = null
            debugPulseUntilRef.current = {}
        }
    }, [pitchEngine, micActive, techniqueHistory, currentTimeRef, microphoneLatencySec, reference, rmsGate])

    const flush = useCallback(() => new Promise(resolve => {
        const worker = workerRef.current
        if (!worker) {
            resolve()
            return
        }
        const requestId = ++flushIdRef.current
        flushRequestsRef.current.set(requestId, resolve)
        worker.postMessage({ type: 'flush', requestId })
    }), [])

    const resetCounts = useCallback(() => {
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'reset' })
        }
        techniqueEventsRef.current = [] // Clear accumulated events
        pitchClockRef.current = null
        previousActiveRef.current = {}
        debugPulseUntilRef.current = {}
        setActiveTechniques({})
        setRecentDetections({})
        for (const timer of detectionTimersRef.current.values()) clearTimeout(timer)
        detectionTimersRef.current.clear()
        const hist = techniqueHistory
        hist.vibrato.fill(0)
        hist.kobushi.fill(0)
        hist.glissando.fill(0)
    }, [techniqueHistory])

    return {
        activeTechniques,
        recentDetections,
        techniqueHistory,
        techniqueEventsRef,
        resetCounts,
        flush,
    }
}
