import { describe, expect, it } from 'vitest'
import { coverSize, getSingingLayout } from './singingLayout.js'
import { createScoreAnimation } from './singingScoreAnimation.js'

describe('singing scene layout against the original CSS', () => {
  it.each([
    [1280, 720, 521, 341, 64],
    [1920, 1080, 697, 517, 64],
    [800, 600, 380.3, 212.3, 56],
    [640, 480, 336.3, 168.3, 46.4],
  ])('matches the measured HTML geometry at %sx%s', (w, h, top, guideHeight, font) => {
    const result = getSingingLayout(w, h, w, h)
    expect(result.topHeight).toBeCloseTo(top, 1)
    expect(result.melody.height).toBeCloseTo(guideHeight, 1)
    expect(result.lyricFontSize).toBeCloseTo(font)
  })

  it('uses viewport breakpoints for a parked panel and flex proportions for tall panels', () => {
    const parked = getSingingLayout(400, 240, 1920, 1080)
    expect(parked.side).toBe(50)
    expect(parked.lyricFontSize).toBe(64)
    expect(getSingingLayout(800, 1200, 800, 1200).topHeight).toBeCloseTo(716.8)
  })

  it('covers without stretching a video at either aspect ratio', () => {
    expect(coverSize(960, 540, 1280, 720)).toEqual({ width: 1280, height: 720 })
    expect(coverSize(960, 540, 800, 600)).toEqual({ width: 1066.6666666666667, height: 600 })
  })
})

describe('WebGL score cube timing', () => {
  const state = (score, key) => ({ liveScore: score, scoreUpdateKey: key, liveScoreReady: true })

  it('collects scores during calculation, then holds the result while queuing later notes', () => {
    const animation = createScoreAnimation()
    expect(animation.update(state(10, 1), 0).score).toBe(0)
    expect(animation.update(state(18, 2), 1000).rotation).toBeCloseTo(Math.PI / 2)
    expect(animation.update(state(25, 3), 2999).score).toBe(0)
    expect(animation.update(state(25, 3), 3000).score).toBe(25)
    expect(animation.update(state(35, 4), 4500).score).toBe(25)
    expect(animation.update(state(35, 4), 6999).score).toBe(25)
    expect(animation.update(state(35, 4), 7000).rotation).toBeCloseTo(Math.PI)
    animation.update(state(35, 4), 7001)
    expect(animation.update(state(40, 5), 10001).score).toBe(40)
  })

  it('ignores unready updates and never rotates for decreases', () => {
    const animation = createScoreAnimation()
    expect(animation.update({ ...state(50, 1), liveScoreReady: false }, 0).score).toBe(0)
    animation.update(state(50, 1), 1)
    animation.update(state(50, 1), 3001)
    animation.update(state(50, 1), 7001)
    expect(animation.update(state(20, 2), 8000)).toMatchObject({ score: 50, rotation: Math.PI })
  })
})
