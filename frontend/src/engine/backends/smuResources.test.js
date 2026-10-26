import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules() })

describe('lazy MU2000 resources', () => {
  it('does not fetch on import; verifies ROMs and reuses session cache when storage is unavailable', async () => {
    const data = new Uint8Array([1, 2, 3]).buffer
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), v => v.toString(16).padStart(2, '0')).join('')
    const manifest = { available: true, version: 'v1', files: [{ kind: 0, name: 'test.bin', url: '/rom/test', size: 3, sha256: hash }] }
    const fetch = vi.fn(async url => {
      if (url.endsWith('/manifest/')) return { ok: true, json: async () => manifest }
      return { ok: true, arrayBuffer: async () => data }
    })
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('indexedDB', undefined)
    const compile = vi.spyOn(WebAssembly, 'compile').mockResolvedValue({})
    const { loadSmuResources } = await import('./smuResources.js')
    expect(fetch).not.toHaveBeenCalled()
    const progress = vi.fn()
    const first = await loadSmuResources(progress)
    const second = await loadSmuResources(progress)
    expect(first.roms[0].data).toEqual(data)
    expect(second.roms[0].data).toEqual(data)
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/rom/test'))).toHaveLength(1)
    expect(compile).toHaveBeenCalledTimes(1)
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ loaded: 3, total: 3 }))
    manifest.version = 'v2'
    await loadSmuResources()
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/rom/test'))).toHaveLength(2)
  })

  it('rejects corrupted ROMs before attempting to compile WASM', async () => {
    vi.stubGlobal('indexedDB', undefined)
    vi.stubGlobal('fetch', vi.fn(async url => url.endsWith('/manifest/')
      ? { ok: true, json: async () => ({ available: true, version: 'bad', files: [{ kind: 0, name: 'bad.bin', url: '/bad', size: 2, sha256: 'wrong' }] }) }
      : { ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer }))
    const compile = vi.spyOn(WebAssembly, 'compile')
    const { loadSmuResources } = await import('./smuResources.js')
    await expect(loadSmuResources()).rejects.toThrow('検証エラー')
    expect(compile).not.toHaveBeenCalled()
  })
})
