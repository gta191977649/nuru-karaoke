import { useRef, useEffect, useState } from 'react'

export function useSingingTechnique(pitchEngine, currentTimeRef) {
    const workerRef = useRef(null)

    // Accumulated counts for the session
    const [counts, setCounts] = useState({
        vibrato: 0,
        kobushi: 0,
        glissup: 0,
        glissdown: 0
    })

    // Real-time "active" state for debug UI
    const [activeTechniques, setActiveTechniques] = useState({})

    // Trace history for debug graph (Circular buffers)
    const historySize = 300
    const techniqueEventsRef = useRef([])
    const historyRef = useRef({
        vibrato: new Array(historySize).fill(0),
        kobushi: new Array(historySize).fill(0),
        glissando: new Array(historySize).fill(0)
    })

    useEffect(() => {
        if (!pitchEngine) return

        // Initialize Worker
        const worker = new Worker(
            new URL('../../engine/analysis/worker/technique.worker.js', import.meta.url),
            { type: 'module' }
        )
        workerRef.current = worker

        // Init Worker Loop
        worker.postMessage({ type: 'init' })

        // Handle Worker Messages
        worker.onmessage = (e) => {
            const { type, events, activeTechniques: activeState } = e.data

            if (type === 'update') {
                // 1. Update Counts & History Log
                if (events && Object.keys(events).length > 0) {
                    setCounts(prev => {
                        const next = { ...prev }
                        let changed = false
                        for (const key in events) {
                            if (events[key]) {
                                const evt = events[key]
                                const type = evt.type || key
                                if (next[type] !== undefined) {
                                    next[type]++
                                    changed = true
                                }

                                // Push to event history for visualization
                                const songTime = currentTimeRef?.current ?? 0
                                techniqueEventsRef.current.push({
                                    type,
                                    t: songTime,
                                    ...evt
                                })
                            }
                        }
                        // Prune old events
                        if (techniqueEventsRef.current.length > 500) {
                            techniqueEventsRef.current = techniqueEventsRef.current.slice(-500)
                        }
                        return changed ? next : prev
                    })
                }

                // 2. Update Active State
                if (activeState) {
                    const active = activeState
                    const hist = historyRef.current

                    hist.vibrato.push(active.vibrato ? 1.0 : 0.0)
                    if (hist.vibrato.length > historySize) hist.vibrato.shift()

                    hist.kobushi.push(active.kobushi ? 1.0 : 0.0)
                    if (hist.kobushi.length > historySize) hist.kobushi.shift()

                    let gVal = 0.0
                    if (active.glissup) gVal = 1.0
                    else if (active.glissdown) gVal = -1.0

                    hist.glissando.push(gVal)
                    if (hist.glissando.length > historySize) hist.glissando.shift()

                    setActiveTechniques(prev => ({ ...active }))
                }
            }
        }

        // Subscribe to high-frequency pitch updates
        const unsubscribe = pitchEngine.onPitch((result) => {
            const time = result.time || (performance.now() / 1000)
            const f0 = result.f0Hz

            worker.postMessage({
                type: 'push',
                payload: { time, f0 }
            })
        })

        return () => {
            unsubscribe()
            workerRef.current?.postMessage({ type: 'stop' }) // Use ref specific check
            workerRef.current?.terminate()
        }
    }, [pitchEngine])

    const resetCounts = () => {
        setCounts({ vibrato: 0, kobushi: 0, glissup: 0, glissdown: 0 })
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'reset' })
        }
        const hist = historyRef.current
        hist.vibrato.fill(0)
        hist.kobushi.fill(0)
        hist.glissando.fill(0)
    }

    return {
        counts,
        activeTechniques,
        techniqueHistory: {
            vibrato: [...historyRef.current.vibrato],
            kobushi: [...historyRef.current.kobushi],
            glissando: [...historyRef.current.glissando]
        },
        techniqueEventsRef,
        resetCounts
    }
}
