import { buildUrl } from '../../services/api.js'
import { SMU_RUNTIME_VERSION } from './smuVersion.js'

let memoryCache = null
let wasmModule = null

async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('nuru-smu2000-roms', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('resources')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function smuCache(action, value, key = 'current') {
  let db
  try {
    db = await database()
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('resources', action === 'get' ? 'readonly' : 'readwrite')
      const store = transaction.objectStore('resources')
      const request = action === 'get' ? store.get(key) : store.put(value, key)
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } catch {
    return null // Private browsing/storage quotas must not prevent playback.
  } finally {
    db?.close()
  }
}

export async function verifyRom(data, file) {
  if (data.byteLength !== file.size) throw new Error(`ROM サイズエラー: ${file.name}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
  if (hash !== file.sha256) throw new Error(`ROM 検証エラー: ${file.name}`)
}

export async function loadSmuResources(onProgress = () => {}) {
  onProgress({ stage: 'rom-download', text: 'ROM 構成を確認しています…', loaded: 0, total: 0 })
  const response = await fetch(buildUrl('/api/synth/smu2000/manifest/'))
  if (!response.ok) throw new Error(`ROM manifest HTTP ${response.status}`)
  const manifest = await response.json()
  if (!manifest.available) throw new Error(manifest.errors?.join(', ') || 'ROM が未設定です')
  const previous = memoryCache || await smuCache('get')
  const total = manifest.files.reduce((sum, file) => sum + file.size, 0)
  const received = manifest.files.map(() => 0)
  const roms = new Array(manifest.files.length)
  let cursor = 0
  let downloaded = false
  const wasmReady = (async () => {
    if (!wasmModule) {
      const wasmResponse = await fetch(`${import.meta.env.BASE_URL}smu2000/smu.wasm?v=${SMU_RUNTIME_VERSION}`)
      if (!wasmResponse.ok) throw new Error(`S-MU2000 WASM HTTP ${wasmResponse.status} (build:smu2000)`)
      return wasmResponse.arrayBuffer()
    }
    return null
  })()
  const downloadOne = async (file, index) => {
    const progress = () => onProgress({ stage: 'rom-download', text: file.name,
      loaded: received.reduce((sum, size) => sum + size, 0), total })
    let data = previous?.version === manifest.version
      ? previous.roms.find(rom => rom.kind === file.kind)?.data : null
    if (data && previous !== memoryCache) {
      try { await verifyRom(data, file) } catch { data = null }
    }
    if (!data) {
      downloaded = true
      const download = await fetch(buildUrl(file.url))
      if (!download.ok) throw new Error(`${file.name}: HTTP ${download.status}`)
      const bytes = new Uint8Array(file.size)
      const reader = download.body?.getReader()
      if (reader) {
        let offset = 0
        try {
          while (true) {
            const chunk = await reader.read()
            if (chunk.done) break
            if (offset + chunk.value.length > file.size) throw new Error(`ROM サイズエラー: ${file.name}`)
            bytes.set(chunk.value, offset)
            offset += chunk.value.length
            received[index] = offset
            progress()
          }
        } finally { await reader.cancel() }
        data = offset === bytes.length ? bytes.buffer : bytes.buffer.slice(0, offset)
      } else data = await download.arrayBuffer()
      await verifyRom(data, file)
    }
    received[index] = data.byteLength
    roms[index] = { kind: file.kind, data }
    progress()
  }
  const downloads = Array.from({ length: Math.min(3, manifest.files.length) }, async () => {
    while (cursor < manifest.files.length) {
      const index = cursor++
      await downloadOne(manifest.files[index], index)
    }
  })
  const outcomes = await Promise.allSettled([wasmReady, ...downloads])
  const failure = outcomes.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
  onProgress({ stage: 'wasm-download', text: 'S-MU2000 を読み込んでいます…', loaded: total, total })
  if (!wasmModule) wasmModule = await WebAssembly.compile(outcomes[0].value)
  const shouldPersist = downloaded || previous !== memoryCache
  memoryCache = { version: manifest.version, roms }
  if (shouldPersist) void smuCache('put', memoryCache)
  return { module: wasmModule, roms, version: manifest.version }
}
