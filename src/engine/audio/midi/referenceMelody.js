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

export function getTargetMidiAtTime(ref, songTimeSec) {
  if (!ref?.notes?.length) return null
  const time = Number(songTimeSec)
  if (!Number.isFinite(time)) return null

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
      return note.midi
    }
  }

  return null
}
