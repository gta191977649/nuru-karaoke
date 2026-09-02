import { getKaraokeAudioEngine, DEFAULT_CONFIG } from '../../audioEngine.js'
import { PitchEngine } from './pitchEngine.js'
import { getSettingsStoreState } from '../../../state/settingsStore.js'

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
    try {
      console.log('[mic] starting stream')
      await sharedPitchEngine.startMic({
        deviceId: getSettingsStoreState().microphoneDeviceId,
      })
      ensureSharedDebugAnalyser()
      console.log('[mic] stream active')
    } catch (error) {
      activeUsers = Math.max(0, activeUsers - 1)
      throw error
    }
  }
  return sharedPitchEngine.getActiveInputDeviceId()
}

const switchSharedMicDevice = async (deviceId) => {
  if (activeUsers <= 0) return false
  sharedPitchEngine.stopMic()
  sharedDebugAnalyser = null
  try {
    await sharedPitchEngine.startMic({ deviceId })
    ensureSharedDebugAnalyser()
    return true
  } catch (error) {
    if (deviceId) {
      try {
        await sharedPitchEngine.startMic()
        ensureSharedDebugAnalyser()
      } catch {
        // Preserve the original device-selection error.
      }
    }
    throw error
  }
}

const getActiveSharedMicDeviceId = () => sharedPitchEngine.getActiveInputDeviceId()

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
  switchSharedMicDevice,
  getActiveSharedMicDeviceId,
}
