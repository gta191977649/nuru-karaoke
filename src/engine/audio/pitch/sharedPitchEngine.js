import { getKaraokeAudioEngine, DEFAULT_CONFIG } from '../../audioEngine.js'
import { PitchEngine } from './pitchEngine.js'

const sharedPitchEngine = new PitchEngine({ getAudioContext: () => getKaraokeAudioEngine().getAudioContext() })
let activeUsers = 0
let sharedDebugAnalyser = null

const ensureSharedDebugAnalyser = (options = {}) => {
  const analyser = sharedPitchEngine.ensureDebugAnalyser({
    fftSize: 2048,
    smoothingTimeConstant: 0,
    enableHpf: true,
    hpfCutoffHz: DEFAULT_CONFIG.hpfCutoffHz,
    ...options,
  })
  sharedDebugAnalyser = analyser || null
  return sharedDebugAnalyser
}

const getSharedDebugAnalyser = () => sharedDebugAnalyser

const startSharedMic = async () => {
  activeUsers += 1
  console.log('[mic] start request', { activeUsers })
  if (activeUsers === 1) {
    console.log('[mic] starting stream')
    await sharedPitchEngine.startMic()
    ensureSharedDebugAnalyser()
    console.log('[mic] stream active')
  }
}

const stopSharedMic = () => {
  if (activeUsers <= 0) return
  activeUsers -= 1
  console.log('[mic] stop request', { activeUsers })
  if (activeUsers === 0) {
    console.log('[mic] stopping stream')
    sharedPitchEngine.stopMic()
    sharedDebugAnalyser = null
    console.log('[mic] stream stopped')
  }
}

export {
  sharedPitchEngine,
  startSharedMic,
  stopSharedMic,
  ensureSharedDebugAnalyser,
  getSharedDebugAnalyser,
}
