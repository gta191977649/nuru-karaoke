export function setSynthChannelDrums(synth, channel, isDrum) {
  const channelIndex = Number(channel)
  if (!synth || !Number.isInteger(channelIndex) || channelIndex < 0) return false

  const midiChannel = synth.midiChannels?.[channelIndex]
  if (typeof midiChannel?.setDrums === 'function') {
    midiChannel.setDrums(Boolean(isDrum))
    return true
  }

  // Compatibility with SpessaSynth releases that exposed this on the synth.
  if (typeof synth.setDrums === 'function') {
    synth.setDrums(channelIndex, Boolean(isDrum))
    return true
  }

  return false
}
