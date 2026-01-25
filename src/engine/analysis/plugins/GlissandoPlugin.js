import { TechniquePlugin, techniqueRegistry } from '../TechniqueRegistry.js'

class GlissandoPlugin extends TechniquePlugin {
    constructor() {
        super('glissando', 'Glissando')
        this.isActive = false
        this.state = {
            direction: null, // 'up' or 'down'
            startX: null,
            startY: null,
            potential: false
        }
        this.lastEventTime = 0
    }

    analyze(time, f0Cents, historyBuffer) {
        if (!Number.isFinite(f0Cents) || historyBuffer.length < 5) {
            this.isActive = false
            this.state = { direction: null, potential: false }
            return null
        }

        // Glissando / Scoop / Fall:
        // Monotonic pitch change over a duration.
        // "Shakuri" (GlissUp): Approach note from below.
        // "Fall" (GlissDown): Leave note downwards.

        // Detection strategy:
        // Look at short term slope (last 150-200ms)
        // If slope is consistently high positive -> Gliss Up candidate
        // If slope is consistently high negative -> Gliss Down candidate
        // If we detect a stable region AFTER a Gliss Up -> Trigger Shakuri
        // If we detect a silence/end AFTER a Gliss Down -> Trigger Fall

        const lookback = 0.2 // 200ms slope
        const now = historyBuffer[historyBuffer.length - 1].t
        const startWindow = now - lookback

        // Get points in window
        let pStart = null
        const pEnd = historyBuffer[historyBuffer.length - 1]

        for (let i = historyBuffer.length - 2; i >= 0; i--) {
            if (historyBuffer[i].t < startWindow) {
                pStart = historyBuffer[i]
                break
            }
        }

        if (!pStart) return null

        const dt = pEnd.t - pStart.t
        const dv = pEnd.v - pStart.v // Cents change
        if (dt < 0.1) return null;

        const slope = dv / dt // Cents per second
        // Threshold: e.g. 500 cents/sec (half octave per sec) is pretty fast gliss
        // Shakuri usually ~ 2-3 semitones (200-300 cents) over ~0.2s => 1000 cents/sec

        const threshold = 600

        if (slope > threshold) {
            // Gliss Up
            this.isActive = true
            this.state.direction = 'up'
            this.state.potential = true
            this.state.startTime = now
        }
        else if (slope < -threshold) {
            // Gliss Down
            this.isActive = true
            this.state.direction = 'down'
            this.state.potential = true
            this.state.startTime = now
        }
        else {
            // Slope is stable(ish)
            // If we were potentially glissing, check if we "landed"

            if (this.state.potential && this.state.direction) {


                // Debounce: Only count if it hasn't been triggered very recently (0.5s)
                if (now - this.lastEventTime > 0.5) {
                    if (this.state.direction === 'up') {
                        // Landed after going up = Shakuri
                        this.lastEventTime = now
                        const evt = { type: 'glissup' }
                        this._resetState()
                        return evt
                    } else if (this.state.direction === 'down') {
                        // For Fall, usually we end in silence or drop significantly. 
                        // If we stabilized, it might just be a pitch correction.
                        // But let's count it for now if magnitude was sufficient.
                        // Ideally Fall ends in silence/unvoiced.

                        this.lastEventTime = now
                        const evt = { type: 'glissdown' }
                        this._resetState()
                        return evt
                    }
                }
            }
            this._resetState()
        }

        return null
    }

    _resetState() {
        this.isActive = false
        this.state = { direction: null, potential: false, startTime: 0 }
    }

    reset() {
        this._resetState()
        this.lastEventTime = 0
    }
}

techniqueRegistry.register(new GlissandoPlugin())
