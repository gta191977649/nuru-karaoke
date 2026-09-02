import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DEFAULT_MICROPHONE_KEY = 'default'

const normalizeMicrophoneDeviceKey = (deviceId) =>
  String(deviceId || '').trim() || DEFAULT_MICROPHONE_KEY

const normalizeLatencyRecord = (record) => {
  const latencyMs = Math.round(Number(record?.latencyMs))
  if (!Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > 1000) return null
  return {
    latencyMs,
    measuredAt: String(record?.measuredAt || new Date().toISOString()),
    sampleCount: Math.max(0, Math.round(Number(record?.sampleCount) || 0)),
    spreadMs: Math.max(0, Math.round(Number(record?.spreadMs) || 0)),
  }
}

const useSettingsStore = create(
  persist(
    (set, get) => ({
      guideMelodyEnabled: true,
      autoGainEnabled: true,
      karaokeBackgroundVideoEnabled: false,
      microphoneDeviceId: '',
      microphoneLatencyByDevice: {},
      setGuideMelodyEnabled: (guideMelodyEnabled) =>
        set({ guideMelodyEnabled: Boolean(guideMelodyEnabled) }),
      setAutoGainEnabled: (autoGainEnabled) =>
        set({ autoGainEnabled: Boolean(autoGainEnabled) }),
      setKaraokeBackgroundVideoEnabled: (karaokeBackgroundVideoEnabled) =>
        set({ karaokeBackgroundVideoEnabled: Boolean(karaokeBackgroundVideoEnabled) }),
      setMicrophoneDeviceId: (microphoneDeviceId) =>
        set({ microphoneDeviceId: String(microphoneDeviceId || '') }),
      setMicrophoneLatencyCalibration: (deviceId, record) => {
        const normalized = normalizeLatencyRecord(record)
        if (!normalized) return false
        const key = normalizeMicrophoneDeviceKey(deviceId)
        set((state) => ({
          microphoneLatencyByDevice: {
            ...state.microphoneLatencyByDevice,
            [key]: normalized,
          },
        }))
        return true
      },
      clearMicrophoneLatencyCalibration: (deviceId) => {
        const key = normalizeMicrophoneDeviceKey(deviceId)
        const next = { ...get().microphoneLatencyByDevice }
        delete next[key]
        set({ microphoneLatencyByDevice: next })
      },
      getMicrophoneLatencyCalibration: (deviceId) => {
        const key = normalizeMicrophoneDeviceKey(deviceId)
        return normalizeLatencyRecord(get().microphoneLatencyByDevice?.[key])
      },
    }),
    {
      name: 'nuru-karaoke-settings',
      partialize: (state) => ({
        guideMelodyEnabled: state.guideMelodyEnabled,
        autoGainEnabled: state.autoGainEnabled,
        karaokeBackgroundVideoEnabled: state.karaokeBackgroundVideoEnabled,
        microphoneDeviceId: state.microphoneDeviceId,
        microphoneLatencyByDevice: state.microphoneLatencyByDevice,
      }),
    },
  ),
)

const getSettingsStoreState = () => useSettingsStore.getState()

export {
  DEFAULT_MICROPHONE_KEY,
  getSettingsStoreState,
  normalizeLatencyRecord,
  normalizeMicrophoneDeviceKey,
  useSettingsStore,
}
