import { describe, expect, it } from 'vitest'

import {
  MicrophoneCalibrationError,
  analyzeLatencyRecording,
  findSignalDelay,
  median,
} from './latencyCalibration.js'

const SAMPLE_RATE = 12000

function createTemplate(length = 720) {
  const output = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const envelope = Math.sin((Math.PI * index) / (length - 1)) ** 2
    const phase = 2 * Math.PI * (650 * index / SAMPLE_RATE + 850 * (index / SAMPLE_RATE) ** 2)
    output[index] = Math.sin(phase) * envelope * 0.7
  }
  return output
}

function createRecording({ scheduledTimes, latencies, noise = 0.002, echo = false }) {
  const template = createTemplate()
  const duration = scheduledTimes.at(-1) + 1.5
  const recording = new Float32Array(Math.ceil(duration * SAMPLE_RATE))
  for (let index = 0; index < recording.length; index += 1) {
    recording[index] = Math.sin(index * 12.9898) * noise
  }
  scheduledTimes.forEach((scheduledTime, attempt) => {
    const offset = Math.round((scheduledTime + latencies[attempt]) * SAMPLE_RATE)
    for (let index = 0; index < template.length; index += 1) {
      recording[offset + index] += template[index] * 0.55
      if (echo && offset + index + 360 < recording.length) {
        recording[offset + index + 360] += template[index] * 0.16
      }
    }
  })
  return { recording, template }
}

describe('microphone latency correlation', () => {
  it('finds a known delay through noise and an acoustic echo', () => {
    const scheduledTimes = [0.4]
    const { recording, template } = createRecording({
      scheduledTimes,
      latencies: [0.167],
      noise: 0.008,
      echo: true,
    })
    const match = findSignalDelay({
      recording,
      template,
      sampleRate: SAMPLE_RATE,
      scheduledOffsetSec: scheduledTimes[0],
    })
    expect(match.latencySec).toBeCloseTo(0.167, 3)
    expect(match.correlation).toBeGreaterThan(0.9)
  })

  it('uses the median and rejects one delayed outlier', () => {
    const scheduledTimes = [0.3, 1.55, 2.8, 4.05, 5.3]
    const { recording, template } = createRecording({
      scheduledTimes,
      latencies: [0.166, 0.167, 0.42, 0.168, 0.167],
    })
    const result = analyzeLatencyRecording({
      chunks: [{ tAcSec: 20, samples: recording }],
      template,
      sampleRate: SAMPLE_RATE,
      scheduledTimesSec: scheduledTimes.map((time) => time + 20),
    })
    expect(result.latencyMs).toBe(167)
    expect(result.sampleCount).toBe(4)
    expect(result.spreadMs).toBeLessThanOrEqual(2)
  })

  it('fails without an audible input signal', () => {
    expect(() => analyzeLatencyRecording({
      chunks: [{ tAcSec: 0, samples: new Float32Array(SAMPLE_RATE * 2) }],
      template: createTemplate(),
      sampleRate: SAMPLE_RATE,
      scheduledTimesSec: [0.3, 1, 1.7],
    })).toThrowError(MicrophoneCalibrationError)
  })

  it('calculates medians for odd and even sample sets', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })
})
