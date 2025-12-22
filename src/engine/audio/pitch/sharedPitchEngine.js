import { synthEngine } from '../../SynthEngine.js'
import { PitchEngine } from './pitchEngine.js'

const sharedPitchEngine = new PitchEngine({ getAudioContext: () => synthEngine.getAudioContext() })
let activeUsers = 0

const startSharedMic = async () => {
  activeUsers += 1
  if (activeUsers === 1) {
    await sharedPitchEngine.startMic()
  }
}

const stopSharedMic = () => {
  if (activeUsers <= 0) return
  activeUsers -= 1
  if (activeUsers === 0) {
    sharedPitchEngine.stopMic()
  }
}

export { sharedPitchEngine, startSharedMic, stopSharedMic }
