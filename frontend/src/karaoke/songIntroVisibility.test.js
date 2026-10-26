import { describe, expect, it } from 'vitest'

import { hasVisibleMelodyGuideNote, shouldShowSongIntro } from './songIntroVisibility.js'

describe('transport-synchronized song intro', () => {
  const notes = [{ t0Sec: 10, t1Sec: 11 }, { t0Sec: 40, t1Sec: 41 }]
  it('restores the title on repeated replays and seeking back into the intro', () => {
    const times = [0, 7, 7.6, 20, 0, 8, 2, 40, 0]
    expect(times.map((time) => shouldShowSongIntro(notes, time, 8, 0.7)))
      .toEqual([true, true, false, false, true, false, true, false, true])
  })
  it('does not show the title during interludes or after the song finishes', () => {
    expect(shouldShowSongIntro(notes, 25, 8, 0.7)).toBe(false)
    expect(shouldShowSongIntro(notes, 100, 8, 0.7)).toBe(false)
  })
  it('handles loading, missing melody and unsorted note data', () => {
    expect(shouldShowSongIntro(undefined, 0, 8, 0.7)).toBe(true)
    expect(shouldShowSongIntro(undefined, 20, 8, 0.7)).toBe(false)
    expect(shouldShowSongIntro([], 20, 8, 0.7)).toBe(true)
    expect(shouldShowSongIntro([...notes].reverse(), 20, 8, 0.7)).toBe(false)
  })
})

describe('hasVisibleMelodyGuideNote', () => {
  const notes = [{ t0Sec: 10, t1Sec: 11 }]

  it('keeps the title visible before the first note enters the guide', () => {
    expect(hasVisibleMelodyGuideNote(notes, 7.59, 8, 0.7)).toBe(false)
  })

  it('starts the fade when the first note reaches the right edge', () => {
    expect(hasVisibleMelodyGuideNote(notes, 7.6, 8, 0.7)).toBe(true)
  })

  it('detects a note that is already crossing the playhead window', () => {
    expect(hasVisibleMelodyGuideNote(notes, 10.5, 8, 0.7)).toBe(true)
  })

  it('ignores missing or malformed notes', () => {
    expect(hasVisibleMelodyGuideNote([], 1, 8, 0.7)).toBe(false)
    expect(hasVisibleMelodyGuideNote([{ t0Sec: 'bad', t1Sec: 2 }], 1, 8, 0.7)).toBe(false)
  })
})
