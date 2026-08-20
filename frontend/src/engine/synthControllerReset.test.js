import { describe, expect, it, vi } from 'vitest'
import { resetSynthControllers } from './synthControllerReset.js'

describe('resetSynthControllers', () => {
  it('uses the current controllerChange API for all MIDI channels', () => {
    const controllerChange = vi.fn()

    expect(resetSynthControllers({ controllerChange })).toBe(true)
    expect(controllerChange).toHaveBeenCalledTimes(16)
    expect(controllerChange).toHaveBeenNthCalledWith(1, 0, 121, 0)
    expect(controllerChange).toHaveBeenNthCalledWith(16, 15, 121, 0)
  })

  it('falls back to raw MIDI messages', () => {
    const sendMessage = vi.fn()

    expect(resetSynthControllers({ sendMessage })).toBe(true)
    expect(sendMessage).toHaveBeenCalledTimes(16)
    expect(sendMessage).toHaveBeenNthCalledWith(1, [0xb0, 121, 0])
    expect(sendMessage).toHaveBeenNthCalledWith(16, [0xbf, 121, 0])
  })
})
