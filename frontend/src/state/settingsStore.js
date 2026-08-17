import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useSettingsStore = create(
  persist(
    (set) => ({
      guideMelodyEnabled: true,
      autoGainEnabled: true,
      karaokeBackgroundVideoEnabled: false,
      microphoneDeviceId: '',
      setGuideMelodyEnabled: (guideMelodyEnabled) =>
        set({ guideMelodyEnabled: Boolean(guideMelodyEnabled) }),
      setAutoGainEnabled: (autoGainEnabled) =>
        set({ autoGainEnabled: Boolean(autoGainEnabled) }),
      setKaraokeBackgroundVideoEnabled: (karaokeBackgroundVideoEnabled) =>
        set({ karaokeBackgroundVideoEnabled: Boolean(karaokeBackgroundVideoEnabled) }),
      setMicrophoneDeviceId: (microphoneDeviceId) =>
        set({ microphoneDeviceId: String(microphoneDeviceId || '') }),
    }),
    {
      name: 'nuru-karaoke-settings',
      partialize: (state) => ({
        guideMelodyEnabled: state.guideMelodyEnabled,
        autoGainEnabled: state.autoGainEnabled,
        karaokeBackgroundVideoEnabled: state.karaokeBackgroundVideoEnabled,
        microphoneDeviceId: state.microphoneDeviceId,
      }),
    },
  ),
)

const getSettingsStoreState = () => useSettingsStore.getState()

export { getSettingsStoreState, useSettingsStore }
