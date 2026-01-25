/**
 * Base class for all singing technique detection plugins.
 */
export class TechniquePlugin {
    constructor(id, name) {
        if (!id) throw new Error('Plugin must have an id')
        this.id = id
        this.name = name || id
    }

    /**
     * Analyze the pitch history and detect new events.
     * @param {number} time - Current audio time in seconds
     * @param {number} f0Cents - Current pitch in cents (or NaN)
     * @param {Array<{t: number, v: number}>} historyBuffer - Circular buffer of {t, v} (cents)
     * @returns {Object|null} - Event object if detected (e.g. { type: 'vibrato', start: ..., end: ... }), or null
     */
    analyze(_time, _f0Cents, _historyBuffer) { // eslint-disable-line no-unused-vars
        throw new Error('Plugin must implement analyze()')
    }

    /**
     * Reset internal state (e.g. on song restart).
     */
    reset() { }
}

/**
 * Registry to manage active technique plugins.
 */
class TechniqueRegistry {
    constructor() {
        this._plugins = new Map()
    }

    register(plugin) {
        if (!(plugin instanceof TechniquePlugin)) {
            throw new Error('Invalid plugin: must extend TechniquePlugin')
        }
        this._plugins.set(plugin.id, plugin)
    }

    get(id) {
        return this._plugins.get(id)
    }

    list() {
        return Array.from(this._plugins.values())
    }
}

export const techniqueRegistry = new TechniqueRegistry()
