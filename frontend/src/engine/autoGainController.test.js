import { describe, expect, it, vi } from 'vitest'
import {
  AUTO_GAIN_DEFAULTS,
  AutoGainController,
  calculateAutoGainTargetDb,
  smoothAutoGainDb,
} from './autoGainController.js'

describe('auto gain calculations', () => {
  it('ignores silence and clamps boost/cut targets', () => {
    expect(calculateAutoGainTargetDb(-60)).toBeNull()
    expect(calculateAutoGainTargetDb(-40)).toBe(20)
    expect(calculateAutoGainTargetDb(-18)).toBe(0)
    expect(calculateAutoGainTargetDb(-5)).toBe(-6)
  })

  it('raises gain more slowly than it cuts gain', () => {
    const boosted = smoothAutoGainDb(0, 12, 0.2)
    const cut = smoothAutoGainDb(0, -6, 0.2)
    expect(boosted).toBeGreaterThan(0)
    expect(boosted).toBeLessThan(1)
    expect(cut).toBeLessThan(-3)
    expect(AUTO_GAIN_DEFAULTS.boostTimeConstantSec)
      .toBeGreaterThan(AUTO_GAIN_DEFAULTS.cutTimeConstantSec)
  })

  it('keeps the current gain when no valid target exists', () => {
    expect(smoothAutoGainDb(4, null, 1)).toBe(4)
  })

  it('clamps and applies the MIDI-derived initial gain', () => {
    const controller = {
      config: AUTO_GAIN_DEFAULTS,
      reset: vi.fn(),
      emitMetrics: vi.fn(),
    }

    AutoGainController.prototype.setInitialGainDb.call(controller, 30)

    expect(controller.initialGainDb).toBe(20)
    expect(controller.reset).toHaveBeenCalledOnce()
  })
})
