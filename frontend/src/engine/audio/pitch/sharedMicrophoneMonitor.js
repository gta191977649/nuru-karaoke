import { useSettingsStore } from '../../../state/settingsStore.js'
import { sharedPitchEngine, startSharedMic, stopSharedMic } from './sharedPitchEngine.js'

let claimed = false
let generation = 0
let calibrationMutes = 0

const syncMonitor = () => {
  const state = useSettingsStore.getState()
  sharedPitchEngine.setMonitorSettings({
    enabled: state.microphoneMonitorEnabled,
    muted: calibrationMutes > 0,
    volume: state.microphoneMonitorVolume / 100,
    reverb: state.microphoneMonitorReverb / 100,
  })
}

useSettingsStore.subscribe(syncMonitor)
syncMonitor()

async function enableSharedMicrophoneMonitor() {
  if (claimed) return
  claimed = true
  const request = ++generation
  let acquired = false
  try {
    await startSharedMic()
    acquired = true
    if (request !== generation) return
    useSettingsStore.getState().setMicrophoneMonitorEnabled(true)
  } catch (error) {
    if (request === generation) {
      claimed = false
      useSettingsStore.getState().setMicrophoneMonitorEnabled(false)
      if (acquired) stopSharedMic()
    }
    throw error
  }
}

function disableSharedMicrophoneMonitor() {
  if (!claimed) return
  claimed = false
  generation += 1
  useSettingsStore.getState().setMicrophoneMonitorEnabled(false)
  stopSharedMic()
}

function muteSharedMicrophoneMonitorForCalibration() {
  calibrationMutes += 1
  syncMonitor()
  let resumed = false
  return () => {
    if (resumed) return
    resumed = true
    calibrationMutes = Math.max(0, calibrationMutes - 1)
    syncMonitor()
  }
}

export {
  disableSharedMicrophoneMonitor,
  enableSharedMicrophoneMonitor,
  muteSharedMicrophoneMonitorForCalibration,
}
