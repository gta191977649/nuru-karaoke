import { afterEach, describe, expect, it, vi } from 'vitest'
import { SynthEngine } from './SynthEngine.js'
import { getKaraokeStoreState, setKaraokeStoreState } from '../state/karaokeStore.js'
import { useSettingsStore } from '../state/settingsStore.js'

function createEngineWithDrums(...channels) {
  const engine = new SynthEngine()
  const drumChannels = new Uint8Array(16)
  for (const channel of channels) drumChannels[channel] = 1
  const mapper = (event) => [event]
  mapper.getState = () => ({ drumChannels })
  engine._midiMapper = mapper
  engine._synth = {
    programChange: vi.fn(),
    sendMessage: vi.fn(),
    setDrums: vi.fn(),
  }
  return engine
}

describe('results queue advancement', () => {
  afterEach(() => setKaraokeStoreState({ queue: [], queueIndex: -1, history: [] }))

  function setup(queue = [{ url: 'A.mid' }, { url: 'B.mid' }, { url: 'C.mid' }]) {
    setKaraokeStoreState({ queue, queueIndex: 0, history: [] })
    const engine = new SynthEngine()
    engine.ensureInitialized = vi.fn().mockResolvedValue()
    engine.stop = vi.fn()
    engine.playQueueFrom = vi.fn().mockResolvedValue()
    return engine
  }

  it('removes the completed song once, then starts the next without a synth fade', async () => {
    const engine = setup()
    await engine.advanceFromResults()
    expect(getKaraokeStoreState().queue.map((song) => song.url)).toEqual(['B.mid', 'C.mid'])
    expect(getKaraokeStoreState().history.map((song) => song.url)).toEqual(['A.mid'])
    expect(engine.playQueueFrom).toHaveBeenCalledTimes(1)
    expect(engine.playQueueFrom).toHaveBeenCalledWith(0)
    expect(engine.stop).toHaveBeenCalledTimes(1)
  })

  it('retries the failed next song instead of skipping it', async () => {
    const engine = setup()
    engine.playQueueFrom.mockRejectedValueOnce(new Error('network'))
    await expect(engine.advanceFromResults()).rejects.toThrow('network')
    await engine.advanceFromResults()
    expect(getKaraokeStoreState().queue.map((song) => song.url)).toEqual(['B.mid', 'C.mid'])
    expect(getKaraokeStoreState().history).toHaveLength(1)
    expect(engine.playQueueFrom.mock.calls).toEqual([[0], [0]])
  })

  it('ignores simultaneous advance attempts', async () => {
    const engine = setup()
    const first = engine.advanceFromResults()
    await engine.advanceFromResults()
    await first
    expect(engine.playQueueFrom).toHaveBeenCalledTimes(1)
    expect(getKaraokeStoreState().history).toHaveLength(1)
  })

  it('clears the final song without attempting another playback', async () => {
    const engine = setup([{ url: 'A.mid' }])
    await engine.advanceFromResults()
    expect(getKaraokeStoreState().queueIndex).toBe(-1)
    expect(getKaraokeStoreState().queue).toEqual([])
    expect(engine.playQueueFrom).not.toHaveBeenCalled()
  })
})

describe('queue playback audio lifecycle', () => {
  afterEach(() => setKaraokeStoreState({
    queue: [],
    queueIndex: -1,
    history: [],
    enabledChannels: Array.from({ length: 16 }, () => true),
  }))

  it('resumes audio again after loading, immediately before autoplay', async () => {
    setKaraokeStoreState({
      queue: [{ url: 'next.mid' }],
      queueIndex: 0,
      enabledChannels: Array.from({ length: 16 }, () => true),
    })
    const engine = new SynthEngine()
    const calls = []
    engine.ensureInitialized = vi.fn().mockResolvedValue()
    engine.resumeAudio = vi.fn(async () => { calls.push('resume') })
    engine.loadMidiFromUrl = vi.fn(async () => { calls.push('load') })
    engine.setTransposition = vi.fn()
    engine.seek = vi.fn()
    engine.play = vi.fn(() => { calls.push('play') })
    engine._synth = { midiChannels: [] }

    await engine.playQueueFrom(0)

    expect(calls).toEqual(['resume', 'load', 'resume', 'play'])
  })

  it('keeps a failed reservation retryable without losing the queued song', async () => {
    setKaraokeStoreState({ queue: [{ url: 'retry.mid' }], queueIndex: -1 })
    const engine = new SynthEngine()
    engine.ensureInitialized = vi.fn().mockResolvedValue()
    engine.resumeAudio = vi.fn().mockResolvedValue()
    engine.loadMidiFromUrl = vi.fn().mockRejectedValueOnce(new Error('download timeout')).mockResolvedValue()
    engine.setTransposition = vi.fn()
    engine._applyChannelMuteState = vi.fn()
    engine.seek = vi.fn()
    engine.play = vi.fn()

    await expect(engine.playQueueIfIdle()).rejects.toThrow('download timeout')
    expect(getKaraokeStoreState().queueIndex).toBe(-1)
    expect(getKaraokeStoreState().queue).toEqual([{ url: 'retry.mid' }])
    await engine.playQueueIfIdle()
    expect(engine.loadMidiFromUrl).toHaveBeenCalledTimes(2)
    expect(engine.play).toHaveBeenCalledTimes(1)
    expect(getKaraokeStoreState().queueIndex).toBe(0)
  })
})

function createEngineWithCurrentDrumApi(...channels) {
  const engine = createEngineWithDrums(...channels)
  const setDrums = Array.from({ length: 16 }, () => vi.fn())
  engine._synth = {
    midiChannels: setDrums.map((setter) => ({ setDrums: setter })),
    programChange: vi.fn(),
    sendMessage: vi.fn(),
  }
  return { engine, setDrums }
}

describe('SynthEngine channel output controls', () => {
  afterEach(() => {
    useSettingsStore.setState({ guideMelodyEnabled: true })
    setKaraokeStoreState({
      enabledChannels: Array.from({ length: 16 }, () => true),
      queue: [], queueIndex: -1,
    })
  })

  function setup(channelCount = 32) {
    const engine = new SynthEngine()
    const setters = Array.from({ length: channelCount }, () => vi.fn())
    engine._playbackRouting = 'direct'
    engine._synth = {
      midiChannels: setters.map((setSystemParameter) => ({ setSystemParameter })),
      controllerChange: vi.fn(),
    }
    return { engine, setters }
  }

  it('mutes and unmutes the same channel across SC-88 MIDI ports without muting adjacent channels', () => {
    const { engine, setters } = setup()
    engine.setChannelEnabled(2, false)
    expect(setters[2]).toHaveBeenLastCalledWith('isMuted', true)
    expect(setters[18]).toHaveBeenLastCalledWith('isMuted', true)
    expect(setters[1]).not.toHaveBeenCalled()
    expect(setters[19]).not.toHaveBeenCalled()
    expect(engine._synth.controllerChange.mock.calls).toEqual([[2, 120, 0], [18, 120, 0]])
    expect(getKaraokeStoreState().enabledChannels[2]).toBe(false)

    engine.setChannelEnabled(2, true)
    expect(setters[2]).toHaveBeenLastCalledWith('isMuted', false)
    expect(setters[18]).toHaveBeenLastCalledWith('isMuted', false)
  })

  it('restores output switches on MIDI ports added after the switch was disabled', () => {
    const { engine } = setup(16)
    engine.setChannelEnabled(4, false)
    const addedSetters = Array.from({ length: 16 }, () => vi.fn())
    engine._synth.midiChannels.push(...addedSetters.map((setSystemParameter) => ({ setSystemParameter })))

    engine._applyChannelMuteState()

    expect(addedSetters[4]).toHaveBeenCalledWith('isMuted', true)
    expect(addedSetters[5]).toHaveBeenCalledWith('isMuted', false)
  })

  it('stores channel switches before the synth is initialized', () => {
    const engine = new SynthEngine()
    engine.setChannelEnabled(3, false)
    expect(getKaraokeStoreState().enabledChannels[3]).toBe(false)
  })

  it('keeps channel 1 muted on every port when the global guide setting is OFF', () => {
    useSettingsStore.setState({ guideMelodyEnabled: false })
    const { engine, setters } = setup()
    engine._applyChannelMuteState()
    expect(setters[0]).toHaveBeenLastCalledWith('isMuted', true)
    expect(setters[16]).toHaveBeenLastCalledWith('isMuted', true)
    expect(setters[1]).toHaveBeenLastCalledWith('isMuted', false)
    engine.setChannelEnabled(0, true)
    expect(setters[0]).toHaveBeenLastCalledWith('isMuted', true)
    expect(setters[16]).toHaveBeenLastCalledWith('isMuted', true)
  })

  it('retains a song guide OFF setting when channel mute state is reapplied', () => {
    setKaraokeStoreState({ queue: [{ guideMelodyEnabled: false }], queueIndex: 0 })
    const { engine, setters } = setup()
    engine._applyChannelMuteState()
    expect(setters[0]).toHaveBeenLastCalledWith('isMuted', true)
    expect(setters[16]).toHaveBeenLastCalledWith('isMuted', true)
  })

  it('applies guide changes live while respecting a manually disabled channel', () => {
    const { engine, setters } = setup()
    engine._subscribeChannelMuteSettings()
    try {
      useSettingsStore.setState({ guideMelodyEnabled: false })
      expect(setters[0]).toHaveBeenLastCalledWith('isMuted', true)
      useSettingsStore.setState({ guideMelodyEnabled: true })
      expect(setters[0]).toHaveBeenLastCalledWith('isMuted', false)
      engine.setChannelEnabled(0, false)
      useSettingsStore.setState({ guideMelodyEnabled: false })
      useSettingsStore.setState({ guideMelodyEnabled: true })
      expect(setters[0]).toHaveBeenLastCalledWith('isMuted', true)
    } finally {
      engine.dispose()
    }
  })
})

describe('SynthEngine drum-channel synchronization', () => {
  it('keeps detected non-default drum channels during activity reset', () => {
    const engine = createEngineWithDrums(8, 9)

    engine._resetChannelActivity()

    expect(engine._midiChannelState[8]).toMatchObject({ isDrum: true, name: 'Drums' })
    expect(engine._synth.setDrums).toHaveBeenCalledWith(8, true)
  })

  it('does not infer channel 9 drums from XG System On alone', () => {
    const engine = createEngineWithDrums(9)
    engine._resetChannelActivity()
    engine._synth.setDrums.mockClear()

    engine._handleMidiOutputMessage(
      Uint8Array.from([0xf0, 0x43, 0x10, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7]),
    )

    expect(engine._synth.setDrums).not.toHaveBeenCalledWith(8, true)
  })

  it('enables both XG drum channels through the current per-channel API', () => {
    const { engine, setDrums } = createEngineWithCurrentDrumApi(8, 9)

    engine._resetChannelActivity()

    expect(setDrums[8]).toHaveBeenCalledWith(true)
    expect(setDrums[9]).toHaveBeenCalledWith(true)
    expect(engine._synth.programChange).not.toHaveBeenCalled()
  })
})

describe('SynthEngine playback completion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('publishes an explicit finished state even when the last clock time misses the duration', () => {
    let clockTick = null
    vi.stubGlobal('window', {
      requestAnimationFrame: vi.fn((callback) => {
        clockTick = callback
        return 1
      }),
      cancelAnimationFrame: vi.fn(),
    })

    const engine = new SynthEngine()
    engine._seq = {
      currentHighResolutionTime: 9.9,
      currentTime: 9.9,
      duration: 10,
      paused: false,
      isFinished: true,
    }
    engine._setState = vi.fn()

    engine._startClock()
    clockTick()

    expect(engine._setState).toHaveBeenCalledWith(expect.objectContaining({
      currentTime: 9.9,
      duration: 10,
      isPlaying: false,
      playbackFinished: true,
    }))
    expect(engine._raf).toBe(0)
  })
})

describe('SynthEngine MIDI playback routing', () => {
  it('connects identity and preconverted playback directly to the worklet sequencer', () => {
    const engine = createEngineWithDrums(9)
    engine._seq = { connectMIDIOutput: vi.fn() }

    engine._setupMidiMapper('direct')

    expect(engine._seq.connectMIDIOutput).toHaveBeenCalledWith(undefined)
  })

  it('keeps the MIDI output callback for configurations that require real-time mapping', () => {
    const engine = createEngineWithDrums(9)
    engine._seq = { connectMIDIOutput: vi.fn() }

    engine._setupMidiMapper('realtime-map')

    const output = engine._seq.connectMIDIOutput.mock.calls[0][0]
    expect(output).toEqual({ send: expect.any(Function) })
    output.send(Uint8Array.from([0x99, 36, 64]))
    expect(engine._synth.sendMessage).toHaveBeenCalled()
  })

  it('restores activity and polyphony from telemetry across forward and backward seeks', () => {
    const engine = new SynthEngine()
    engine._playbackTelemetry = {
      activity: Array.from({ length: 16 }, (_, channel) => channel === 0
        ? { times: Float32Array.from([1, 4]), velocities: Uint8Array.from([40, 90]) }
        : { times: new Float32Array(), velocities: new Uint8Array() }),
      polyphonyTimes: Float32Array.from([1, 2, 4]),
      polyphonyCounts: Uint16Array.from([1, 0, 2]),
      patchChanges: [],
    }

    engine._applyPlaybackTelemetry(4.5)
    expect(engine._channelActivityVelocity[0]).toBeCloseTo(90 / 127)
    expect(engine._channelActivityTime[0]).toBe(4)
    expect(engine._polyphonyCount).toBe(2)

    engine._applyPlaybackTelemetry(1.5)
    expect(engine._channelActivityVelocity[0]).toBeCloseTo(40 / 127)
    expect(engine._channelActivityTime[0]).toBe(1)
    expect(engine._polyphonyCount).toBe(1)
  })
})
