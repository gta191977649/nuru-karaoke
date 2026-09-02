import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  useEffect: (effect) => effect(),
  useRef: (initialValue) => ({ current: initialValue }),
}))

import { useKaraokePitchHistory } from './useKaraokePitchHistory.js'

describe('useKaraokePitchHistory pitch-class display', () => {
  let pitchListener
  let pitchEngine

  beforeEach(() => {
    pitchListener = null
    pitchEngine = {
      onPitch: vi.fn((listener) => {
        pitchListener = listener
        return () => { pitchListener = null }
      }),
    }
  })

  it('folds raw F0 beside the target and breaks the trail outside reference notes', () => {
    const currentTimeRef = { current: 0.5 }
    const reference = {
      timeDivision: 480,
      notes: [{ t0Tick: 0, t1Tick: 480, midi: 60 }],
      getTickAtTime: (timeSec) => timeSec * 480,
    }
    const { pitchHistoryRef } = useKaraokePitchHistory({
      pitchEngine,
      reference,
      currentTimeRef,
      transpositionRef: { current: 0 },
      rmsGate: 0.01,
    })

    pitchListener({ rawMidi: 48, rawF0Hz: 130.81, rms: 0.1, confidence: 1 })
    expect(pitchHistoryRef.current[0]).toMatchObject({
      userMidi: 60,
      rawMidi: 48,
      octaveFoldSemitones: -12,
      targetMidi: 60,
    })

    currentTimeRef.current = 1.5
    pitchListener({ rawMidi: 48, rawF0Hz: 130.81, rms: 0.1, confidence: 1 })
    expect(pitchHistoryRef.current[1]).toMatchObject({
      userMidi: null,
      rawMidi: 48,
      targetMidi: null,
    })
  })

  it('uses microphone-aligned time for the pitch trail and target lookup', () => {
    const currentTimeRef = { current: 1 }
    const reference = {
      notes: [{ t0Tick: 0, t1Tick: 480, midi: 60 }],
      getTickAtTime: (timeSec) => timeSec * 480,
    }
    const { pitchHistoryRef } = useKaraokePitchHistory({
      pitchEngine,
      reference,
      currentTimeRef,
      transpositionRef: { current: 0 },
      microphoneLatencySec: 0.167,
    })

    pitchListener({ rawMidi: 60, rawF0Hz: 261.63, rms: 0.1 })
    expect(pitchHistoryRef.current[0].t).toBeCloseTo(0.833, 6)
    expect(pitchHistoryRef.current[0].targetMidi).toBe(60)
  })
})
