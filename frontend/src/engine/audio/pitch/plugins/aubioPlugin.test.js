import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../../../audioEngine.js'
import { AubioPlugin } from './aubioPlugin.js'

const SAMPLE_RATE = 44100
const WINDOW_SIZE = 2048
const HOP_SIZE = 256

function sineFrame(frequency, frameIndex) {
  const samples = new Float32Array(WINDOW_SIZE)
  const startSample = frameIndex * HOP_SIZE
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = 0.5 * Math.sin(
      2 * Math.PI * frequency * (startSample + index) / SAMPLE_RATE,
    )
  }
  return samples
}

async function createReadyPlugin() {
  const plugin = new AubioPlugin()
  plugin.configure({ aubioTolerance: DEFAULT_CONFIG.aubioTolerance })
  plugin.detect({
    samples: sineFrame(440, 0),
    sampleRate: SAMPLE_RATE,
    rms: 0.35,
  })
  await plugin._aubioPromise
  await Promise.resolve()
  return plugin
}

function settleOnFrequency(plugin, frequency, frames = 40) {
  let result = null
  for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
    result = plugin.detect({
      samples: sineFrame(frequency, frameIndex),
      sampleRate: SAMPLE_RATE,
      rms: 0.35,
    })
  }
  return result
}

describe('AubioPlugin gameplay defaults', () => {
  it('uses the allkaraoke frame, hop, tolerance, and no-smoothing defaults', () => {
    expect(DEFAULT_CONFIG).toMatchObject({
      pitchAlgoId: 'aubio',
      windowSize: WINDOW_SIZE,
      hopSize: HOP_SIZE,
      aubioTolerance: 0.5,
      enableDoubleExponentialSmoothing: false,
      enableTemporalSmooth: false,
      enablePitchSnap: false,
      holdFrames: 0,
      breakToleranceMs: 0,
    })
  })

  it.each([110, 220, 440])('detects a sustained %iHz sine wave', async (frequency) => {
    const plugin = await createReadyPlugin()
    const result = settleOnFrequency(plugin, frequency)

    expect(result.f0Hz).toBeGreaterThan(0)
    expect(Math.abs(result.f0Hz - frequency) / frequency).toBeLessThan(0.08)
  })

  it('returns to the new octave without an application-level smoothing tail', async () => {
    const plugin = await createReadyPlugin()
    settleOnFrequency(plugin, 220)
    const result = settleOnFrequency(plugin, 440, 12)

    expect(Math.abs(result.f0Hz - 440) / 440).toBeLessThan(0.08)
  })

  it('reports no voiced frequency for silence', async () => {
    const plugin = await createReadyPlugin()
    let result = null
    const silence = new Float32Array(WINDOW_SIZE)
    for (let index = 0; index < 40; index += 1) {
      result = plugin.detect({
        samples: silence,
        sampleRate: SAMPLE_RATE,
        rms: 0,
      })
    }

    expect(result.f0Hz || 0).toBe(0)
  })
})
