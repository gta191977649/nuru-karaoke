const DEFAULT_CONFIG = {
  sampleRate: 44100,
  windowSize: 2048,
  hopSize: 256,
  rmsGate: 0.01,
  clarityGate: 0.8,
  enableDoubleExponentialSmoothing: false,
  smoothAlpha: 0.5, // Level smoothing factor
  smoothBeta: 0.1, // Trend smoothing factor
  stepResetThresholdCents: 80,
  stepResetClusterCents: 45,
  stepResetConfirmFrames: 2,
  f0MinHz: 80, //  Detection Range for vocal low bound (Hz)
  f0MaxHz: 1000, // Detection Range for vocal high bound (Hz)
  pitchToleranceSemis: 1.5, // Legacy setting; pitch-v6 visual/scoring paths use shared stable cents segments
  f0TimeToleranceSec: 0.12, // F0 time tolerance (seconds) for visual scoring smoothing
  // Short gaps are bridged by the scorer, not by the detector.
  breakToleranceMs: 0,
  medianWindowSize: 3, // 中值滤波窗口大小（抗尖刺）
  maxJumpSemitones: 6, // 半音跳变约束（MIDI domain） 人声物理约束。
  holdFrames: 0, // No detector-side pitch hold during gameplay
  enablePitchSnap: false,
  snapToleranceSemis: 0.35, // Snap tolerance in semitones
  hpfCutoffHz: 80, //High-pass filter cutoff for mic conditioning
  enableDcRemoval: true,
  enableHpf: true,
  enableRmsGate: true,
  enableF0Validate: true,
  enableTemporalSmooth: false, // Keep false; allkaraoke-like stability uses breakTolerance/snap
  micConstraints: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
  debugPipeline: false,
  debugPipelineStride: 4,
  pitchAlgoId: 'aubio',
  aubioTolerance: 0.5,
  yinConfidenceGate: 0.2,
}

let sharedContext = null
let requestedSampleRate = DEFAULT_CONFIG.sampleRate

function ensureAudioContext() {
  if (!sharedContext) {
    sharedContext = new AudioContext({ sampleRate: requestedSampleRate })
    console.log("Engine: created audio context")
  }
  return sharedContext
}

async function resumeAudio() {
  const ctx = ensureAudioContext()
  if (ctx.state !== 'running') {
    await ctx.resume()
  }
  return ctx
}

function getAudioContext() {
  return sharedContext
}

function setSampleRate(sampleRate) {
  if (sharedContext) return
  const next = Number(sampleRate)
  if (Number.isFinite(next) && next > 0) {
    requestedSampleRate = next
  }
}

async function createKaraokeAudioEngine({ sampleRate } = {}) {
  if (Number.isFinite(sampleRate)) {
    setSampleRate(sampleRate)
  }
  return {
    getAudioContext,
    ensureAudioContext,
    resumeAudio,
    setSampleRate,
  }
}

let sharedEngine = null

function getKaraokeAudioEngine() {
  if (!sharedEngine) {
    sharedEngine = {
      getAudioContext,
      ensureAudioContext,
      resumeAudio,
      setSampleRate,
    }
  }
  return sharedEngine
}

// UI audio (SFX/BGM) is intentionally independent from the karaoke AudioContext graph.
// We keep one HTMLAudioElement per channel to make it easy to globally control volumes.
let sharedUiAudioEngine = null

function clamp01(x) {
  const n = Number(x)
  if (!Number.isFinite(n)) return 1
  return Math.max(0, Math.min(1, n))
}

function createUiAudioEngine() {
  const state = {
    sfxVolume: 0.7,
    bgmVolume: 0.9,
  }

  let sfxAudio = null
  let bgmAudio = null

  let bgmFadeRaf = null
  let bgmFadeToken = 0
  let bgmStopPromise = null
  let resolveBgmStop = null

  function ensureSfxAudio() {
    if (!sfxAudio) {
      sfxAudio = new Audio()
      sfxAudio.preload = 'auto'
      sfxAudio.volume = state.sfxVolume
    }
    return sfxAudio
  }

  function ensureBgmAudio() {
    if (!bgmAudio) {
      bgmAudio = new Audio()
      bgmAudio.preload = 'auto'
      bgmAudio.volume = state.bgmVolume
      bgmAudio.loop = false
    }
    return bgmAudio
  }

  function setSfxVolume(vol) {
    state.sfxVolume = clamp01(vol)
    if (sfxAudio) sfxAudio.volume = state.sfxVolume
  }

  function setBgmVolume(vol) {
    state.bgmVolume = clamp01(vol)
    if (bgmAudio) bgmAudio.volume = state.bgmVolume
  }

  function getVolumes() {
    return { ...state }
  }

  async function playSfx(src, options = {}) {
    if (!src) return
    const audio = ensureSfxAudio()
    const vol = options.volume == null ? state.sfxVolume : clamp01(options.volume)
    try {
      audio.pause()
      audio.src = src
      audio.currentTime = 0
      audio.volume = vol
      await audio.play()
    } catch (e) {
      // Autoplay can be blocked; ignore.
      console.warn('[ui-audio] SFX play failed', e)
    } finally {
      // Restore configured volume so later updates are predictable.
      audio.volume = state.sfxVolume
    }
  }

  function cancelBgmFade() {
    resolveBgmStop?.()
    resolveBgmStop = null
    bgmStopPromise = null
    if (bgmFadeRaf) {
      cancelAnimationFrame(bgmFadeRaf)
      bgmFadeRaf = null
    }
    bgmFadeToken += 1
    return bgmFadeToken
  }

  function fadeBgmTo(targetVolume, fadeMs) {
    const audio = bgmAudio
    if (!audio) return

    const token = cancelBgmFade()
    const startAt = performance.now()
    const startVol = Number.isFinite(audio.volume) ? audio.volume : state.bgmVolume
    const endVol = clamp01(targetVolume)
    const ms = Math.max(0, Number(fadeMs) || 0)

    const tick = (now) => {
      if (token !== bgmFadeToken) return
      const t = ms > 0 ? Math.min(1, (now - startAt) / ms) : 1
      audio.volume = startVol + (endVol - startVol) * t
      if (t < 1) {
        bgmFadeRaf = requestAnimationFrame(tick)
      } else {
        bgmFadeRaf = null
      }
    }

    bgmFadeRaf = requestAnimationFrame(tick)
  }

  async function playBgm(src, options = {}) {
    if (!src) return
    const audio = ensureBgmAudio()

    // Cancel any fade currently running so we don't fight with play.
    cancelBgmFade()

    const loop = options.loop !== false
    const restart = options.restart !== false
    const vol = options.volume == null ? state.bgmVolume : clamp01(options.volume)

    try {
      if (audio.src !== src) {
        audio.src = src
        if (restart) audio.currentTime = 0
      } else if (restart) {
        audio.currentTime = 0
      }
      audio.loop = !!loop
      audio.volume = vol
      await audio.play()
    } catch (e) {
      console.warn('[ui-audio] BGM play failed', e)
    } finally {
      // Keep the current runtime volume; settings can update via setBgmVolume.
    }
  }

  function stopBgm(options = {}) {
    const audio = bgmAudio
    if (!audio) return Promise.resolve()

    const fadeMs = Math.max(0, Number(options.fadeMs) || 0)
    const reset = options.reset !== false

    // Prevent looping back to the start while fading/stopping.
    audio.loop = false

    // Cleanup and repeated stop requests share the original fade/deadline.
    if (fadeMs > 0 && bgmStopPromise) return bgmStopPromise

    if (fadeMs <= 0) {
      cancelBgmFade()
      try {
        audio.pause()
        if (reset) audio.currentTime = 0
        audio.volume = state.bgmVolume
      } catch {
        // ignore
      }
      return Promise.resolve()
    }

    if (audio.paused) return Promise.resolve()

    const token = cancelBgmFade()
    bgmStopPromise = new Promise((resolve) => { resolveBgmStop = resolve })
    const startAt = performance.now()
    const startVol = Number.isFinite(audio.volume) ? audio.volume : state.bgmVolume

    const tick = (now) => {
      if (token !== bgmFadeToken) return
      const t = Math.min(1, (now - startAt) / fadeMs)
      const nextVol = Math.max(0, startVol * (1 - t))
      audio.volume = nextVol
      if (t < 1) {
        bgmFadeRaf = requestAnimationFrame(tick)
        return
      }
      bgmFadeRaf = null
      try {
        audio.pause()
        if (reset) audio.currentTime = 0
        audio.volume = state.bgmVolume
      } catch {
        // ignore
      }
      resolveBgmStop?.()
      resolveBgmStop = null
      bgmStopPromise = null
    }

    bgmFadeRaf = requestAnimationFrame(tick)
    return bgmStopPromise
  }

  return {
    // volumes
    getVolumes,
    setSfxVolume,
    setBgmVolume,

    // playback
    playSfx,
    playBgm,
    stopBgm,

    // advanced (rare)
    fadeBgmTo,
  }
}

function getUiAudioEngine() {
  if (!sharedUiAudioEngine) sharedUiAudioEngine = createUiAudioEngine()
  return sharedUiAudioEngine
}

export { createKaraokeAudioEngine, getKaraokeAudioEngine }
export { getUiAudioEngine }
export { DEFAULT_CONFIG }
