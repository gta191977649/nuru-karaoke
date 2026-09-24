import { describe, expect, it, vi } from 'vitest'
import { setSynthChannelMuted, setSynthMidiChannelGroupMuted } from './synthChannelMute.js'

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

  it('stops sounding voices immediately before muting future notes', () => {
    const controllerChange = vi.fn()
    const setSystemParameter = vi.fn()
    const synth = { controllerChange, midiChannels: [{ setSystemParameter }] }

    expect(setSynthChannelMuted(synth, 0, true)).toBe(true)
    expect(controllerChange).toHaveBeenCalledWith(0, 120, 0)
    expect(setSystemParameter).toHaveBeenCalledWith('isMuted', true)
  })

  it('applies a 16-channel UI switch to the matching channel on every MIDI port', () => {
    const setters = Array.from({ length: 32 }, () => vi.fn())
    const controllerChange = vi.fn()
    const synth = {
      controllerChange,
      midiChannels: setters.map((setSystemParameter) => ({ setSystemParameter })),
    }

    expect(setSynthMidiChannelGroupMuted(synth, 2, true)).toBe(true)
    expect(setters[2]).toHaveBeenCalledWith('isMuted', true)
    expect(setters[18]).toHaveBeenCalledWith('isMuted', true)
    expect(setters[1]).not.toHaveBeenCalled()
    expect(controllerChange.mock.calls).toEqual([[2, 120, 0], [18, 120, 0]])
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
