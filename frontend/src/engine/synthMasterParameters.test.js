import { describe, expect, it, vi } from 'vitest'
import { getSynthMasterParameter, setSynthMasterParameter } from './synthMasterParameters.js'

describe('synth master parameter compatibility', () => {
  it('uses the current system-parameter API and translates renamed parameters', () => {
    const setSystemParameter = vi.fn()
    const synth = {
      setSystemParameter,
      systemParameters: { gain: 0.75, keyShift: 2, reverbGain: 1.2 },
    }

    expect(setSynthMasterParameter(synth, 'masterGain', 0.5)).toBe(true)
    expect(setSynthMasterParameter(synth, 'transposition', -2)).toBe(true)
    expect(setSynthMasterParameter(synth, 'reverbGain', 1.1)).toBe(true)
    expect(setSystemParameter).toHaveBeenNthCalledWith(1, 'gain', 0.5)
    expect(setSystemParameter).toHaveBeenNthCalledWith(2, 'keyShift', -2)
    expect(setSystemParameter).toHaveBeenNthCalledWith(3, 'reverbGain', 1.1)
    expect(getSynthMasterParameter(synth, 'masterGain')).toBe(0.75)
    expect(getSynthMasterParameter(synth, 'transposition')).toBe(2)
  })

  it('falls back to the legacy master-parameter API', () => {
    const setMasterParameter = vi.fn()
    const getMasterParameter = vi.fn(() => 0.8)
    const synth = { setMasterParameter, getMasterParameter }

    expect(setSynthMasterParameter(synth, 'masterGain', 0.6)).toBe(true)
    expect(setMasterParameter).toHaveBeenCalledWith('masterGain', 0.6)
    expect(getSynthMasterParameter(synth, 'masterGain')).toBe(0.8)
    expect(getMasterParameter).toHaveBeenCalledWith('masterGain')
  })
})
