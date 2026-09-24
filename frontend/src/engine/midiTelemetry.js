export function buildTelemetry(midi) {
  const activity = Array.from({ length: 16 }, () => ({ times: [], velocities: [] }))
  const activeNotes = Array.from({ length: 16 }, () => new Uint16Array(128))
  const patchState = Array.from({ length: 16 }, () => ({ program: 0, bankMSB: 0, bankLSB: 0 }))
  const polyphonyTimes = []
  const polyphonyCounts = []
  const patchChanges = []
  let polyphony = 0

  for (const entry of midi.timeline) {
    const event = midi.tracks[entry.tr].events[entry.ev]
    const status = Number(event.statusByte)
    if (status < 0x80 || status >= 0xf0) continue
    const type = status & 0xf0
    const channel = status & 0x0f
    const time = midi.midiTicksToSeconds(event.ticks)
    if (type === 0x90 && event.data[1] > 0) {
      activity[channel].times.push(time)
      activity[channel].velocities.push(event.data[1])
      activeNotes[channel][event.data[0]] += 1
      polyphony += 1
      polyphonyTimes.push(time)
      polyphonyCounts.push(polyphony)
    } else if (type === 0x80 || (type === 0x90 && event.data[1] === 0)) {
      const note = event.data[0]
      if (activeNotes[channel][note] > 0) {
        activeNotes[channel][note] -= 1
        polyphony = Math.max(0, polyphony - 1)
        polyphonyTimes.push(time)
        polyphonyCounts.push(polyphony)
      }
    } else if (type === 0xb0 && (event.data[0] === 0 || event.data[0] === 32)) {
      const patch = patchState[channel]
      if (event.data[0] === 0) patch.bankMSB = event.data[1]
      else patch.bankLSB = event.data[1]
      patchChanges.push({ time, channel, ...patch })
    } else if (type === 0xc0) {
      const patch = patchState[channel]
      patch.program = event.data[0]
      patchChanges.push({ time, channel, ...patch })
    }
  }

  return {
    activity: activity.map((channel) => ({
      times: Float32Array.from(channel.times),
      velocities: Uint8Array.from(channel.velocities),
    })),
    polyphonyTimes: Float32Array.from(polyphonyTimes),
    polyphonyCounts: Uint16Array.from(polyphonyCounts),
    patchChanges,
  }
}
