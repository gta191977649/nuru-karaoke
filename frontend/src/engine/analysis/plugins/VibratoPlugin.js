import { TechniquePlugin, techniqueRegistry } from '../TechniqueRegistry.js'

// Based on allkaraoke's alternating pitch-direction changes and interval test.
export const VIBRATO_CONFIG = Object.freeze({
    windowSec: 0.95,
    reversalCents: 10,
    turnCount: 5,
    intervalRatio: 1.75,
    minRateHz: 3,
    maxRateHz: 8,
    rateToleranceHz: 0.2,
    minExtentCents: 15,
    maxExtentCents: 150,
    maxFrameGapSec: 0.08,
    mergeGapSec: 0.18,
    analyzeStepSec: 0.04,
})

export function measureVibrato(points, config = VIBRATO_CONFIG) {
    if (points.length < 10) return null
    // A short local average removes frame-to-frame F0 jitter without flattening
    // the slower 3-8 Hz pitch modulation that defines vibrato.
    const smooth = points.map((point, i) => {
        let sum = 0
        let count = 0
        for (let j = Math.max(0, i - 8); j < Math.min(points.length, i + 9); j++) {
            if (Math.abs(points[j].t - point.t) > 0.025) continue
            sum += points[j].v
            count++
        }
        return { t: point.t, v: sum / count }
    })
    const turns = []
    let extreme = smooth[0]
    let direction = 0
    for (let i = 1; i < smooth.length; i++) {
        const point = smooth[i]
        if (!direction) {
            if (Math.abs(point.v - extreme.v) >= config.reversalCents) {
                direction = Math.sign(point.v - extreme.v)
                extreme = point
            } else if (Math.abs(point.v - smooth[0].v) < config.reversalCents) {
                extreme = point.v < extreme.v ? point : extreme
            }
        } else if ((point.v - extreme.v) * direction >= 0) {
            extreme = point
        } else if (Math.abs(point.v - extreme.v) >= config.reversalCents) {
            turns.push(extreme)
            direction *= -1
            extreme = point
        }
    }
    if (turns.length < config.turnCount) return null
    for (let end = turns.length; end >= config.turnCount; end--) {
        const selected = turns.slice(end - config.turnCount, end)
        const intervals = selected.slice(1).map((turn, i) => turn.t - selected[i].t)
        const average = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
        if (average <= 0 || points.at(-1).t - selected.at(-1).t > Math.min(0.2, average * 1.25)) continue
        const shortest = Math.min(...intervals)
        const longest = Math.max(...intervals)
        if (longest >= average * config.intervalRatio ||
            shortest <= average / config.intervalRatio ||
            longest >= shortest * config.intervalRatio) continue
        const rateHz = 1 / (2 * average)
        // Discrete pitch frames can shift a boundary rate slightly (3 Hz to 2.97 Hz).
        if (rateHz < config.minRateHz - config.rateToleranceHz ||
            rateHz > config.maxRateHz + config.rateToleranceHz) continue
        const extentCents = selected.slice(1).reduce(
            (sum, turn, i) => sum + Math.abs(turn.v - selected[i].v), 0,
        ) / (2 * intervals.length)
        if (extentCents < config.minExtentCents || extentCents > config.maxExtentCents) continue
        const contour = smooth.filter(point => point.t >= selected[0].t && point.t <= selected.at(-1).t)
        const pitches = contour.map(point => point.v).sort((a, b) => a - b)
        const middle = Math.floor(pitches.length / 2)
        const centerCents = pitches.length % 2
            ? pitches[middle]
            : (pitches[middle - 1] + pitches[middle]) / 2
        const regularity = shortest / longest
        return { start: selected[0].t, end: selected.at(-1).t, rateHz, extentCents, centerMidi: centerCents / 100, fit: regularity }
    }
    return null
}

export class VibratoPlugin extends TechniquePlugin {
    constructor(config = VIBRATO_CONFIG) {
        super('vibrato', 'Vibrato')
        this.config = config
        this.reset()
    }

    analyze(time, f0Cents, historyBuffer) {
        if (!Number.isFinite(f0Cents)) {
            if (this.lastValidTime != null && time - this.lastValidTime <= this.config.maxFrameGapSec) return null
            return this.flush()
        }
        if (this.lastValidTime != null && time - this.lastValidTime > this.config.maxFrameGapSec) {
            const event = this.flush()
            this.lastValidTime = time
            if (event) return event
        }
        this.lastValidTime = time
        if (time - this.lastAnalysis < this.config.analyzeStepSec) return null
        this.lastAnalysis = time
        const points = []
        let nextValidTime = time
        for (let i = historyBuffer.length - 1; i >= 0; i--) {
            const point = historyBuffer[i]
            if (point.t < time - this.config.windowSec) break
            if (!Number.isFinite(point.v)) continue
            if (nextValidTime - point.t > this.config.maxFrameGapSec + 1e-9) break
            points.push(point)
            nextValidTime = point.t
        }
        points.reverse()
        const measurement = measureVibrato(points, this.config)
        if (measurement) {
            if (!this.segment) this.segment = { start: measurement.start, end: time }
            this.segment.end = time
            this.isActive = true
            if (!this.emitted) {
                this.emitted = true
                return {
                    type: 'vibrato',
                    start: measurement.start,
                    end: measurement.end,
                    t: (measurement.start + measurement.end) / 2,
                    duration: measurement.end - measurement.start,
                    rateHz: measurement.rateHz,
                    extentCents: measurement.extentCents,
                    centerMidi: measurement.centerMidi,
                    confidence: measurement.fit,
                }
            }
            return null
        }
        if (this.segment && time - this.segment.end > this.config.mergeGapSec) return this.flush()
        return null
    }

    flush() {
        this.segment = null
        this.isActive = false
        this.lastAnalysis = -Infinity
        this.lastValidTime = null
        this.emitted = false
        return null
    }

    reset() {
        this.segment = null
        this.isActive = false
        this.lastAnalysis = -Infinity
        this.lastValidTime = null
        this.emitted = false
    }
}

techniqueRegistry.register(new VibratoPlugin())
