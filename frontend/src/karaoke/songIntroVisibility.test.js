import { describe, expect, it } from 'vitest'

import { hasVisibleMelodyGuideNote } from './songIntroVisibility.js'

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
