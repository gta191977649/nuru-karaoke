export function setSynthChannelMuted(synth, channel, muted) {
  const channelIndex = Number(channel)
  if (!synth || !Number.isInteger(channelIndex) || channelIndex < 0) return false

  // isMuted prevents future Note On messages, but it does not kill voices
  // which are already sounding. Silence those first so the UI reacts at once.
  if (muted) {
    if (typeof synth.controllerChange === 'function') {
      synth.controllerChange(channelIndex, 120, 0)
    } else if (typeof synth.sendMessage === 'function') {
      synth.sendMessage([0xb0 | (channelIndex & 0x0f), 120, 0], Math.floor(channelIndex / 16) * 16)
    }
  }

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

/**
 * Applies one visible MIDI-channel switch to that channel on every MIDI port.
 * SpessaSynth represents port 2 as channels 16-31, while the debug UI keeps
 * the familiar 16 channel switches.
 */
export function setSynthMidiChannelGroupMuted(synth, channel, muted) {
  const logicalChannel = Number(channel)
  if (!synth || !Number.isInteger(logicalChannel) || logicalChannel < 0 || logicalChannel > 15) {
    return false
  }

  const channelCount = Math.max(16, Number(synth.midiChannels?.length) || 0)
  let applied = false
  for (let physicalChannel = logicalChannel; physicalChannel < channelCount; physicalChannel += 16) {
    applied = setSynthChannelMuted(synth, physicalChannel, muted) || applied
  }
  return applied
}
