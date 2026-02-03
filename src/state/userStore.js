import { create } from 'zustand'

import { fetchMe, login, logout, refreshToken, register } from '../services/auth.js'

const useUserStore = create((set, get) => ({
  status: 'idle', // idle | loading | authenticated | guest | error
  user: null,
  accessToken: '',
  error: '',
  isGuest: false,
  setGuest: () =>
    set({
      status: 'guest',
      user: null,
      accessToken: '',
      error: '',
      isGuest: true,
    }),
  clearError: () => set({ error: '' }),
  login: async (usernameOrEmail, password) => {
    set({ status: 'loading', error: '' })
    try {
      const data = await login(usernameOrEmail, password)
      const accessToken = data?.access || ''
      let user = null
      if (accessToken) {
        user = await fetchMe(accessToken)
      }
      set({
        status: 'authenticated',
        user,
        accessToken,
        error: '',
        isGuest: false,
      })
    } catch (error) {
      set({ status: 'error', error: error?.message || 'Login failed' })
      throw error
    }
  },
  register: async (username, email, password) => {
    set({ status: 'loading', error: '' })
    try {
      const data = await register(username, email, password)
      const accessToken = data?.access || ''
      let user = null
      if (accessToken) {
        user = await fetchMe(accessToken)
      }
      set({
        status: 'authenticated',
        user,
        accessToken,
        error: '',
        isGuest: false,
      })
    } catch (error) {
      set({ status: 'error', error: error?.message || 'Register failed' })
      throw error
    }
  },
  refresh: async () => {
    try {
      const data = await refreshToken()
      const accessToken = data?.access || ''
      if (!accessToken) {
        set({ status: 'idle', user: null, accessToken: '', isGuest: false })
        return
      }
      const user = await fetchMe(accessToken)
      set({
        status: 'authenticated',
        user,
        accessToken,
        error: '',
        isGuest: false,
      })
    } catch (error) {
      set({ status: 'idle', user: null, accessToken: '', isGuest: false, error: error?.message || '' })
    }
  },
  logout: async () => {
    await logout()
    set({ status: 'idle', user: null, accessToken: '', isGuest: false })
  },
  getAuthHeader: () => {
    const token = get().accessToken
    return token ? { Authorization: `Bearer ${token}` } : {}
  },
}))

export default useUserStore
