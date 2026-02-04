const DEFAULT_CONFIG = {
  sampleRate: 44100,
  windowSize: 1024,
  hopSize: 256,
  rmsGate: 0.01,
  clarityGate: 0.8,
  enableDoubleExponentialSmoothing: true, // Double Exponential Smoothing
  smoothAlpha: 0.5, // Level smoothing factor
  smoothBeta: 0.1, // Trend smoothing factor
  f0MinHz: 80, //  Detection Range for vocal low bound (Hz)
  f0MaxHz: 1000, // Detection Range for vocal high bound (Hz)
  pitchToleranceSemis: 1.5, // Semitone tolerance for melody correctness
  f0TimeToleranceSec: 0.06, // F0 time tolerance (seconds) for visual scoring smoothing
  // allkaraoke-like stability knobs
  breakToleranceMs: 100, // Short unvoiced gap tolerance (~100ms)
  medianWindowSize: 3, // 中值滤波窗口大小（抗尖刺）
  maxJumpSemitones: 6, // 半音跳变约束（MIDI domain） 人声物理约束。
  holdFrames: 0, // Will be derived from breakToleranceMs unless overridden
  enablePitchSnap: true, // Snap tiny jitter to last stable pitch
  snapToleranceSemis: 0.35, // Snap tolerance in semitones
  hpfCutoffHz: 80, //High-pass filter cutoff for mic conditioning
  enableDcRemoval: true,
  enableHpf: true,
  enableRmsGate: true,
  enableF0Validate: true,
  enableTemporalSmooth: false, // Keep false; allkaraoke-like stability uses breakTolerance/snap
  debugPipeline: false,
  debugPipelineStride: 4,
  pitchAlgoId: 'pitchy',
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

export { createKaraokeAudioEngine, getKaraokeAudioEngine }
export { DEFAULT_CONFIG }
