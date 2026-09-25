import { DEFAULT_CONFIG } from '../audioEngine.js'

const MAX_MICROPHONE_LATENCY_SEC = 1

function clampMicrophoneLatencySec(value) {
  const latency = Number(value)
  if (!Number.isFinite(latency)) return 0
  return Math.max(0, Math.min(MAX_MICROPHONE_LATENCY_SEC, latency))
}

function resolveMicAlignedSongTime({
  pitch,
  songTimeSec,
  microphoneLatencySec = 0,
  audioContext,
}) {
  const songTime = Number(songTimeSec)
  if (!Number.isFinite(songTime)) return null

  let alignedTime = songTime - clampMicrophoneLatencySec(microphoneLatencySec)
  const contextTime = Number(audioContext?.currentTime)
  const frameTime = Number(pitch?.tAcSec)
  if (Number.isFinite(contextTime) && Number.isFinite(frameTime)) {
    const callbackLag = Math.max(0, Math.min(0.25, contextTime - frameTime))
    const sampleRate = Number(audioContext?.sampleRate) || DEFAULT_CONFIG.sampleRate
    const halfWindowSec = Number(DEFAULT_CONFIG.windowSize) / (2 * sampleRate)
    alignedTime -= callbackLag + halfWindowSec
  }

  return Math.max(0, alignedTime)
}

function resolveTechniqueFrameTime({ songTime, frameTime, previousClock, hasReference }) {
  if (!hasReference) return Number.isFinite(frameTime) ? frameTime : null
  if (!Number.isFinite(songTime)) return null
  if (previousClock && Number.isFinite(frameTime) &&
      frameTime > previousClock.frameTime &&
      songTime >= previousClock.songTime - 0.15) {
    return Math.max(songTime, previousClock.alignedTime + frameTime - previousClock.frameTime)
  }
  return songTime
}

export {
  MAX_MICROPHONE_LATENCY_SEC,
  clampMicrophoneLatencySec,
  resolveMicAlignedSongTime,
  resolveTechniqueFrameTime,
}
