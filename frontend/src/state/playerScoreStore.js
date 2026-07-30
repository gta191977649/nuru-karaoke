import { create } from 'zustand'

const initialTechniqueCounts = {
  glissup: 0,
  kobushi: 0,
  glissdown: 0,
  vibrato: 0,
}

const initialScoreState = {
  scoreSessionId: null,
  liveScore: 0,
  liveScoreReady: false,
  finalScore: 0,
  techniqueCounts: { ...initialTechniqueCounts },
  scoreMeta: {
    ratio: 0,
    correctWeightedBeats: 0,
    totalWeightedBeats: 0,
  },
  songInfo: null,
  f0Curve: null,
  hasResults: false,
}

const usePlayerScoreStore = create((set) => ({
  ...initialScoreState,
  beginPlayerScoreSession: (sessionId) => {
    if (sessionId == null) return false
    let didReset = false
    set((state) => {
      if (state.scoreSessionId === sessionId) return state
      didReset = true
      return {
        ...initialScoreState,
        scoreSessionId: sessionId,
        techniqueCounts: { ...initialTechniqueCounts },
      }
    })
    return didReset
  },
  resetPlayerScore: () =>
    set({
      ...initialScoreState,
      techniqueCounts: { ...initialTechniqueCounts },
    }),
  setLiveScore: (score, ready = true) => set({
    liveScore: Number.isFinite(score) ? score : 0,
    liveScoreReady: ready === true,
  }),
  setFinalScore: (score) =>
    set({
      finalScore: Number.isFinite(score) ? score : 0,
      hasResults: true,
    }),
  setTechniqueCounts: (counts) =>
    set({
      techniqueCounts: {
        ...initialTechniqueCounts,
        ...(counts || {}),
      },
    }),
  setScoreMeta: (meta) =>
    set({
      scoreMeta: {
        ...initialScoreState.scoreMeta,
        ...(meta || {}),
      },
    }),
  setSongInfo: (songInfo) => set({ songInfo: songInfo || null }),
  setF0Curve: (curve) => set({ f0Curve: curve || null }),
  setResults: (payload = {}) =>
    set({
      finalScore: Number.isFinite(payload.score) ? payload.score : 0,
      techniqueCounts: {
        ...initialTechniqueCounts,
        ...(payload.techniques || {}),
      },
      scoreMeta: {
        ...initialScoreState.scoreMeta,
        ...(payload.scoreMeta || {}),
      },
      songInfo: payload.songInfo || null,
      f0Curve: payload.f0Curve || null,
      hasResults: true,
    }),
}))

const getPlayerScoreState = () => usePlayerScoreStore.getState()
const setPlayerScoreState = (patch) => usePlayerScoreStore.setState(patch)

export { usePlayerScoreStore, getPlayerScoreState, setPlayerScoreState }
