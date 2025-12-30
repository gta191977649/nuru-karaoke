const DEFAULT_CONFIG = {
  windowSize: 2048,
  hopSize: 256,
  rmsGate: 0.01,
  clarityGate: 0.8,
  smoothing: false, //Do Moving Average on f0
  f0MinHz: 80, //  Detection Range for vocal low bound (Hz)
  f0MaxHz: 1000, // Detection Range for vocal high bound (Hz)
  medianWindowSize: 5, //中值滤波窗口大小（抗尖刺）
  maxJumpSemitones: 3, //半音跳变约束（MIDI domain） 人声物理约束。
  holdFrames: 2, // 音高短暂保持（Hold）
  hpfCutoffHz: 80, //High-pass filter cutoff for mic conditioning
  sampleRate: 48000,
  pitchAlgoId: 'pitchy',
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
