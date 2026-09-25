import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MelodyGuideCanvas, { getAdaptiveSolfegeInterval, getSolfegeLabelNotes } from './MelodyGuideCanvas.jsx'

describe('technique feedback', () => {
  it('keeps candidate activity out of technique labels and box styling', () => {
    const baseline = renderToStaticMarkup(React.createElement(MelodyGuideCanvas))
    const candidate = renderToStaticMarkup(React.createElement(MelodyGuideCanvas, {
      activeTechniques: { vibrato: true },
      recentDetections: { kobushi: true },
      vibratoCandidateActive: true,
    }))

    expect(candidate).toBe(baseline)
    expect(candidate).not.toContain('●')
    expect(candidate).toMatch(/ビブラート[\s\S]*?>0<\/div>/)
    expect(candidate).toMatch(/こぶし[\s\S]*?>0<\/div>/)
  })

  it('keeps the dark background for all technique boxes', () => {
    const html = renderToStaticMarkup(React.createElement(MelodyGuideCanvas, {
      activeTechniques: { glissup: true, kobushi: true, glissdown: true, vibrato: true },
    }))

    const boxStyles = [...html.matchAll(/<div style="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((style) => /border:2px solid #[0-9a-f]{6}/.test(style))
    expect(boxStyles).toHaveLength(4)
    for (const color of ['#ff13f0', '#00fff0', '#ffbf00', '#2cff05']) {
      const style = boxStyles.find((value) => value.includes(`border:2px solid ${color}`))
      expect(style).toContain('background:linear-gradient(180deg')
      expect(style).not.toContain(`background:${color}`)
    }
  })
})

describe('getSolfegeLabelNotes', () => {
  it('labels consecutive notes with the same pitch only once', () => {
    const notes = [
      { t0Sec: 1, t1Sec: 1.4, midi: 64 },
      { t0Sec: 1.4, t1Sec: 1.8, midi: 64 },
      { t0Sec: 1.8, t1Sec: 2.2, midi: 65 },
    ]

    expect(getSolfegeLabelNotes(notes, 0, 3)).toEqual([notes[0], notes[2]])
  })

  it('derives different repeat intervals from each song rhythm', () => {
    const shortNoteSong = [
      { t0Sec: 0, t1Sec: 0.25, t0Beat: 0, t1Beat: 0.25, midi: 64 },
      { t0Sec: 0.75, t1Sec: 1, t0Beat: 0.75, t1Beat: 1, midi: 64 },
    ]
    const longNoteSong = [
      { t0Sec: 0, t1Sec: 1, t0Beat: 0, t1Beat: 1, midi: 64 },
      { t0Sec: 1.5, t1Sec: 2.5, t0Beat: 1.5, t1Beat: 2.5, midi: 64 },
    ]

    expect(getAdaptiveSolfegeInterval(shortNoteSong)).toEqual({ unit: 'beat', threshold: 0.25 })
    expect(getAdaptiveSolfegeInterval(longNoteSong)).toEqual({ unit: 'beat', threshold: 1 })
    expect(getSolfegeLabelNotes(shortNoteSong, 0, 3)).toEqual(shortNoteSong)
    expect(getSolfegeLabelNotes(longNoteSong, 0, 3)).toEqual([longNoteSong[0]])
  })

  it('matches the repeated C-sharp phrase in 銀の龍の背に乗って', () => {
    const notes = [
      { t0Sec: 57.585, t1Sec: 57.756, t0Beat: 78.5, t1Beat: 78.73125, midi: 73 },
      { t0Sec: 57.77, t1Sec: 58.122, t0Beat: 78.75, t1Beat: 79.225, midi: 73 },
      { t0Sec: 58.326, t1Sec: 58.497, t0Beat: 79.5, t1Beat: 79.73125, midi: 73 },
      { t0Sec: 58.511, t1Sec: 58.682, t0Beat: 79.75, t1Beat: 79.98125, midi: 73 },
      { t0Sec: 58.696, t1Sec: 59.05, t0Beat: 80, t1Beat: 80.475, midi: 72 },
    ]

    expect(getSolfegeLabelNotes(notes, 57, 60)).toEqual([notes[0], notes[4]])
  })

  it('only returns valid notes that intersect the visible window', () => {
    const visibleNote = { t0Sec: 2, t1Sec: 3, midi: 60 }
    const notes = [
      { t0Sec: 0, t1Sec: 1, midi: 60 },
      visibleNote,
      { t0Sec: 4, t1Sec: 5, midi: 62 },
      { t0Sec: 2, t1Sec: 3, midi: null },
    ]

    expect(getSolfegeLabelNotes(notes, 1.5, 3.5)).toEqual([visibleNote])
  })
})
