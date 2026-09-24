import { convertSc88MidiBuffer } from './SC88Over55Engine.js'

self.onmessage = ({ data }) => {
  const { id, buffer, options } = data
  try {
    const result = convertSc88MidiBuffer(buffer, options)
    const transfers = [result.buffer]
    for (const channel of result.telemetry?.activity || []) transfers.push(channel.times.buffer, channel.velocities.buffer)
    for (const part of result.telemetry?.partActivity || []) transfers.push(part.times.buffer, part.velocities.buffer)
    if (result.telemetry?.polyphonyTimes) transfers.push(result.telemetry.polyphonyTimes.buffer)
    if (result.telemetry?.polyphonyCounts) transfers.push(result.telemetry.polyphonyCounts.buffer)
    if (result.drumParts) transfers.push(result.drumParts.buffer)
    self.postMessage({ id, result }, transfers)
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) })
  }
}
