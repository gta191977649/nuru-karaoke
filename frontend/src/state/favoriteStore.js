import { create } from 'zustand'

import {
  addFavorite as addFavoriteRequest,
  fetchFavorites,
  removeFavorite as removeFavoriteRequest,
} from '../services/favorites.js'

let latestLoadId = 0

const useFavoriteStore = create((set, get) => ({
  items: [],
  status: 'idle',
  error: '',

  reset: () => {
    latestLoadId += 1
    set({ items: [], status: 'idle', error: '' })
  },

  load: async (accessToken) => {
    if (!accessToken) {
      get().reset()
      return []
    }

    const loadId = ++latestLoadId
    set({ status: 'loading', error: '' })
    try {
      const items = await fetchFavorites(accessToken)
      if (loadId === latestLoadId) {
        set({ items, status: 'ready', error: '' })
      }
      return items
    } catch (error) {
      if (loadId === latestLoadId) {
        set({
          status: 'error',
          error: error?.message || 'Failed to load favorites',
        })
      }
      throw error
    }
  },

  add: async (song, accessToken) => {
    const songCode = song?.song_code || song?.id
    if (!songCode) throw new Error('Song code required')
    if (get().items.some((item) => item.song_code === songCode)) return false

    await addFavoriteRequest(songCode, accessToken)
    set((state) => ({
      items: [
        {
          song_code: songCode,
          title: song?.title || songCode,
          artist: song?.artist || '',
          created_at: new Date().toISOString(),
        },
        ...state.items.filter((item) => item.song_code !== songCode),
      ],
      status: 'ready',
      error: '',
    }))
    return true
  },

  remove: async (songCode, accessToken) => {
    await removeFavoriteRequest(songCode, accessToken)
    set((state) => ({
      items: state.items.filter((item) => item.song_code !== songCode),
      error: '',
    }))
  },
}))

export default useFavoriteStore
