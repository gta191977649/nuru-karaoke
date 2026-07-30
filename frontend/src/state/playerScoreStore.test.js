import { beforeEach, describe, expect, it } from 'vitest'
import { getPlayerScoreState } from './playerScoreStore.js'

beforeEach(() => {
  getPlayerScoreState().resetPlayerScore()
})

describe('player score sessions', () => {
  it('keeps the score when the same playback session is mounted again', () => {
    expect(getPlayerScoreState().beginPlayerScoreSession(1)).toBe(true)
    getPlayerScoreState().setLiveScore(72, true)
    getPlayerScoreState().setTechniqueCounts({ vibrato: 3 })

    expect(getPlayerScoreState().beginPlayerScoreSession(1)).toBe(false)
    expect(getPlayerScoreState()).toMatchObject({
      scoreSessionId: 1,
      liveScore: 72,
      techniqueCounts: { vibrato: 3 },
    })
  })

  it('resets the score when a new song or retry starts a new session', () => {
    getPlayerScoreState().beginPlayerScoreSession(1)
    getPlayerScoreState().setLiveScore(72, true)
    getPlayerScoreState().setResults({ score: 88, techniques: { kobushi: 2 } })

    expect(getPlayerScoreState().beginPlayerScoreSession(2)).toBe(true)
    expect(getPlayerScoreState()).toMatchObject({
      scoreSessionId: 2,
      liveScore: 0,
      liveScoreReady: false,
      finalScore: 0,
      hasResults: false,
      techniqueCounts: {
        glissup: 0,
        kobushi: 0,
        glissdown: 0,
        vibrato: 0,
      },
    })
  })
})
