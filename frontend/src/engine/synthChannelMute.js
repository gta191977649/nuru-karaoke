export function setSynthChannelMuted(synth, channel, muted) {
  const channelIndex = Number(channel)
  if (!synth || !Number.isInteger(channelIndex) || channelIndex < 0) return false

  const midiChannel = synth.midiChannels?.[channelIndex]
  if (typeof midiChannel?.setSystemParameter === 'function') {
    midiChannel.setSystemParameter('isMuted', Boolean(muted))
    return true
  }

  // Compatibility with SpessaSynth releases before the per-channel API.
  if (typeof synth.muteChannel === 'function') {
    synth.muteChannel(channelIndex, Boolean(muted))
    return true
  }

  return false
}
