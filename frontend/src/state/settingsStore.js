import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useSettingsStore = create(
  persist(
    (set) => ({
      guideMelodyEnabled: true,
      autoGainEnabled: true,
      microphoneDeviceId: '',
      setGuideMelodyEnabled: (guideMelodyEnabled) =>
        set({ guideMelodyEnabled: Boolean(guideMelodyEnabled) }),
      setAutoGainEnabled: (autoGainEnabled) =>
        set({ autoGainEnabled: Boolean(autoGainEnabled) }),
      setMicrophoneDeviceId: (microphoneDeviceId) =>
        set({ microphoneDeviceId: String(microphoneDeviceId || '') }),
    }),
    {
      name: 'nuru-karaoke-settings',
      partialize: (state) => ({
        guideMelodyEnabled: state.guideMelodyEnabled,
        autoGainEnabled: state.autoGainEnabled,
        microphoneDeviceId: state.microphoneDeviceId,
      }),
    },
  ),
)

const getSettingsStoreState = () => useSettingsStore.getState()

export { getSettingsStoreState, useSettingsStore }
