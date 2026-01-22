function normalizeNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

export function extractReferenceMelodyFromMidiData(midi, opts = {}) {
  const channel = Number.isFinite(Number(opts.channel)) ? Number(opts.channel) : 0
  if (!midi?.tracks?.length) {
    return { notes: [], channelUsed: channel, durationSec: 0 }
  }

  const notes = []
  if (typeof midi.getNoteTimes === 'function') {
    const noteTimes = midi.getNoteTimes()
    const channelNotes = noteTimes?.[channel] || []
    channelNotes.forEach((note) => {
      const t0Sec = normalizeNumber(note.start, 0)
      const length = normalizeNumber(note.length, 0)
      const t1Sec = t0Sec + Math.max(0, length)
      const midiValue = normalizeNumber(note.midiNote, NaN)
      if (!Number.isFinite(midiValue)) return
      notes.push({
        t0Sec,
        t1Sec,
        midi: midiValue,
        velocity: Number.isFinite(Number(note.velocity)) ? Number(note.velocity) : undefined,
        channel,
        trackIndex: -1,
      })
    })
  }

  notes.sort((a, b) => a.t0Sec - b.t0Sec || a.t1Sec - b.t1Sec)

  const durationSec = normalizeNumber(midi.duration, 0)
  const fallbackDuration = notes.length ? Math.max(...notes.map((note) => note.t1Sec)) : durationSec

  return {
    notes,
    channelUsed: channel,
    durationSec: Math.max(durationSec, fallbackDuration),
  }
}

export function getTargetNoteAtTime(ref, songTimeSec, opts = {}) {
  if (!ref?.notes?.length) return null
  const time = Number(songTimeSec)
  if (!Number.isFinite(time)) return null
  const maxGap = Number.isFinite(opts.maxGap) ? opts.maxGap : 0
  const edgeToleranceSec = Number.isFinite(opts.edgeToleranceSec) ? opts.edgeToleranceSec : 0

  const notes = ref.notes
  let lo = 0
  let hi = notes.length - 1

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const note = notes[mid]
    if (time < note.t0Sec) {
      hi = mid - 1
    } else if (time >= note.t1Sec) {
      lo = mid + 1
    } else {
      return note
    }
  }

  // Not strictly in a note. Check gap if maxGap > 0
  if (maxGap > 0) {
    // 'lo' is the index of the first note that starts *after* time (or notes.length)
    // 'lo-1' is the note that ended *before* time
    const prev = notes[lo - 1]
    const next = notes[lo]

    // We only care if we are in a gap between two notes
    if (prev && next) {
      if (next.t0Sec - prev.t1Sec <= maxGap) {
        // We are in a valid gap.
        // Extend the previous note?
        if (time >= prev.t1Sec && time < next.t0Sec) {
          return prev
        }
      }
    }
  }

  if (edgeToleranceSec > 0) {
    const prev = notes[lo - 1]
    const next = notes[lo]
    if (prev && time >= prev.t0Sec - edgeToleranceSec && time <= prev.t1Sec + edgeToleranceSec) {
      return prev
    }
    if (next && time >= next.t0Sec - edgeToleranceSec && time <= next.t1Sec + edgeToleranceSec) {
      return next
    }
  }

  return null
}

export function getTargetMidiAtTime(ref, songTimeSec, opts = {}) {
  const note = getTargetNoteAtTime(ref, songTimeSec, opts)
  return note ? note.midi : null
}

export function mergeAdjacentNotesByPitch(notes = [], opts = {}) {
  if (!Array.isArray(notes) || notes.length === 0) return []
  const maxGapSec = Number.isFinite(opts.maxGapSec) ? opts.maxGapSec : 0
  const pitchToleranceSemis = Number.isFinite(opts.pitchToleranceSemis) ? opts.pitchToleranceSemis : 0

  const sorted = [...notes].sort((a, b) => a.t0Sec - b.t0Sec || a.t1Sec - b.t1Sec)
  const merged = []

  let current = { ...sorted[0] }
  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i]
    const gap = next.t0Sec - current.t1Sec
    const midiDiff = Math.abs(Number(next.midi) - Number(current.midi))
    const canMerge = gap <= maxGapSec && Number.isFinite(midiDiff) && midiDiff <= pitchToleranceSemis
    if (canMerge) {
      current.t1Sec = Math.max(current.t1Sec, next.t1Sec)
    } else {
      merged.push(current)
      current = { ...next }
    }
  }
  merged.push(current)
  return merged
}
