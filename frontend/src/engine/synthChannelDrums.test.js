import { describe, expect, it, vi } from 'vitest'
import { setSynthChannelDrums } from './synthChannelDrums.js'

describe('setSynthChannelDrums', () => {
  it('uses the SpessaSynth 4.3 per-channel drum API', () => {
    const setDrums = vi.fn()
    const legacySetDrums = vi.fn()
    const synth = {
      midiChannels: [{}, {}, {}, {}, {}, {}, {}, {}, { setDrums }],
      setDrums: legacySetDrums,
    }

    expect(setSynthChannelDrums(synth, 8, true)).toBe(true)
    expect(setDrums).toHaveBeenCalledWith(true)
    expect(legacySetDrums).not.toHaveBeenCalled()
  })

  it('falls back to the legacy synth-level API', () => {
    const setDrums = vi.fn()

    expect(setSynthChannelDrums({ setDrums }, 9, true)).toBe(true)
    expect(setDrums).toHaveBeenCalledWith(9, true)
  })
})
