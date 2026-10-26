import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SynthEngine } from './SynthEngine.js'
import { getKaraokeStoreState, setKaraokeStoreState } from '../state/karaokeStore.js'
import { useSettingsStore } from '../state/settingsStore.js'

function backend(id) {
  const synth = { systemParameters: {}, stopAll: vi.fn() }
  return { id, exact: false, synth, systemParameters: synth.systemParameters,
    transport: { paused: true }, output: { connect: vi.fn(), disconnect: vi.fn() },
    request: vi.fn().mockResolvedValue(), notify: vi.fn(), activate: vi.fn(),
    dispose: vi.fn().mockResolvedValue(), subscribeLcd: vi.fn() }
}

describe('synthesizer switching transaction', () => {
  let engine, old, candidate
  beforeEach(() => {
    setKaraokeStoreState({ isPlaying: false, midiName: '', currentTime: 42, ready: true,
      synthBackend: 'builtin', synthBusy: false, synthSwitching: false, transposition: 3,
      playbackSessionId: 10, queue: [{ url: 'keep.mid' }], queueIndex: 0 })
    useSettingsStore.setState({ synthBackend: 'builtin', smuExact: false })
    engine = new SynthEngine()
    old = backend('builtin'); candidate = backend('smu2000')
    engine._backend = old; engine._synth = old.synth; engine._seq = old.transport
    engine._initialized = true
    engine._createBackend = vi.fn().mockResolvedValue(candidate)
    engine._autoGainController = { setInitialGainDb: vi.fn() }
    engine._bindSequencerEvents = vi.fn(); engine._subscribeChannelMuteSettings = vi.fn()
    engine._applyChannelMuteState = vi.fn(); engine._setupMidiMapper = vi.fn()
    engine.play = vi.fn()
  })
  afterEach(() => { setKaraokeStoreState({ isPlaying: false, midiName: '', queue: [], queueIndex: -1 }); vi.restoreAllMocks() })

  it('refuses to initialize or download another backend during playback', async () => {
    setKaraokeStoreState({ isPlaying: true })
    await expect(engine.switchBackend('smu2000')).rejects.toThrow('一時停止')
    expect(engine._createBackend).not.toHaveBeenCalled()
  })
  it('preserves the original backend, position and preference after download failure', async () => {
    engine._createBackend.mockRejectedValue(new Error('ROM download failed'))
    await expect(engine.switchBackend('smu2000')).rejects.toThrow('ROM download')
    expect(engine._backend).toBe(old)
    expect(getKaraokeStoreState()).toMatchObject({ currentTime: 42, synthSwitching: false, synthError: 'ROM download failed' })
    expect(useSettingsStore.getState().synthBackend).toBe('builtin')
    expect(old.dispose).not.toHaveBeenCalled()
  })
  it('restarts a paused song once, resets score session and keeps queue/key shift', async () => {
    setKaraokeStoreState({ midiName: 'keep.mid', midiUrl: '/keep.mid' })
    engine._lastMidiBuffer = new ArrayBuffer(4)
    engine.loadMIDI = vi.fn().mockResolvedValue()
    await engine.switchBackend('smu2000')
    expect(engine.loadMIDI).toHaveBeenCalledWith(expect.objectContaining({ midiName: 'keep.mid', switching: true }))
    expect(candidate.request).toHaveBeenCalledWith('transpose', { value: 3 })
    expect(engine.play).toHaveBeenCalledTimes(1)
    expect(old.dispose).toHaveBeenCalledTimes(1)
    expect(getKaraokeStoreState()).toMatchObject({ synthBackend: 'smu2000', playbackSessionId: 11, transposition: 3, queueIndex: 0 })
    expect(getKaraokeStoreState().queue).toEqual([{ url: 'keep.mid' }])
  })
  it('rolls back if preparing the song fails after the candidate booted', async () => {
    setKaraokeStoreState({ midiName: 'broken.mid' })
    engine._lastMidiBuffer = new ArrayBuffer(4)
    engine.loadMIDI = vi.fn().mockRejectedValue(new Error('Invalid MIDI'))
    await expect(engine.switchBackend('smu2000')).rejects.toThrow('Invalid MIDI')
    expect(engine._backend).toBe(old)
    expect(candidate.dispose).toHaveBeenCalledTimes(1)
    expect(old.output.disconnect).not.toHaveBeenCalled()
    expect(engine.play).not.toHaveBeenCalled()
    expect(getKaraokeStoreState().currentTime).toBe(42)
  })
  it('locks concurrent requests before the first await', async () => {
    let finish
    engine._createBackend.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const first = engine.switchBackend('smu2000')
    await expect(engine.switchBackend('smu2000')).rejects.toThrow('一時停止')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    finish(candidate)
    await first
    expect(engine._createBackend).toHaveBeenCalledTimes(1)
  })
})
