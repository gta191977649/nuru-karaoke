import { convertXgMidiBuffer } from './XGOver55Engine.js'

self.onmessage = ({ data }) => {
  const { id, buffer, options } = data
  try {
    const result = convertXgMidiBuffer(buffer, options)
    const transfers = [result.buffer]
    for (const channel of result.telemetry?.activity || []) {
      transfers.push(channel.times.buffer, channel.velocities.buffer)
    }
    if (result.telemetry?.polyphonyTimes) transfers.push(result.telemetry.polyphonyTimes.buffer)
    if (result.telemetry?.polyphonyCounts) transfers.push(result.telemetry.polyphonyCounts.buffer)
    if (result.drumChannels) transfers.push(result.drumChannels.buffer)
    self.postMessage({ id, result }, transfers)
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) })
  }
}
