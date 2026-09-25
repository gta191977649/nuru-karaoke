import { techniqueRegistry } from './TechniqueRegistry.js'

function overlapsVibrato(event, start, end) {
    const eventStart = Number.isFinite(event.start) ? event.start : event.t
    const eventEnd = Number.isFinite(event.end) ? event.end : event.t
    return eventStart <= end && eventEnd >= start
}

export class SingingTechniqueDetector {
    constructor(config = {}) {
        this.bufferSize = config.bufferSize || 512
        this.buffer = []
        this.activeTechniques = {}
        this.lastTime = null
        this.noteId = null
        this.noteBounds = null
        this.pendingTechniques = []
        this.plugins = techniqueRegistry.list()
        for (const plugin of this.plugins) plugin.reset()
    }

    push({ time, rawMidi, confidence, rms, rmsGate = 0.01, noteId, noteStartSec, noteEndSec }) {
        const events = {}
        if (!Number.isFinite(time)) return events
        const noteChanged = noteId !== undefined && this.noteId !== null && noteId !== this.noteId
        const timeReversed = this.lastTime !== null && time < this.lastTime
        if (this.lastTime !== null && time === this.lastTime) return events
        if (noteChanged || timeReversed) {
            if (noteChanged && !timeReversed) Object.assign(events, this.flush())
            this.buffer = []
            this.pendingTechniques = []
            this.activeTechniques = {}
            for (const plugin of this.plugins) plugin.reset()
        }
        this.noteId = noteId ?? null
        this.noteBounds = Number.isFinite(noteStartSec) && Number.isFinite(noteEndSec)
            ? { startSec: noteStartSec, endSec: noteEndSec }
            : null
        this.lastTime = time
        const voiced = Number.isFinite(rawMidi) &&
            Number.isFinite(confidence) && confidence > 0 &&
            Number.isFinite(rms) && rms >= rmsGate
        this.buffer.push({ t: time, v: voiced ? rawMidi * 100 : NaN })
        if (this.buffer.length > this.bufferSize) this.buffer.shift()
        return { ...events, ...this.analyze() }
    }

    analyze() {
        const current = this.buffer.at(-1)
        if (!current) return {}
        const results = {}
        for (const plugin of this.plugins) {
            try {
                const event = plugin.analyze(current.t, current.v, this.buffer, this.activeTechniques, this.noteBounds)
                if (event) results[event.type || plugin.id] = { t: current.t, ...event }
                this.activeTechniques[plugin.id] = plugin.id === 'vibrato' && plugin.isActive === true
                if (plugin.id === 'glissando') {
                    this.activeTechniques.glissup = false
                    this.activeTechniques.glissdown = false
                }
            } catch (error) {
                console.warn(`[SingingTechniqueDetector] Error in plugin ${plugin.id}:`, error)
                this.activeTechniques[plugin.id] = false
            }
        }
        for (const type of ['kobushi', 'glissup', 'glissdown']) {
            if (results[type]) {
                this.pendingTechniques.push(results[type])
                delete results[type]
            }
        }
        const vibrato = this.plugins.find(plugin => plugin.id === 'vibrato')
        const vibratoStart = results.vibrato?.start ?? vibrato?.segment?.start
        const vibratoEnd = results.vibrato?.end ?? current.t
        if (Number.isFinite(vibratoStart)) {
            this.pendingTechniques = this.pendingTechniques.filter(event =>
                !overlapsVibrato(event, vibratoStart, vibratoEnd)
            )
        }
        for (const event of [...this.pendingTechniques]) {
            if (current.t - event.t < 0.95) continue
            results[event.type] ??= event
            this.activeTechniques[event.type] = true
            this.pendingTechniques.splice(this.pendingTechniques.indexOf(event), 1)
        }
        return results
    }

    flush() {
        const results = {}
        for (const plugin of this.plugins) {
            const event = plugin.flush?.()
            if (event) results[event.type || plugin.id] = event
            if (typeof plugin.isActive === 'boolean') plugin.isActive = false
            this.activeTechniques[plugin.id] = false
            if (plugin.id === 'glissando') {
                this.activeTechniques.glissup = false
                this.activeTechniques.glissdown = false
            }
        }
        const vibrato = results.vibrato
        if (vibrato) {
            for (const type of ['kobushi', 'glissup', 'glissdown']) {
                if (results[type] && overlapsVibrato(results[type], vibrato.start, vibrato.end)) {
                    delete results[type]
                }
            }
        }
        for (const event of this.pendingTechniques) {
            if (vibrato && overlapsVibrato(event, vibrato.start, vibrato.end)) continue
            results[event.type] ??= event
        }
        this.pendingTechniques = []
        return results
    }

    reset() {
        this.buffer = []
        this.lastTime = null
        this.noteId = null
        this.noteBounds = null
        this.pendingTechniques = []
        this.activeTechniques = {}
        for (const plugin of this.plugins) plugin.reset()
    }
}
