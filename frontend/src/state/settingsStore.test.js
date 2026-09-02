import { beforeEach, describe, expect, it } from 'vitest'

import {
  normalizeLatencyRecord,
  normalizeMicrophoneDeviceKey,
  useSettingsStore,
} from './settingsStore.js'

describe('microphone latency settings', () => {
  beforeEach(() => {
    useSettingsStore.setState({ microphoneLatencyByDevice: {} })
  })

  it('stores independent validated calibrations per device', () => {
    const state = useSettingsStore.getState()
    expect(state.setMicrophoneLatencyCalibration('mic-a', {
      latencyMs: 167.4,
      measuredAt: '2026-09-02T08:00:00.000Z',
      sampleCount: 4,
      spreadMs: 7.6,
    })).toBe(true)
    expect(state.setMicrophoneLatencyCalibration('mic-b', {
      latencyMs: 91,
      sampleCount: 5,
      spreadMs: 3,
    })).toBe(true)
    expect(useSettingsStore.getState().microphoneLatencyByDevice).toMatchObject({
      'mic-a': { latencyMs: 167, sampleCount: 4, spreadMs: 8 },
      'mic-b': { latencyMs: 91, sampleCount: 5, spreadMs: 3 },
    })
  })

  it('clears only the selected microphone and rejects invalid values', () => {
    const state = useSettingsStore.getState()
    state.setMicrophoneLatencyCalibration('mic-a', { latencyMs: 167 })
    state.setMicrophoneLatencyCalibration('mic-b', { latencyMs: 91 })
    expect(state.setMicrophoneLatencyCalibration('bad', { latencyMs: 1400 })).toBe(false)
    useSettingsStore.getState().clearMicrophoneLatencyCalibration('mic-a')
    expect(useSettingsStore.getState().microphoneLatencyByDevice).toEqual({
      'mic-b': expect.objectContaining({ latencyMs: 91 }),
    })
  })

  it('normalizes the system default key and calibration record', () => {
    expect(normalizeMicrophoneDeviceKey('')).toBe('default')
    expect(normalizeLatencyRecord({ latencyMs: Number.NaN })).toBeNull()
  })
})
