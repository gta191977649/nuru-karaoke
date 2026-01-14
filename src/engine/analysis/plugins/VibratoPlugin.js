import { TechniquePlugin, techniqueRegistry } from '../TechniqueRegistry.js'

class VibratoPlugin extends TechniquePlugin {
    constructor() {
        super('vibrato', 'Vibrato')
        this.isActive = false // For UI debug
        this.minDuration = 0.35 // Seconds of vibrato to trigger an event
        this.state = {
            startTime: null,
            isVibrating: false
        }
    }

    analyze(time, f0Cents, historyBuffer) {
        if (!Number.isFinite(f0Cents) || historyBuffer.length < 10) {
            this._resetState()
            return null
        }

        // 1. Get recent window (~0.5s is enough for modulation detection of 5Hz = 200ms period)
        const windowSec = 0.5
        const now = historyBuffer[historyBuffer.length - 1].t
        const windowStart = now - windowSec

        // Extract recent valid pitch data
        const points = []
        for (let i = historyBuffer.length - 1; i >= 0; i--) {
            const p = historyBuffer[i]
            if (p.t < windowStart) break
            if (Number.isFinite(p.v)) points.push(p)
            // Break if gap is too large? simplified for now
        }
        points.reverse()

        if (points.length < 5) {
            this._resetState()
            return null
        }

        // 2. Simple Zero-Crossing Rate / Modulation check adapted for stream
        // Detrend (remove linear trend)
        const values = points.map(p => p.v)
        const times = points.map(p => p.t)

        // Linear regression (y = mx + c) to detrend
        const n = values.length
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
        for (let i = 0; i < n; i++) {
            sumX += times[i]
            sumY += values[i]
            sumXY += times[i] * values[i]
            sumXX += times[i] * times[i]
        }
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
        const intercept = (sumY - slope * sumX) / n
        const detrended = values.map((v, i) => v - (slope * times[i] + intercept))

        // Check modulation: Sign changes (Zero crossings)
        let crossings = 0
        for (let i = 1; i < n; i++) {
            if (Math.sign(detrended[i]) !== Math.sign(detrended[i - 1]) && Math.sign(detrended[i]) !== 0) {
                crossings++
            }
        }

        // Estimate frequency: crossings / 2 / duration
        const duration = times[n - 1] - times[0]
        if (duration < 0.2) return null // Need at least 200ms to detect 5Hz

        const rate = crossings / 2 / duration

        // Check extent (amplitude of modulation)
        // RMS of detrended signal
        let sumSq = 0
        for (const v of detrended) sumSq += v * v
        const rms = Math.sqrt(sumSq / n)
        // Approx peak amplitude is rms * sqrt(2) for sine, so extent is ~ peak
        const extent = rms * 1.414

        // Criteria from paper/reference:
        // Rate: 5Hz - 8Hz (relaxed to 4-9Hz for real-world)
        // Extent: > 30 cents

        const isVibrato = (rate >= 4 && rate <= 9) && (extent >= 25)

        if (isVibrato) {
            this.isActive = true
            if (!this.state.isVibrating) {
                this.state.isVibrating = true
                this.state.startTime = times[0]
            }
        } else {
            this.isActive = false
            if (this.state.isVibrating) {
                // Vibrato ended. Was it long enough to count?
                const vibDuration = now - this.state.startTime
                this.state.isVibrating = false
                this.state.startTime = null

                if (vibDuration >= this.minDuration) {
                    return { type: 'vibrato', duration: vibDuration }
                }
            }
        }

        return null
    }

    _resetState() {
        this.isActive = false
        if (this.state.isVibrating) {
            // logic for ending? assumes gap means end
            this.state.isVibrating = false
            this.state.startTime = null
        }
    }

    reset() {
        this._resetState()
    }
}

techniqueRegistry.register(new VibratoPlugin())
