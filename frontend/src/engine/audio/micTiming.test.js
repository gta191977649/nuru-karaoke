import { describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG } from '../audioEngine.js'
import { clampMicrophoneLatencySec, resolveMicAlignedSongTime } from './micTiming.js'

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
