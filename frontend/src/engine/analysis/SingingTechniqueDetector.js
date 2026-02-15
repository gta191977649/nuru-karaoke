import { techniqueRegistry } from './TechniqueRegistry.js'

/**
 * Manager class that buffers pitch data and runs analysis plugins.
 */
export class SingingTechniqueDetector {
    constructor(config = {}) {
        this.bufferSize = config.bufferSize || 512 // Approx 5 seconds at ~100Hz
        this.buffer = [] // Circular buffer of { t: seconds, v: cents }
        this.lastAnalyzeTime = 0
        this.analyzeInterval = config.analyzeInterval || 0.1 // Run analysis every 100ms
        this.activeTechniques = {} // { [pluginId]: boolean } - is currently active?

        // Auto-load all registered plugins by default
        this.plugins = techniqueRegistry.list()
    }

    /**
     * Add a new data point to the circular buffer.
     * @param {number} time - Seconds
     * @param {number|null} f0Hz - Pitch in Hz
     */
    push(time, f0Hz) {
        // Convert Hz to Cents for easier analysis (logarithmic scale)
        // 69 is A4 (440Hz). Cents = 1200 * log2(f0 / 440) + 6900 ... relative to MIDI 0? 
        // Actually, let's just use standard MIDI cents: MIDI * 100
        // MIDI = 69 + 12 * log2(f0 / 440)
        let cents = NaN
        if (Number.isFinite(f0Hz) && f0Hz > 0) {
            const midi = 69 + 12 * Math.log2(f0Hz / 440)
            cents = midi * 100
        }

        this.buffer.push({ t: time, v: cents })

        // Maintain buffer size (simple array shift for active window is okay for this size)
        // For strictly circular, we'd use an index, but array operations on ~500 items are negligible in JS
        if (this.buffer.length > this.bufferSize) {
            this.buffer.shift()
        }
    }

    /**
     * Run enabled plugins on the current buffer.
     * Should be called periodically (e.g. from the hook's raf/interval).
     * @returns {Object} detectedEvents - Map of { [pluginId]: event || null }
     */
    analyze() {
        const now = this.buffer.length > 0 ? this.buffer[this.buffer.length - 1].t : 0
        if (now - this.lastAnalyzeTime < this.analyzeInterval) {
            return {}
        }
        this.lastAnalyzeTime = now

        // Get the current valid pitch (or NaN)
        const currentPoint = this.buffer[this.buffer.length - 1]
        const f0Cents = currentPoint ? currentPoint.v : NaN

        const results = {}

        for (const plugin of this.plugins) {
            try {
                const event = plugin.analyze(now, f0Cents, this.buffer, this.activeTechniques)

                // Update active state based on whether event is returned "in progress" or "just finished"
                // The plugin contract: 
                // - Return { ... } if an event *just completed* or is *actively being counted as a discrete event*
                // - Ideally, we want to pulse the "active" state for UI

                if (event) {
                    results[plugin.id] = event
                    this.activeTechniques[plugin.id] = true
                } else {
                    // If plugin returns null, it *might* still be internally "active" (mid-vibrato)
                    // but for the purpose of "counting new events", we only care when it returns one.
                    // For UI "active light", we might need the plugin to export `isActive`.
                    // For now, let's reset active flag if no event returned (simple pulse)
                    // OR we can rely on the plugin to return { type: 'technique', active: true }

                    this.activeTechniques[plugin.id] = false
                    // Note: Real implementations might smooth this. 
                    // Let's assume plugins attach `isActive` property to themselves or return it.
                }

                // Better approach: Check plugin instance state if available
                if (typeof plugin.isActive === 'boolean') {
                    this.activeTechniques[plugin.id] = plugin.isActive
                }

            } catch (err) {
                console.warn(`[SingingTechniqueDetector] Error in plugin ${plugin.id}:`, err)
            }
        }

        return results
    }

    reset() {
        this.buffer = []
        this.lastAnalyzeTime = 0
        this.activeTechniques = {}
        for (const plugin of this.plugins) {
            plugin.reset()
        }
    }
}
