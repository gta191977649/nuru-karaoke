let sharedContext = null
let requestedSampleRate = 44100

function ensureAudioContext() {
  if (!sharedContext) {
    sharedContext = new AudioContext({ sampleRate: requestedSampleRate })
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
