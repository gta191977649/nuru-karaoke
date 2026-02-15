import { create } from 'zustand'

const useAlertStore = create((set) => ({
  alert: null,
  visible: false,
  showAlert: ({ message, variant = 'primary', timeoutMs = 0 }) =>
    set({
      alert: { message, variant, timeoutMs },
      visible: true,
    }),
  hideAlert: () => set({ visible: false }),
  clearAlert: () => set({ alert: null, visible: false }),
}))

export default useAlertStore
