const MIDI_CHANNEL_COUNT = 16
const RESET_ALL_CONTROLLERS = 121

export function resetSynthControllers(synth) {
  if (!synth) return false

  if (typeof synth.controllerChange === 'function') {
    for (let channel = 0; channel < MIDI_CHANNEL_COUNT; channel += 1) {
      synth.controllerChange(channel, RESET_ALL_CONTROLLERS, 0)
    }
    return true
  }

  if (typeof synth.sendMessage === 'function') {
    for (let channel = 0; channel < MIDI_CHANNEL_COUNT; channel += 1) {
      synth.sendMessage([0xb0 + channel, RESET_ALL_CONTROLLERS, 0])
    }
    return true
  }

  return false
}
