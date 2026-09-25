import { describe, expect, it, vi } from 'vitest'
import { MicrophoneMonitor } from './microphoneMonitor.js'

const node = () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  gain: {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  },
})

describe('microphone monitor', () => {
  it('branches directly from the microphone and changes levels without rebuilding the graph', () => {
    const source = node()
    const context = {
      sampleRate: 1000,
      currentTime: 2,
      destination: node(),
      createGain: vi.fn(node),
      createConvolver: vi.fn(node),
      createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(1350) })),
    }
    const monitor = new MicrophoneMonitor(context, source)
    expect(source.connect).toHaveBeenCalledWith(monitor.dry)
    expect(source.connect).toHaveBeenCalledWith(monitor.reverb)
    expect(monitor.output.connect).toHaveBeenCalledWith(context.destination)

    monitor.update({ enabled: true, muted: false, volume: 0.5, reverb: 0.4 })
    expect(monitor.wet.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.4, 2, 0.015)
    expect(monitor.output.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.5 / 1.2, 2, 0.015)
    monitor.update({ enabled: true, muted: true, volume: 0.5, reverb: 0.4 })
    expect(monitor.output.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 2, 0.015)
    expect(context.createGain).toHaveBeenCalledTimes(3)

    monitor.disconnect()
    expect(source.disconnect).toHaveBeenCalledWith(monitor.dry)
    expect(source.disconnect).toHaveBeenCalledWith(monitor.reverb)
  })
})
