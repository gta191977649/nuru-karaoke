import { create } from 'zustand'
import { SCREENS } from '../home/WiiHomeMain.jsx'

const useUiStore = create((set) => ({
  screen: SCREENS.home,
  karaokeActive: false,
  karaokeMini: false,
  setScreen: (screen) => set({ screen }),
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
