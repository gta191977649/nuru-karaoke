import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  useCallback: (callback) => callback,
  useEffect: (effect) => effect(),
  useRef: (initialValue) => ({ current: initialValue }),
}))

import { resolvePitchSongTime, useKaraokeScoring } from './useKaraokeScoring.js'

describe('useKaraokeScoring event integration', () => {
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

  it('scores detector events directly and flushes the final note', () => {
    const note = {
      t0Sec: 0,
      t1Sec: 2,
      t0Beat: 0,
      t1Beat: 4,
      midi: 60,
      type: 'normal',
    }
    const reference = {
      notes: [note],
      getBeatAtTime: (timeSec) => timeSec * 2,
    }
    const currentTimeRef = { current: 0 }
    const transpositionRef = { current: 0 }
    const onScoreChange = vi.fn()

    const { finalizeScore } = useKaraokeScoring({
      pitchEngine,
      reference,
      currentTimeRef,
      transpositionRef,
      resetKey: 'song-1',
      onScoreChange,
    })

    expect(pitchEngine.onPitch).toHaveBeenCalledOnce()
    for (let timeSec = 0; timeSec < 2; timeSec += 0.01) {
      currentTimeRef.current = timeSec
      pitchListener({ midi: 60, rms: 0.1, confidence: 1, rawConfidence: 1 })
    }

    expect(finalizeScore(2)).toBeCloseTo(100, 6)
    expect(onScoreChange).toHaveBeenLastCalledWith(
      expect.closeTo(100, 6),
      expect.objectContaining({ ready: true, final: true }),
    )
  })

  it('maps delayed worklet messages back to the audio-frame song time', () => {
    const first = resolvePitchSongTime({
      pitch: { tAcSec: 99.96 },
      songTimeSec: 10,
      audioContext: { currentTime: 100, sampleRate: 44100 },
    })
    const second = resolvePitchSongTime({
      pitch: { tAcSec: 100.04 },
      songTimeSec: 10,
      audioContext: { currentTime: 100.08, sampleRate: 44100 },
    })
    expect(first).toBeCloseTo(second, 8)
    expect(first).toBeCloseTo(9.93678, 4)
  })

  it('subtracts a measured microphone latency from scoring time', () => {
    const aligned = resolvePitchSongTime({
      pitch: {},
      songTimeSec: 10,
      microphoneLatencySec: 0.167,
    })
    expect(aligned).toBeCloseTo(9.833, 6)
  })

  it('publishes score and hit visuals only after the complete note decision delay', () => {
    const note = {
      t0Sec: 0,
      t1Sec: 1,
      t0Beat: 0,
      t1Beat: 2,
      midi: 60,
      type: 'normal',
    }
    const reference = {
      notes: [note],
      getBeatAtTime: (timeSec) => timeSec * 2,
    }
    const currentTimeRef = { current: 0 }
    const onScoreChange = vi.fn()

    const { scoringVisualRef } = useKaraokeScoring({
      pitchEngine,
      reference,
      currentTimeRef,
      transpositionRef: { current: 0 },
      resetKey: 'song-delayed-note',
      onScoreChange,
    })

    for (let timeSec = 0; timeSec <= 1.15; timeSec += 0.01) {
      currentTimeRef.current = timeSec
      pitchListener({
        midi: timeSec < 1 ? 60 : null,
        rms: timeSec < 1 ? 0.1 : 0,
        confidence: timeSec < 1 ? 1 : 0,
        rawConfidence: timeSec < 1 ? 1 : 0,
      })
    }

    expect(onScoreChange).toHaveBeenCalledTimes(1)
    expect(onScoreChange).toHaveBeenLastCalledWith(
      0,
      expect.objectContaining({ cumulative: true }),
    )
    expect(scoringVisualRef.current.confirmedSegments).toEqual([])

    currentTimeRef.current = 1.17
    pitchListener({ midi: null, rms: 0, confidence: 0, rawConfidence: 0 })

    expect(onScoreChange).toHaveBeenLastCalledWith(
      expect.closeTo(100, 6),
      expect.objectContaining({ cumulative: true, finalizedNotes: 1 }),
    )
    expect(scoringVisualRef.current.confirmedSegments).toHaveLength(1)
    expect(scoringVisualRef.current.confirmedSegments[0]).toMatchObject({
      t0Sec: 0,
      t1Sec: 1,
      confirmedAtSec: 1.17,
    })
  })

  it('publishes a whole-song cumulative score that never falls', () => {
    const notes = Array.from({ length: 4 }, (_, index) => ({
      t0Sec: index,
      t1Sec: index + 1,
      t0Beat: index * 2,
      t1Beat: (index + 1) * 2,
      midi: 60,
      type: 'normal',
    }))
    const reference = {
      notes,
      getBeatAtTime: (timeSec) => timeSec * 2,
    }
    const currentTimeRef = { current: 0 }
    const onScoreChange = vi.fn()

    useKaraokeScoring({
      pitchEngine,
      reference,
      currentTimeRef,
      transpositionRef: { current: 0 },
      resetKey: 'song-cumulative',
      onScoreChange,
    })

    for (let timeSec = 0; timeSec <= 2.2; timeSec += 0.02) {
      currentTimeRef.current = timeSec
      pitchListener({
        midi: timeSec < 1 ? 60 : 63,
        rms: 0.1,
        confidence: 1,
        rawConfidence: 1,
      })
    }

    const updates = onScoreChange.mock.calls.map(([score, info]) => ({ score, info }))
    const scores = updates.map(({ score }) => score)
    expect(updates[0]).toEqual({
      score: 0,
      info: expect.objectContaining({ ready: true, cumulative: true }),
    })
    expect(scores.some((score) => score > 20 && score <= 25)).toBe(true)
    expect(scores.every((score, index) => index === 0 || score >= scores[index - 1])).toBe(true)
    expect(updates.at(-1).info).toEqual(expect.objectContaining({ cumulative: true }))
  })

  it('explicitly resets the cumulative display after seeking backward', () => {
    const reference = {
      notes: [
        { t0Sec: 0, t1Sec: 1, t0Beat: 0, t1Beat: 2, midi: 60, type: 'normal' },
        { t0Sec: 1, t1Sec: 2, t0Beat: 2, t1Beat: 4, midi: 60, type: 'normal' },
      ],
      getBeatAtTime: (timeSec) => timeSec * 2,
    }
    const currentTimeRef = { current: 0 }
    const onScoreChange = vi.fn()

    useKaraokeScoring({
      pitchEngine,
      reference,
      currentTimeRef,
      transpositionRef: { current: 0 },
      resetKey: 'song-rewind',
      onScoreChange,
    })

    for (let timeSec = 0; timeSec <= 1.2; timeSec += 0.02) {
      currentTimeRef.current = timeSec
      pitchListener({ midi: 60, rms: 0.1, confidence: 1, rawConfidence: 1 })
    }
    expect(onScoreChange.mock.calls.some(([score]) => score > 0)).toBe(true)

    currentTimeRef.current = 0.2
    pitchListener({ midi: 60, rms: 0.1, confidence: 1, rawConfidence: 1 })

    expect(onScoreChange).toHaveBeenLastCalledWith(
      0,
      expect.objectContaining({ ready: true, cumulative: true, reset: true }),
    )
  })
})
