import { create } from 'zustand'

const useKeyChangeAlertStore = create((set) => ({
  visible: false,
  value: 0,
  previousValue: 0,
  animationId: 0,
  timeoutMs: 2000,
  showKeyChangeAlert: (value, timeoutMs) =>
    set((state) => {
      const nextValue = Number(value) || 0
      return {
        visible: true,
        value: nextValue,
        previousValue: state.visible ? state.value : 0,
        animationId: state.animationId + 1,
        timeoutMs: Number(timeoutMs) || 3000,
      }
    }),
  hideKeyChangeAlert: () => set({ visible: false }),
  clearKeyChangeAlert: () => set({
    visible: false,
    value: 0,
    previousValue: 0,
    timeoutMs: 1400,
  }),
}))

export default useKeyChangeAlertStore
