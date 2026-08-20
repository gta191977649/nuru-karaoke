import { describe, expect, it, vi } from 'vitest'
import { setSynthChannelMuted } from './synthChannelMute.js'

describe('setSynthChannelMuted', () => {
  it('uses the SpessaSynth 4.3 per-channel system parameter API', () => {
    const setSystemParameter = vi.fn()
    const legacyMuteChannel = vi.fn()
    const synth = {
      midiChannels: [{ setSystemParameter }],
      muteChannel: legacyMuteChannel,
    }

    expect(setSynthChannelMuted(synth, 0, true)).toBe(true)
    expect(setSystemParameter).toHaveBeenCalledWith('isMuted', true)
    expect(legacyMuteChannel).not.toHaveBeenCalled()
  })

  it('falls back to the legacy muteChannel API', () => {
    const muteChannel = vi.fn()

    expect(setSynthChannelMuted({ muteChannel }, 3, false)).toBe(true)
    expect(muteChannel).toHaveBeenCalledWith(3, false)
  })

  it('does not throw when neither API is available', () => {
    expect(setSynthChannelMuted({}, 0, true)).toBe(false)
  })
})
