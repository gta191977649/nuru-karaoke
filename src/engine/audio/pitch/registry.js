import { PitchyPlugin } from './plugins/pitchyPlugin.js'
import { EssentiaYinPlugin } from './plugins/essentiaYinPlugin.js'
import { EssentiaProbabilisticYinPlugin } from './plugins/essentiaProbabilisticYinPlugin.js'
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

function createDefaultPitchRegistry() {
  const registry = new PitchDetectorRegistry()
  registry.register(new PitchyPlugin())
  registry.register(new PyinPlugin())
  registry.register(new EssentiaYinPlugin())
  registry.register(new EssentiaProbabilisticYinPlugin())
  registry.register(new CrepeTfPlugin())
  return registry
}

export { PitchDetectorRegistry, createDefaultPitchRegistry }
