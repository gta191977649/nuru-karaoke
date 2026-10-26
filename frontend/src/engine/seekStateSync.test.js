import { afterEach, describe, expect, it, vi } from 'vitest'
import { SynthEngine } from './SynthEngine.js'
import { getKaraokeStoreState, setKaraokeStoreState } from '../state/karaokeStore.js'

describe('seek state synchronization', () => {
  const previous = getKaraokeStoreState()
  afterEach(() => setKaraokeStoreState(previous))

  it('updates a paused player immediately when rewound to the start', () => {
    setKaraokeStoreState({ currentTime: 50, playbackFinished: true })
    const engine = new SynthEngine()
    engine._seq = { currentTime: 50, paused: true }
    engine.seek(0)
    expect(getKaraokeStoreState()).toMatchObject({ currentTime: 0, playbackFinished: false })
  })

  it('publishes the completed asynchronous backend seek', async () => {
    setKaraokeStoreState({ currentTime: 50, playbackFinished: true })
    const engine = new SynthEngine()
    engine._seq = { currentTime: 50, paused: true }
    engine._backend = { id: 'smu2000', seek: vi.fn(async () => { engine._seq.currentTime = 0 }) }
    await engine.seek(0)
    expect(getKaraokeStoreState()).toMatchObject({ currentTime: 0, playbackFinished: false })
  })
})
