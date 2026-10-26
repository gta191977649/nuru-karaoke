import { smuCache } from './smuResources.js'
import { SMU_RUNTIME_VERSION, SMU_STATE_VERSION } from './smuVersion.js'

const snapshots = new Map()
export const bootCacheKey = (romVersion, exact) =>
  `boot:${romVersion}:${SMU_RUNTIME_VERSION}:${SMU_STATE_VERSION}:${exact ? 'exact' : 'fast'}`

export async function prepareSmuResources(resources, exact, session, onProgress = () => {}, workerReady = () => {}) {
  const key = bootCacheKey(resources.version, exact)
  const cached = snapshots.get(key) || await smuCache('get', undefined, key)
  const worker = new Worker(`${import.meta.env.BASE_URL}smu2000/boot-worker.js?v=${SMU_RUNTIME_VERSION}`, { type: 'module' })
  workerReady(worker)
  // Only these disposable copies are transferred. The validated session ROMs survive.
  const roms = resources.roms.map(rom => ({ kind: rom.kind, data: rom.data.slice(0) }))
  const snapshot = cached?.stateVersion === SMU_STATE_VERSION ? cached.snapshot.slice(0) : null
  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('S-MU2000 boot worker timeout')), 120000)
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') { clearTimeout(timeout); resolve(data) }
        else if (data.type === 'error') { clearTimeout(timeout); reject(new Error(data.message)) }
        else if (data.type === 'boot') onProgress({ stage: 'smu-boot', text: 'S-MU2000 を起動しています…', fraction: data.fraction })
      }
      worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message || 'S-MU2000 boot worker failed')) }
      worker.postMessage({ module: resources.module, roms, exact, snapshot, session },
        [...roms.map(rom => rom.data), ...(snapshot ? [snapshot] : [])])
    })
    if (result.stateVersion !== SMU_STATE_VERSION) throw new Error('S-MU2000 snapshot version mismatch; rebuild assets')
    const record = { stateVersion: result.stateVersion, snapshot: result.snapshot.slice(0) }
    snapshots.set(key, record)
    // At most the current ROM's two modes are retained in memory.
    while (snapshots.size > 2) snapshots.delete(snapshots.keys().next().value)
    if (!result.metrics.restored) void smuCache('put', record, key)
    return result
  } finally { worker.terminate(); workerReady(null) }
}
