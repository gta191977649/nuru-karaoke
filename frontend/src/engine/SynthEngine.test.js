import { afterEach, describe, expect, it, vi } from 'vitest'
import { SynthEngine } from './SynthEngine.js'

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
