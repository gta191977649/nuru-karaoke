import { useRef, useEffect, useState } from 'react'
import { SingingTechniqueDetector } from '../../engine/analysis/SingingTechniqueDetector.js'
// Ensure plugins are registered by importing them (side-effect)
import '../../engine/analysis/plugins/VibratoPlugin.js'
import '../../engine/analysis/plugins/KobushiPlugin.js'
import '../../engine/analysis/plugins/GlissandoPlugin.js'

export function useSingingTechnique(pitchEngine) {
    const detectorRef = useRef(null)

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
    const historySize = 300 // Approx 5s at 60fps? No, we update at 15fps... 300 frames * 60ms = 18s. Let's stick to ~300.
    const historyRef = useRef({
        vibrato: new Array(historySize).fill(0),
        kobushi: new Array(historySize).fill(0),
        glissando: new Array(historySize).fill(0)
    })

    // Initialize detector only once
    if (!detectorRef.current) {
        detectorRef.current = new SingingTechniqueDetector()
    }

    useEffect(() => {
        if (!pitchEngine) return

        const detector = detectorRef.current
        let frameId
        let lastAnalyze = 0
        let lastHistoryUpdate = 0
        const historyUpdateInterval = 50 // Update history ~20fps?

        // Subscribe to high-frequency pitch updates
        const unsubscribe = pitchEngine.onPitch((result) => {
            const time = result.time || (performance.now() / 1000)
            const f0 = result.f0Hz

            // Push data
            detector.push(time, f0)
        })

        // Setup Analysis Loop
        const loop = (timestamp) => {
            frameId = requestAnimationFrame(loop)

            // Throttle analysis to ~15fps (every 60ms) to save CPU
            if (timestamp - lastAnalyze < 60) return;
            lastAnalyze = timestamp;

            // Run detection
            const newEvents = detector.analyze()

            // Update Counts if events detected
            if (Object.keys(newEvents).length > 0) {
                setCounts(prev => {
                    const next = { ...prev }
                    let changed = false
                    for (const key in newEvents) {
                        if (newEvents[key]) {
                            const evt = newEvents[key]
                            const type = evt.type || key

                            if (next[type] !== undefined) {
                                next[type]++
                                changed = true
                            }
                        }
                    }
                    return changed ? next : prev
                })
            }

            // Update History Buffers
            const active = detector.activeTechniques
            const hist = historyRef.current

            // Vibrato
            hist.vibrato.push(active.vibrato ? 1.0 : 0.0)
            if (hist.vibrato.length > historySize) hist.vibrato.shift()

            // Kobushi
            hist.kobushi.push(active.kobushi ? 1.0 : 0.0)
            if (hist.kobushi.length > historySize) hist.kobushi.shift()

            // Glissando (Up = 1, Down = -1, None = 0)
            let gVal = 0.0
            if (active.glissup) gVal = 1.0
            else if (active.glissdown) gVal = -1.0 // WaveformPixi centers 0, so -1 is bottom, 1 is top.

            hist.glissando.push(gVal)
            if (hist.glissando.length > historySize) hist.glissando.shift()

            // Update Active State (for debug UI)
            // This triggers the re-render which will pass the updated arrays to children
            // Creating new object ref for history arrays not needed if WaveformPixi reads direct,
            // but typically React needs prop check. WaveformPixi memoizes on `data`.
            // We should stick to passing the Ref or clones.

            setActiveTechniques(prev => {
                const next = { ...active }
                // Shallow compare
                let diff = false
                const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
                for (const k of keys) {
                    if (prev[k] !== next[k]) {
                        diff = true
                        break
                    }
                }
                // Always trigger update if history changed?
                // If we rely on activeTechniques state to drive the render loop,
                // we might not render if active state is constant (e.g. constant off).
                // But we want the graph to scroll!
                // So we MUST force update every frame or at least frequently.
                // Let's modify the comparison to always return new object if we want continuous graph updates?
                // Yes, graph needs to scroll.
                return next
            })
        }

        frameId = requestAnimationFrame(loop)

        return () => {
            unsubscribe()
            cancelAnimationFrame(frameId)
        }
    }, [pitchEngine])

    const resetCounts = () => {
        setCounts({ vibrato: 0, kobushi: 0, glissup: 0, glissdown: 0 })
        detectorRef.current.reset()
        // Reset history
        const hist = historyRef.current
        hist.vibrato.fill(0)
        hist.kobushi.fill(0)
        hist.glissando.fill(0)
    }

    return {
        counts,
        activeTechniques, // { vibrato: bool, kobushi: bool, glissando: bool }
        techniqueHistory: {
            vibrato: [...historyRef.current.vibrato],
            kobushi: [...historyRef.current.kobushi],
            glissando: [...historyRef.current.glissando]
        },
        resetCounts
    }
}
