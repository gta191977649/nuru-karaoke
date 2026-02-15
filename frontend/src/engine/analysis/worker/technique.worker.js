
import { SingingTechniqueDetector } from '../SingingTechniqueDetector.js'
// Import plugins to register them
import '../plugins/VibratoPlugin.js'
import '../plugins/KobushiPlugin.js'
import '../plugins/GlissandoPlugin.js'

let detector = null

const analyzeLoopInterval = 50 // ms (20fps)
let lastAnalyze = 0
let loopId = null

function init() {
    if (!detector) {
        detector = new SingingTechniqueDetector()
    }
}

function loop() {
    const now = performance.now()
    if (now - lastAnalyze >= analyzeLoopInterval) {
        lastAnalyze = now

        // Run analysis
        const newEvents = detector.analyze()
        const activeTechniques = detector.activeTechniques

        // Only post back if there's something relevant? 
        // Or just post back active state constantly for UI?
        // Let's post back active state + events.

        // Optimize: only post if events detected OR active state changed?
        // Or just throttle postMessage to 20fps as well.

        self.postMessage({
            type: 'update',
            events: newEvents,
            activeTechniques: activeTechniques
        })
    }

    // Schedule next
    // We can use setTimeout in worker
    loopId = setTimeout(loop, 1000 / 60) // Check frequently, throttle inside
}


self.onmessage = (e) => {
    const { type, payload } = e.data

    if (type === 'init') {
        init()
        loop()
    }
    else if (type === 'push') {
        if (!detector) init()
        // { time, f0 }
        detector.push(payload.time, payload.f0)
    }
    else if (type === 'reset') {
        if (detector) detector.reset()
    }
    else if (type === 'stop') {
        if (loopId) clearTimeout(loopId)
    }
}
