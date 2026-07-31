import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useSettingsStore = create(
  persist(
    (set) => ({
      guideMelodyEnabled: true,
      microphoneDeviceId: '',
      setGuideMelodyEnabled: (guideMelodyEnabled) =>
        set({ guideMelodyEnabled: Boolean(guideMelodyEnabled) }),
      setMicrophoneDeviceId: (microphoneDeviceId) =>
        set({ microphoneDeviceId: String(microphoneDeviceId || '') }),
    }),
    {
      name: 'nuru-karaoke-settings',
      partialize: (state) => ({
        guideMelodyEnabled: state.guideMelodyEnabled,
        microphoneDeviceId: state.microphoneDeviceId,
      }),
    },
  ),
)

const getSettingsStoreState = () => useSettingsStore.getState()

export { getSettingsStoreState, useSettingsStore }
