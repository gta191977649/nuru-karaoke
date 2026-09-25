import { TechniquePlugin, techniqueRegistry } from '../TechniqueRegistry.js'

const MIN_MAIN_PEAK_CENTS = 150
const MIN_REVERSAL_CENTS = 20
const COOLDOWN_SEC = 0.4

function recentContour(history, time) {
    const points = []
    let nextTime = time
    for (let i = history.length - 1; i >= 0; i--) {
        const point = history[i]
        if (point.t < time - 0.5) break
        if (!Number.isFinite(point.v) || nextTime - point.t > 0.08) break
        points.push(point)
        nextTime = point.t
    }
    points.reverse()
    return points.map(point => {
        const neighbours = points.filter(other => Math.abs(other.t - point.t) <= 0.015)
        return { t: point.t, v: neighbours.reduce((sum, item) => sum + item.v, 0) / neighbours.length }
    })
}

function significantTurns(points) {
    if (!points.length) return []
    const turns = []
    let extreme = points[0]
    let direction = 0
    for (const point of points.slice(1)) {
        if (!direction) {
            if (Math.abs(point.v - extreme.v) >= MIN_REVERSAL_CENTS) {
                direction = Math.sign(point.v - extreme.v)
                turns.push(extreme)
                extreme = point
            }
        } else if ((point.v - extreme.v) * direction >= 0) {
            extreme = point
        } else if (Math.abs(point.v - extreme.v) >= MIN_REVERSAL_CENTS) {
            turns.push(extreme)
            direction *= -1
            extreme = point
        }
    }
    return turns
}

export class KobushiPlugin extends TechniquePlugin {
    constructor() {
        super('kobushi', 'Kobushi')
        this.reset()
    }

    analyze(time, f0Cents, historyBuffer, activeTechniques) {
        this.isActive = false
        if (activeTechniques?.vibrato || !Number.isFinite(f0Cents) ||
            time < this.cooldownUntil) return null
        const turns = significantTurns(recentContour(historyBuffer, time))
        for (let i = turns.length - 2; i >= 1; i--) {
            const left = turns[i - 1]
            const main = turns[i]
            const right = turns[i + 1]
            const duration = right.t - left.t
            if (duration < 0.12 || duration > 0.4 || time - right.t > 0.08) continue
            if (Math.abs(left.v - right.v) > 50) continue
            const leftHeight = Math.abs(main.v - left.v)
            const rightHeight = Math.abs(main.v - right.v)
            if (Math.min(leftHeight, rightHeight) < MIN_MAIN_PEAK_CENTS) continue
            const leftSlope = leftHeight / (main.t - left.t)
            const rightSlope = rightHeight / (right.t - main.t)
            if (Math.max(leftSlope, rightSlope) < 1000) continue
            if (Math.abs(main.t - this.lastDetectTime) < COOLDOWN_SEC) continue
            this.lastDetectTime = main.t
            this.cooldownUntil = time + COOLDOWN_SEC
            this.isActive = true
            return {
                type: 'kobushi', t: main.t,
                start: left.t, end: right.t,
                height: Math.max(leftHeight, rightHeight),
            }
        }
        return null
    }

    reset() {
        this.isActive = false
        this.cooldownUntil = -Infinity
        this.lastDetectTime = -Infinity
    }
}

techniqueRegistry.register(new KobushiPlugin())
