import { TechniquePlugin, techniqueRegistry } from '../TechniqueRegistry.js'

const MIN_SLIDE_CENTS = 200
const MAX_FRAME_GAP_SEC = 0.08

function recentVoicedPoints(history, time) {
    const points = []
    let nextTime = time
    for (let i = history.length - 1; i >= 0; i--) {
        const point = history[i]
        if (point.t < time - 0.4) break
        if (!Number.isFinite(point.v) || nextTime - point.t > MAX_FRAME_GAP_SEC) break
        points.push(point)
        nextTime = point.t
    }
    return points.reverse()
}

function findSlide(points, direction) {
    const end = points.at(-1)
    if (!end) return null
    for (const start of points) {
        const duration = end.t - start.t
        if (duration < 0.12 || duration > 0.4) continue
        const portion = points.filter(point => point.t >= start.t)
        let forward = 0
        let backward = 0
        let movingFrames = 0
        let largestStep = 0
        for (let i = 1; i < portion.length; i++) {
            const step = (portion[i].v - portion[i - 1].v) * direction
            if (step > 0) forward += step
            else backward -= step
            if (step > 3) movingFrames++
            largestStep = Math.max(largestStep, Math.abs(step))
        }
        const displacement = (end.v - start.v) * direction
        if (displacement >= MIN_SLIDE_CENTS && backward <= 40 &&
            displacement / Math.max(1, forward + backward) >= 0.8 &&
            movingFrames >= 8 && largestStep <= 80) {
            return { start: start.t, end: end.t, extentCents: displacement }
        }
    }
    return null
}

export class GlissandoPlugin extends TechniquePlugin {
    constructor() {
        super('glissando', 'Glissando')
        this.reset()
    }

    analyze(time, f0Cents, historyBuffer, _activeTechniques, note) {
        const noteStart = Number(note?.startSec)
        const noteEnd = Number(note?.endSec)
        if (!Number.isFinite(noteStart) || !Number.isFinite(noteEnd) ||
            noteEnd - noteStart < 0.3 || time > noteEnd + 0.03) {
            this.state = null
            return null
        }
        if (!Number.isFinite(f0Cents)) return this.flush()
        if (this.emitted) return null
        const points = recentVoicedPoints(historyBuffer, time)
        if (this.state?.direction === 'up') {
            const settled = points.filter(point => point.t >= time - 0.08)
            if (settled.length >= 5 && settled.at(-1).t - settled[0].t >= 0.07 &&
                Math.max(...settled.map(point => point.v)) - Math.min(...settled.map(point => point.v)) <= 35 &&
                time - this.state.end >= 0.08 && time <= noteStart + 0.55) {
                return this.emit('glissup', time)
            }
        } else if (this.state?.direction === 'down') {
            if (time >= noteEnd - 0.04 && noteEnd - this.state.end <= 0.15) {
                return this.emit('glissdown', time)
            }
        }
        if (this.state) return null

        const up = findSlide(points, 1)
        if (up && up.start <= noteStart + Math.min(0.18, (noteEnd - noteStart) * 0.25)) {
            this.state = { direction: 'up', ...up, noteEnd }
            return null
        }
        const down = findSlide(points, -1)
        if (down && time >= noteEnd - 0.3) {
            this.state = { direction: 'down', ...down, noteEnd }
        }
        return null
    }

    emit(type, time) {
        const event = {
            type, t: time, start: this.state.start,
            end: time, extentCents: this.state.extentCents,
        }
        this.state = null
        this.emitted = true
        return event
    }

    flush() {
        if (this.state?.direction === 'down' &&
            this.state.noteEnd - this.state.end <= 0.15 && !this.emitted) {
            return this.emit('glissdown', this.state.end)
        }
        this.state = null
        return null
    }

    reset() {
        this.state = null
        this.emitted = false
        this.isActive = false
    }
}

techniqueRegistry.register(new GlissandoPlugin())
