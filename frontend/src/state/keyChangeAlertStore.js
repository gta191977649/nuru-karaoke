import { create } from 'zustand'

const useKeyChangeAlertStore = create((set) => ({
  visible: false,
  value: 0,
  timeoutMs: 2000,
  showKeyChangeAlert: (value, timeoutMs) =>
    set({
      visible: true,
      value: Number(value) || 0,
      timeoutMs: Number(timeoutMs) || 3000,
    }),
  hideKeyChangeAlert: () => set({ visible: false }),
  clearKeyChangeAlert: () => set({ visible: false, value: 0, timeoutMs: 1400 }),
}))

export default useKeyChangeAlertStore
