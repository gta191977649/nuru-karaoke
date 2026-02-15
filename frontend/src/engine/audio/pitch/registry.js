import { PitchyPlugin } from './plugins/pitchyPlugin.js'
import { AubioPlugin } from './plugins/aubioPlugin.js'
import { PyinPlugin } from './plugins/pyinPlugin.js'
import { CrepeTfPlugin } from './plugins/crepeTfPlugin.js'

class PitchDetectorRegistry {
  constructor() {
    this._plugins = new Map()
  }

  register(plugin) {
    if (!plugin?.id) return
    this._plugins.set(plugin.id, plugin)
  }

  list() {
    return Array.from(this._plugins.values())
  }

  get(id) {
    return this._plugins.get(id) || null
  }
}

function createDefaultPitchRegistry(options = {}) {
  const includeCrepe = options.includeCrepe !== false
  const registry = new PitchDetectorRegistry()
  registry.register(new PitchyPlugin())
  registry.register(new AubioPlugin())
  registry.register(new PyinPlugin())
  if (includeCrepe) registry.register(new CrepeTfPlugin())
  return registry
}

export { PitchDetectorRegistry, createDefaultPitchRegistry }
