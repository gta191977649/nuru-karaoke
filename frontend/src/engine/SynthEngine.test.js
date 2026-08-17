import { describe, expect, it, vi } from 'vitest'
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
})
