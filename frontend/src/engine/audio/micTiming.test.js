import { describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG } from '../audioEngine.js'
import { clampMicrophoneLatencySec, resolveMicAlignedSongTime, resolveTechniqueFrameTime } from './micTiming.js'

describe('microphone song-time alignment', () => {
  it('subtracts a 167ms calibration and existing detector timing compensation', () => {
    const aligned = resolveMicAlignedSongTime({
      pitch: { tAcSec: 99.96 },
      songTimeSec: 10,
      microphoneLatencySec: 0.167,
      audioContext: { currentTime: 100, sampleRate: 44100 },
    })
    const expected = 10 - 0.167 - 0.04 - DEFAULT_CONFIG.windowSize / (2 * 44100)
    expect(aligned).toBeCloseTo(expected, 6)
  })

  it('clamps invalid calibration values and never returns negative song time', () => {
    expect(clampMicrophoneLatencySec(-1)).toBe(0)
    expect(clampMicrophoneLatencySec(3)).toBe(1)
    expect(resolveMicAlignedSongTime({ songTimeSec: 0.1, microphoneLatencySec: 0.5 })).toBe(0)
  })
})

describe('technique frame timing', () => {
  it('advances with audio frames when several pitch callbacks share a song time', () => {
    const first = resolveTechniqueFrameTime({ songTime: 10, frameTime: 20, hasReference: true })
    const second = resolveTechniqueFrameTime({
      songTime: 10, frameTime: 20.006,
      previousClock: { songTime: 10, frameTime: 20, alignedTime: first }, hasReference: true,
    })
    expect(second).toBeCloseTo(10.006)
  })

  it('uses the audio clock for the standalone debug page and follows a song seek', () => {
    expect(resolveTechniqueFrameTime({ songTime: 0, frameTime: 30, hasReference: false })).toBe(30)
    expect(resolveTechniqueFrameTime({
      songTime: 4, frameTime: 31,
      previousClock: { songTime: 10, frameTime: 30, alignedTime: 10 }, hasReference: true,
    })).toBe(4)
  })
})
