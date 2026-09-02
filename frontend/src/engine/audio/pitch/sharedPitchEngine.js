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

const clearUnavailableSavedDevice = (requestedDeviceId, resolvedDeviceId) => {
  const requested = String(requestedDeviceId || '').trim()
  const resolved = String(resolvedDeviceId || '').trim()
  if (!requested || !resolved || requested === resolved) return false
  getSettingsStoreState().setMicrophoneDeviceId(resolved)
  console.warn('[mic] saved input is unavailable; using the system default microphone')
  return true
}

const startSharedMic = async () => {
  activeUsers += 1
  console.log('[mic] start request', { activeUsers })
  if (activeUsers === 1) {
    try {
      console.log('[mic] starting stream')
      const requestedDeviceId = getSettingsStoreState().microphoneDeviceId
      const resolvedDeviceId = await sharedPitchEngine.startMic({ deviceId: requestedDeviceId })
      clearUnavailableSavedDevice(requestedDeviceId, resolvedDeviceId)
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
  const resolvedDeviceId = await sharedPitchEngine.startMic({ deviceId })
  const usedFallback = clearUnavailableSavedDevice(deviceId, resolvedDeviceId)
  ensureSharedDebugAnalyser()
  return !usedFallback
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
