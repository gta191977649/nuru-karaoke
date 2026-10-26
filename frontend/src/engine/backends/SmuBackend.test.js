import { describe, expect, it, vi } from 'vitest'
import { SmuBackend } from './SmuBackend.js'
import { SynthEngine } from '../SynthEngine.js'
import { setKaraokeStoreState } from '../../state/karaokeStore.js'
import { useSettingsStore } from '../../state/settingsStore.js'

describe('MU2000 UI bridge', () => {
  it('retains the latest LCD while hidden, publishes immediately on subscription, and rejects stale sessions', () => {
    const onLcd = vi.fn()
    const backend = new SmuBackend({ onLcd })
    backend.node = { port: { postMessage: vi.fn() } }
    const first = { type: 'lcd', session: backend.session, sequence: 1, dots: new Uint8Array([1]) }
    backend.receive(first)
    expect(onLcd).not.toHaveBeenCalled()
    backend.subscribeLcd(true)
    expect(onLcd).toHaveBeenLastCalledWith(first)
    backend.receive({ ...first, session: 'old', sequence: 100 })
    backend.receive({ ...first, sequence: 0 })
    expect(onLcd).toHaveBeenCalledTimes(1)
    const next = { ...first, sequence: 2, dots: new Uint8Array([2]) }
    backend.receive(next)
    expect(onLcd).toHaveBeenLastCalledWith(next)
    backend.subscribeLcd(false)
    backend.receive({ ...next, sequence: 3 })
    backend.subscribeLcd(true)
    expect(onLcd.mock.lastCall[0].sequence).toBe(3)
  })
  it('forwards logical channel mute and EQ controls without stopping playback', () => {
    const backend = new SmuBackend()
    const postMessage = vi.fn()
    backend.node = { port: { postMessage } }
    backend.setChannelMuted(4, true)
    backend.setEq(2, true)
    expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: 'mute', channel: 4, muted: true }, { type: 'eq', preset: 2, locked: true },
    ])
    expect(backend.busy).toBe(false)
  })
  it('routes the synth Channels controls and guide mute to the same MU2000 path', () => {
    const engine = new SynthEngine()
    const backend = new SmuBackend()
    const postMessage = vi.fn()
    backend.node = { port: { postMessage } }
    engine._backend = backend; engine._synth = backend
    setKaraokeStoreState({ enabledChannels: Array(16).fill(true), queue: [], queueIndex: -1 })
    useSettingsStore.setState({ guideMelodyEnabled: true })
    engine.setChannelEnabled(3, false)
    engine.setChannelEnabled(3, true)
    expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: 'mute', channel: 3, muted: true }, { type: 'mute', channel: 3, muted: false },
    ])
    useSettingsStore.setState({ guideMelodyEnabled: false })
    engine.setChannelEnabled(0, true)
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'mute', channel: 0, muted: true })
    useSettingsStore.setState({ guideMelodyEnabled: true })
  })
  it('keeps the original playback intent when a newer seek supersedes the pending one', async () => {
    const backend = new SmuBackend()
    backend.context = { resume: vi.fn().mockResolvedValue() }
    backend.paused = false
    backend.duration = 200
    backend.time = 10
    const pending = []
    backend.request = vi.fn((_type, data) => new Promise((resolve, reject) => pending.push({ data, resolve, reject })))
    const first = backend.seek(50).catch(() => {})
    const second = backend.seek(100)
    expect(pending.map(item => item.data)).toEqual([{ position: 50, running: true }, { position: 100, running: true }])
    pending[0].reject(new Error('cancelled'))
    pending[1].resolve()
    await Promise.all([first, second])
    expect(backend.time).toBe(100)
    expect(backend.seeking).toBe(false)
  })
})
