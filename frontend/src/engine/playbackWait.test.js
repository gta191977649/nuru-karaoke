import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPlaybackResource, waitForPlayback } from './playbackWait.js'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('song reservation deadlines', () => {
  it('rejects a stalled audio resume rather than leaving the reservation pending', async () => {
    vi.useFakeTimers()
    const result = waitForPlayback(new Promise(() => {}), 5000, 'audio timeout')
    const check = expect(result).rejects.toThrow('audio timeout')
    await vi.advanceTimersByTimeAsync(5000)
    await check
    expect(vi.getTimerCount()).toBe(0)
  })
  it('aborts a stalled response body, not just a stalled connection', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async (_url, { signal }) => ({ ok: true,
      arrayBuffer: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
    })))
    const result = fetchPlaybackResource('/song.mid', 100)
    const check = expect(result).rejects.toThrow('タイムアウト')
    await vi.advanceTimersByTimeAsync(100)
    await check
  })
  it('returns downloaded MIDI and clears the deadline', async () => {
    vi.useFakeTimers()
    const data = new ArrayBuffer(8)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => data })))
    expect(await fetchPlaybackResource('/song.mid')).toBe(data)
    expect(vi.getTimerCount()).toBe(0)
  })
})
