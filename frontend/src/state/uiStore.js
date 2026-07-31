import { create } from 'zustand'
import { SCREENS } from '../home/screens.js'

const useUiStore = create((set) => ({
  screen: SCREENS.home,
  selectedArtist: '',
  songSearchMode: 'title',
  artistReturnScreen: SCREENS.home,
  songDetailReturnScreen: SCREENS.findSongs,
  karaokeActive: true,
  karaokeMini: true,
  setScreen: (screen) => set({ screen }),
  openSongSearch: (songSearchMode = 'title') =>
    set((state) => ({
      screen: SCREENS.findSongs,
      songSearchMode,
      karaokeMini: state.karaokeActive ? true : state.karaokeMini,
    })),
  setSongDetailReturnScreen: (songDetailReturnScreen) => set({ songDetailReturnScreen }),
  openArtist: (artist) =>
    set((state) => ({
      screen: SCREENS.artist,
      selectedArtist: String(artist || '').trim(),
      artistReturnScreen: state.screen === SCREENS.artist ? state.artistReturnScreen : state.screen,
      karaokeMini: state.karaokeActive ? true : state.karaokeMini,
    })),
  closeArtist: () =>
    set((state) => ({
      screen: state.artistReturnScreen || SCREENS.home,
      karaokeMini: state.artistReturnScreen === SCREENS.karaoke ? false : state.karaokeMini,
    })),
  setKaraokeActive: (karaokeActive) => set({ karaokeActive }),
  setKaraokeMini: (karaokeMini) => set({ karaokeMini }),
  openKaraoke: () =>
    set({
      screen: SCREENS.karaoke,
      karaokeActive: true,
      karaokeMini: false,
    }),
}))

export default useUiStore
