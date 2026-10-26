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

// Transport-derived visibility also restores the intro after replay/rewind.
function shouldShowSongIntro(notes, currentTime, windowSec, playheadRatio) {
  const time = Number(currentTime)
  const window = Number(windowSec)
  const ratio = Number(playheadRatio)
  if (!Number.isFinite(time) || !Number.isFinite(window) || window <= 0
    || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) return false
  if (!Array.isArray(notes)) return time <= 0
  let firstStart = Infinity
  for (const note of notes) {
    const start = Number(note?.t0Sec)
    const end = Number(note?.t1Sec)
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      firstStart = Math.min(firstStart, start)
    }
  }
  return firstStart > time + window * (1 - ratio)
}

export { hasVisibleMelodyGuideNote, shouldShowSongIntro }
