import { create } from 'zustand'

const initialEngineState = {
  ready: false,
  status: 'Initializing…',
  soundFontName: 'GM',
  midiUrl: '',
  midiName: '',
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  reverbGain: 1.5,
  chorusGain: 1.2,
  enableMIDIStandardMapping: true,
  transposition: 0,
  queue: [],
  queueIndex: -1,
  playbackSessionId: 0,
  history: [],
  enabledChannels: Array.from({ length: 16 }, () => true),
  channelInstrumentNames: Array.from({ length: 16 }, (_, i) => (i === 9 ? 'Drums' : '—')),
  midiChannels: Array.from({ length: 16 }, (_, i) => ({
    channel: i,
    isDrum: i === 9,
    program: 0,
    bankMSB: 0,
    bankLSB: 0,
    name: i === 9 ? 'Drums' : '—',
  })),
  channelActivityVelocity: Array.from({ length: 16 }, () => 0),
  channelActivityTime: Array.from({ length: 16 }, () => -1),
  polyphonyCount: 0,
  xgDrumMapEnabled: true,
  xgPreferGsPlayback: true,
  smfKnifeConfigName: '',
  smfKnifeSource: '',
  smfKnifeDestination: '',
  xgDrumMapState: {
    globalMode: 'unknown',
    detectedBy: null,
    xgBankSelectPairs: 0,
    drumChannels: Array.from({ length: 16 }, () => false),
    brushChannels: Array.from({ length: 16 }, () => false),
    bankMSB: Array.from({ length: 16 }, () => -1),
    bankLSB: Array.from({ length: 16 }, () => -1),
  },
}

const initialUiState = {
  pendingSong: null,
  lrcName: '',
  lrcEntries: [],
  lyricOffsetMs: 0,
  activeLyricIndex: -1,
  karaokeProgress: 0,
  lastIntroMidiUrl: '',
  karaokeView: 'message',
}

const useKaraokeStore = create((set) => ({
  ...initialEngineState,
  ...initialUiState,
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
  setLastIntroMidiUrl: (value) => set({ lastIntroMidiUrl: value || '' }),
  setKaraokeView: (view) =>
    set({
      karaokeView: view === 'results' ? 'results' : view === 'message' ? 'message' : 'singing',
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

const getKaraokeStoreState = () => useKaraokeStore.getState()
const setKaraokeStoreState = (patch) => useKaraokeStore.setState(patch)

export { useKaraokeStore, getKaraokeStoreState, setKaraokeStoreState }
