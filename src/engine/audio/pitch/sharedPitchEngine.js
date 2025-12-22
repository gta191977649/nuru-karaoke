import { synthEngine } from '../../SynthEngine.js'
import { PitchEngine } from './pitchEngine.js'

const sharedPitchEngine = new PitchEngine({ getAudioContext: () => synthEngine.getAudioContext() })
let activeUsers = 0

const startSharedMic = async () => {
  activeUsers += 1
  console.log('[mic] start request', { activeUsers })
  if (activeUsers === 1) {
    console.log('[mic] starting stream')
    await sharedPitchEngine.startMic()
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
    console.log('[mic] stream stopped')
  }
}

export { sharedPitchEngine, startSharedMic, stopSharedMic }
