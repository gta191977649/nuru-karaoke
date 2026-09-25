const clampLevel = (value, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback
}

function createRoomImpulse(context) {
  const length = Math.round(context.sampleRate * 1.35)
  const buffer = context.createBuffer(2, length, context.sampleRate)
  let seed = 0x5f3759df
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = buffer.getChannelData(channel)
    for (let index = 0; index < length; index += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const seconds = index / context.sampleRate
      const envelope = Math.exp(-seconds * 5.2) * Math.min(1, seconds * 180)
      samples[index] = ((seed / 0xffffffff) * 2 - 1) * envelope * 0.015
    }
  }
  return buffer
}

class MicrophoneMonitor {
  constructor(context, source) {
    this.context = context
    this.source = source
    this.dry = context.createGain()
    this.wet = context.createGain()
    this.reverb = context.createConvolver()
    this.output = context.createGain()
    this.reverb.normalize = false
    this.reverb.buffer = createRoomImpulse(context)
    this.dry.gain.value = 1
    this.wet.gain.value = 0
    this.output.gain.value = 0
    source.connect(this.dry)
    source.connect(this.reverb)
    this.dry.connect(this.output)
    this.reverb.connect(this.wet)
    this.wet.connect(this.output)
    this.output.connect(context.destination)
  }

  update({ enabled, muted, volume, reverb }) {
    const now = this.context.currentTime
    const wet = clampLevel(reverb, 0.3)
    const level = enabled && !muted ? clampLevel(volume, 0.35) : 0
    this.wet.gain.cancelScheduledValues(now)
    this.wet.gain.setTargetAtTime(wet, now, 0.015)
    this.output.gain.cancelScheduledValues(now)
    this.output.gain.setTargetAtTime(level / (1 + wet * 0.5), now, 0.015)
  }

  disconnect() {
    this.source.disconnect(this.dry)
    this.source.disconnect(this.reverb)
    this.dry.disconnect()
    this.reverb.disconnect()
    this.wet.disconnect()
    this.output.disconnect()
  }
}

export { MicrophoneMonitor, clampLevel }
