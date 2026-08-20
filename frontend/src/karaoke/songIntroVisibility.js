function hasVisibleMelodyGuideNote(
  notes,
  currentTime,
  windowSec,
  playheadRatio,
) {
  if (!Array.isArray(notes) || notes.length === 0) return false

  const songTime = Number(currentTime)
  const visibleWindowSec = Number(windowSec)
  const playhead = Number(playheadRatio)
  if (
    !Number.isFinite(songTime)
    || !Number.isFinite(visibleWindowSec)
    || visibleWindowSec <= 0
    || !Number.isFinite(playhead)
    || playhead < 0
    || playhead > 1
  ) {
    return false
  }

  const visibleStart = songTime - visibleWindowSec * playhead
  const visibleEnd = songTime + visibleWindowSec * (1 - playhead)

  return notes.some((note) => {
    const noteStart = Number(note?.t0Sec)
    const noteEnd = Number(note?.t1Sec)
    return (
      Number.isFinite(noteStart)
      && Number.isFinite(noteEnd)
      && noteEnd >= visibleStart
      && noteStart <= visibleEnd
    )
  })
}

export { hasVisibleMelodyGuideNote }
