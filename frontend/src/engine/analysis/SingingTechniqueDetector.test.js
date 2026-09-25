import { describe, expect, it } from 'vitest'
import './plugins/VibratoPlugin.js'
import './plugins/KobushiPlugin.js'
import './plugins/GlissandoPlugin.js'
import { measureVibrato } from './plugins/VibratoPlugin.js'
import { KobushiPlugin } from './plugins/KobushiPlugin.js'
import { SingingTechniqueDetector } from './SingingTechniqueDetector.js'
import { resolveTechniqueFrameTime } from '../audio/micTiming.js'

const sine = (rate, extent, duration = 1.4, offset = 0) =>
  Array.from({ length: Math.round(duration * 100) + 1 }, (_, i) => {
    const t = offset + i / 100
    return { t, v: 6000 + extent * Math.sin(2 * Math.PI * rate * (t - offset)) }
  })

function run(points, noteAt = () => 'one', boundsAt = () => null) {
  const detector = new SingingTechniqueDetector()
  const events = []
  for (const point of points) {
    const bounds = boundsAt(point.t)
    const next = detector.push({
      time: point.t,
      rawMidi: Number.isFinite(point.v) ? point.v / 100 : null,
      confidence: Number.isFinite(point.v) ? 1 : 0,
      rms: Number.isFinite(point.v) ? 0.1 : 0,
      noteId: noteAt(point.t),
      noteStartSec: bounds?.startSec,
      noteEndSec: bounds?.endSec,
    })
    events.push(...Object.values(next))
  }
  events.push(...Object.values(detector.flush()))
  return events
}

describe('Vibrato detection', () => {
  it.each([3, 5, 8])('recognizes a regular %s Hz contour', rate => {
    const measurement = measureVibrato(sine(rate, 45, 0.9))
    expect(Math.abs(measurement?.rateHz - rate)).toBeLessThan(0.5)
    expect(measurement?.extentCents).toBeGreaterThan(15)
    expect(run(sine(rate, 45)).filter(event => event.type === 'vibrato')).toHaveLength(1)
  })

  it('recognizes a moderate 5 Hz vibrato on a subsecond note', () => {
    const events = run(sine(5, 20, 0.65))
    expect(events.some(event => event.type === 'vibrato')).toBe(true)
  })

  it('emits one candidate as soon as five regular turns are available', () => {
    const detector = new SingingTechniqueDetector()
    const points = sine(5, 30, 1.2)
    const detections = []
    for (const point of points) {
      const result = detector.push({
        time: point.t, rawMidi: point.v / 100,
        confidence: 1, rms: 0.1, noteId: 'one',
      })
      if (result.vibrato) detections.push({ receivedAt: point.t, event: result.vibrato })
    }
    expect(detections).toHaveLength(1)
    expect(detections[0].receivedAt).toBeLessThan(0.65)
    expect(detections[0].event.centerMidi).toBeCloseTo(60, 1)
    expect(detector.flush()).toEqual({})
  })

  it('allows a later distinct segment on the same note to be validated', () => {
    const points = [
      ...sine(5, 30, 0.65, 0),
      { t: 0.75, v: NaN },
      ...sine(5, 30, 0.65, 0.85),
    ]
    const events = run(points).filter(event => event.type === 'vibrato')
    expect(events).toHaveLength(2)
    expect(events[0].end).toBeLessThan(events[1].start)
  })

  it('detects vibrato at microphone frame cadence despite repeated page song times', () => {
    const detector = new SingingTechniqueDetector()
    let previousClock = null
    let activeFrames = 0
    const events = []
    for (const point of sine(5, 35, 0.85)) {
      const frameTime = 20 + point.t
      const songTime = Math.floor(point.t * 60) / 60
      const alignedTime = resolveTechniqueFrameTime({
        songTime, frameTime, previousClock, hasReference: true,
      })
      previousClock = { songTime, frameTime, alignedTime }
      events.push(...Object.values(detector.push({
        time: alignedTime, rawMidi: point.v / 100,
        confidence: 1, rms: 0.1, noteId: 'long-note',
      })))
      if (detector.activeTechniques.vibrato) activeFrames++
    }
    events.push(...Object.values(detector.flush()))
    expect(activeFrames).toBeGreaterThan(0)
    expect(events.some(event => event.type === 'vibrato')).toBe(true)
    expect(events.some(event => ['kobushi', 'glissup', 'glissdown'].includes(event.type))).toBe(false)
  })

  it('tolerates frame-level pitch jitter on a moderate vibrato', () => {
    const points = sine(5, 30, 0.8).map((point, i) => ({
      ...point,
      v: point.v + 8 * Math.sin(i * 2.731),
    }))
    expect(run(points).some(event => event.type === 'vibrato')).toBe(true)
  })

  it('rejects tiny, flat, sliding, and random contours', () => {
    const irregularTurns = Array.from({ length: 15 }, (_, i) => ({
      t: Math.floor(i / 2) * 0.2 + (i % 2 ? 0.04 : 0),
      v: 6000 + (i % 2 ? 40 : -40),
    }))
    const irregular = Array.from({ length: 141 }, (_, i) => {
      const t = i / 100
      const right = irregularTurns.findIndex(turn => turn.t >= t)
      if (right <= 0) return { t, v: irregularTurns[0].v }
      const leftTurn = irregularTurns[right - 1]
      const rightTurn = irregularTurns[right]
      const fraction = (t - leftTurn.t) / (rightTurn.t - leftTurn.t)
      return { t, v: leftTurn.v + fraction * (rightTurn.v - leftTurn.v) }
    })
    const cases = [
      sine(5, 7),
      sine(5, 0),
      irregular,
      Array.from({ length: 141 }, (_, i) => ({ t: i / 100, v: 6000 + 250 * i / 140 })),
      Array.from({ length: 141 }, (_, i) => ({
        t: i / 100,
        v: 6000 + 50 * Math.sin(i * i * 2.137),
      })),
    ]
    for (const points of cases) {
      expect(run(points).some(event => event.type === 'vibrato')).toBe(false)
    }
  })

  it('breaks on silence, low confidence, time reversal, and note changes', () => {
    const detector = new SingingTechniqueDetector()
    const events = []
    for (const point of sine(5, 50, 1.1)) {
      events.push(...Object.values(detector.push({
        time: point.t, rawMidi: point.v / 100, confidence: 1, rms: 0.1, noteId: 'one',
      })))
    }
    events.push(...Object.values(detector.push({
      time: 1.11, rawMidi: null, confidence: 0, rms: 0, noteId: 'one',
    })))
    events.push(...Object.values(detector.push({
      time: 1.2, rawMidi: null, confidence: 0, rms: 0, noteId: 'one',
    })))
    expect(events.filter(event => event.type === 'vibrato')).toHaveLength(1)
    expect(detector.push({ time: 0.5, rawMidi: 60, confidence: 1, rms: 0.1, noteId: 'one' })).toEqual({})
    expect(detector.push({ time: 0.51, rawMidi: 60, confidence: 1, rms: 0.1, noteId: 'two' })).toEqual({})
    const lowQuality = new SingingTechniqueDetector()
    for (const point of sine(5, 50, 0.45)) {
      lowQuality.push({ time: point.t, rawMidi: point.v / 100, confidence: 1, rms: 0.1 })
    }
    lowQuality.push({ time: 0.46, rawMidi: 60, confidence: 0, rms: 0.1 })
    expect(lowQuality.flush()).toEqual({})
    expect(run(sine(5, 50).map((point, index) =>
      index === 60 ? { ...point, v: NaN } : point,
    )).some(event => event.type === 'vibrato')).toBe(true)
    expect(run(sine(5, 50, 0.45).concat(sine(5, 50, 0.45, 0.65)))
      .some(event => event.type === 'vibrato')).toBe(false)
  })

  it('keeps a large regular vibrato separate from kobushi and glissando', () => {
    const types = run(sine(5, 120)).map(event => event.type)
    expect(types).toContain('vibrato')
    expect(types).not.toContain('kobushi')
    expect(types).not.toContain('glissup')
    expect(types).not.toContain('glissdown')
  })

  it('suppresses delayed kobushi and slide events that overlap a later vibrato segment', () => {
    const detector = new SingingTechniqueDetector()
    detector.plugins = [
      {
        id: 'vibrato', isActive: false, segment: null, reset() {},
        analyze(time) {
          if (time === 0.3) {
            this.segment = { start: 0.05, end: 0.3 }
            this.isActive = true
          }
          return null
        },
        flush() { this.isActive = false; return { type: 'vibrato', start: 0.05, end: 0.5, t: 0.275 } },
      },
      { id: 'kobushi', reset() {}, analyze(time) { return time === 0.1 ? { type: 'kobushi', t: 0.1 } : null } },
      { id: 'glissando', reset() {}, analyze(time) { return time === 0.1 ? { type: 'glissup', t: 0.1 } : null } },
    ]
    const push = time => detector.push({ time, rawMidi: 60, confidence: 1, rms: 0.1 })
    expect(push(0.1)).toEqual({})
    expect(detector.activeTechniques.kobushi).toBe(false)
    expect(detector.activeTechniques.glissup).toBe(false)
    expect(push(0.3)).toEqual({})
    expect(detector.activeTechniques.vibrato).toBe(true)
    expect(detector.flush()).toMatchObject({ vibrato: { type: 'vibrato' } })
  })

  it('releases an isolated kobushi after the vibrato exclusion window', () => {
    const detector = new SingingTechniqueDetector()
    detector.plugins = [{
      id: 'kobushi', reset() {},
      analyze(time) { return time === 0.1 ? { type: 'kobushi', t: 0.1 } : null },
    }]
    const push = time => detector.push({ time, rawMidi: 60, confidence: 1, rms: 0.1 })
    expect(push(0.1)).toEqual({})
    expect(push(0.7)).toEqual({})
    expect(push(1.1)).toMatchObject({ kobushi: { type: 'kobushi', t: 0.1 } })
  })

  it('flushes one event at the note boundary with source timestamps', () => {
    const points = sine(5, 50, 1.1).concat(sine(5, 50, 1.1, 1.11))
    const events = run(points, time => time < 1.11 ? 'one' : 'two')
      .filter(event => event.type === 'vibrato')
    expect(events).toHaveLength(2)
    expect(events[0].end).toBeLessThan(1.11)
    expect(events[1].start).toBeGreaterThanOrEqual(1.11)
    expect(events[0].t).toBeCloseTo((events[0].start + events[0].end) / 2)
  })

  it('keeps a sustained note-edge slide distinct from vibrato', () => {
    const points = Array.from({ length: 101 }, (_, i) => {
      const t = i / 100
      return { t, v: 6000 + 250 * Math.min(1, t / 0.24) }
    })
    const types = run(points, () => 'one', () => ({ startSec: 0, endSec: 1 })).map(event => event.type)
    expect(types).toContain('glissup')
    expect(types).not.toContain('vibrato')
  })

  it('rejects ordinary note jumps and mid-note pitch corrections as slides', () => {
    const contours = [
      Array.from({ length: 101 }, (_, i) => ({ t: i / 100, v: i < 50 ? 6000 : 6250 })),
      Array.from({ length: 101 }, (_, i) => {
        const t = i / 100
        return { t, v: 6000 + 250 * Math.max(0, Math.min(1, (t - 0.4) / 0.25)) }
      }),
    ]
    for (const points of contours) {
      const types = run(points, () => 'one', () => ({ startSec: 0, endSec: 1 }))
        .map(event => event.type)
      expect(types).not.toContain('glissup')
      expect(types).not.toContain('glissdown')
    }
  })

  it('detects a sustained fall at the end of a note', () => {
    const points = Array.from({ length: 101 }, (_, i) => {
      const t = i / 100
      return { t, v: 6000 - 250 * Math.max(0, Math.min(1, (t - 0.72) / 0.28)) }
    })
    expect(run(points, () => 'one', () => ({ startSec: 0, endSec: 1 }))
      .some(event => event.type === 'glissdown')).toBe(true)
  })

  it('requires one prominent, returning kobushi peak and applies a real-time cooldown', () => {
    const contour = Array.from({ length: 151 }, (_, i) => {
      const t = i / 100
      let v = 6000
      if (t >= 0.15 && t < 0.22) v -= 40 * (t - 0.15) / 0.07
      else if (t >= 0.22 && t < 0.3) v = 5960 + 220 * (t - 0.22) / 0.08
      else if (t >= 0.3 && t < 0.38) v = 6180 - 220 * (t - 0.3) / 0.08
      else if (t >= 0.38 && t < 0.45) v = 5960 + 40 * (t - 0.38) / 0.07
      return { t, v }
    })
    const plugin = new KobushiPlugin()
    const history = []
    const events = []
    for (const point of contour) {
      history.push(point)
      const event = plugin.analyze(point.t, point.v, history, {})
      if (event) events.push(event)
    }
    expect(events).toHaveLength(1)
    expect(events[0].height).toBeGreaterThan(150)
    expect(run(sine(5, 50, 1.2)).some(event => event.type === 'kobushi')).toBe(false)
  })
})
