const PLAYER_CONFIG = {
  stopFadeMs: 3000,
  autoAdvanceOnFinish: false,
}

const UI_CONFIG = {
  karaokeTransitionMs: 1000,
  resultsAutoAdvanceMs: 10000,
  melodyGuideWindowSec: 8,
  melodyGuidePlayheadRatio: 0.7,
  // Number of songs shown on each keyword-search results page.
  songBrowserPageSize: 8,
}

// Synth master-effect defaults. Keep these in one place so the initial UI,
// store state, main SynthEngine and standalone debug synth all agree.
const SYNTH_EFFECTS_CONFIG = Object.freeze({
  reverbGain: 1,
  chorusGain: 1,
})

export { PLAYER_CONFIG, SYNTH_EFFECTS_CONFIG, UI_CONFIG }
