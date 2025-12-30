import { create } from 'zustand'

const initialState = {
  pendingSong: null,
  lrcName: '',
  lrcEntries: [],
  lyricOffsetMs: 0,
  activeLyricIndex: -1,
  karaokeProgress: 0,
}

const useSynthUiStore = create((set) => ({
  ...initialState,
  setPendingSong: (song) => set({ pendingSong: song || null }),
  clearPendingSong: () => set({ pendingSong: null }),
  setLyrics: (payload) =>
    set({
      lrcName: payload?.lrcName || '',
      lrcEntries: Array.isArray(payload?.lrcEntries) ? payload.lrcEntries : [],
    }),
  setLyricOffsetMs: (value) => set({ lyricOffsetMs: Number(value) || 0 }),
  setKaraokeState: (patch) =>
    set({
      activeLyricIndex: Number.isFinite(patch?.activeLyricIndex) ? patch.activeLyricIndex : -1,
      karaokeProgress: Number.isFinite(patch?.karaokeProgress) ? patch.karaokeProgress : 0,
    }),
  resetLyrics: () =>
    set({
      lrcName: '',
      lrcEntries: [],
      lyricOffsetMs: 0,
      activeLyricIndex: -1,
      karaokeProgress: 0,
    }),
}))

const getSynthUiState = () => useSynthUiStore.getState()
const setSynthUiState = (patch) => useSynthUiStore.setState(patch)

export { useSynthUiStore, getSynthUiState, setSynthUiState }
