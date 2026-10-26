// Adapter for the pinned SpessaSynth worklet layout. Run entirely on its audio
// thread, before Sequencer restores MIDI state, so queued old notes/FX cannot leak.
export function clearBuiltinAudio(processor) {
  const core = processor.synthCore
  if (!core?.reverbProcessor || !core?.eventQueue || !core?.insertionEffects) {
    throw new Error('Unsupported SpessaSynth audio reset layout; rebuild the builtin processor')
  }
  processor.stopAllChannels(true)
  core.eventQueue.length = 0
  for (let channel = 0; channel < processor.midiChannels.length; channel++) {
    for (const pedal of [64, 66, 69]) processor.processMessage(
      [0xb0 | (channel & 15), pedal, 0], Math.floor(channel / 16) * 16,
    )
  }
  // reset()/macro changes preserve delay lines upstream. Fresh processors keep
  // effect parameters but discard their audio, filter, feedback and LFO history.
  for (const key of ['reverbProcessor', 'chorusProcessor', 'delayProcessor']) {
    const previous = core[key]
    const settings = previous.getSnapshot()
    const next = new previous.constructor(core.sampleRate, core.maxBufferSize)
    Object.assign(next, settings)
    core[key] = next
  }
  const active = core.insertionProcessor
  const sends = { sendLevelToReverb: active.sendLevelToReverb,
    sendLevelToChorus: active.sendLevelToChorus, sendLevelToDelay: active.sendLevelToDelay }
  const parameters = core.insertionParams.slice()
  for (const [type, effect] of core.insertionEffects) {
    core.insertionEffects.set(type, new effect.constructor(core.sampleRate, core.maxBufferSize))
  }
  core.insertionFallback = new core.insertionFallback.constructor()
  core.insertionProcessor = core.insertionEffects.get(active.type) || core.insertionFallback
  for (let index = 0; index < 20; index++) {
    if (parameters[index] !== 255) core.insertionProcessor.setParameter(index + 3, parameters[index])
  }
  Object.assign(core.insertionProcessor, sends)
  for (const key of ['voiceBuffer', 'insertionInputL', 'insertionInputR', 'reverbInput', 'chorusInput', 'delayInput']) {
    core[key]?.fill(0)
  }
}

export function withBuiltinTransitions(Base) {
  return class extends Base {
    constructor(options) {
      super(options)
      const original = this.core.handleMessage.bind(this.core)
      this.core.handleMessage = message => {
        const sequenceChange = message.type === 'sequencerSpecific' &&
          ['loadNewSongList', 'setTime', 'changeSong'].includes(message.data?.type)
        const hardStop = message.type === 'stopAll' && message.channelNumber === -1 && message.data === 1
        if (sequenceChange || hardStop) clearBuiltinAudio(this.core.synthesizer)
        return original(message)
      }
    }
  }
}
