function normalizeNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function buildTempoMap(midi) {
  const timeDivision = Number(midi?.timeDivision)
  const ticksPerBeat = Number.isFinite(timeDivision) && timeDivision > 0 ? timeDivision : 480
  const tempoChanges = Array.isArray(midi?.tempoChanges) ? midi.tempoChanges.slice() : []
  if (!tempoChanges.length) {
    tempoChanges.push({ ticks: 0, tempo: 120 })
  }
  tempoChanges.sort((a, b) => Number(a.ticks) - Number(b.ticks))

  const segments = []
  for (let i = 0; i < tempoChanges.length; i += 1) {
    const change = tempoChanges[i]
    const startTick = Number(change.ticks) || 0
    const bpm = Number(change.tempo) || 120
    const startSec =
      typeof midi?.midiTicksToSeconds === 'function'
        ? midi.midiTicksToSeconds(startTick)
        : (startTick / ticksPerBeat) * (60 / bpm)
    segments.push({
      startTick,
      startSec,
      bpm,
      beatsPerSec: bpm / 60,
      ticksPerBeat,
    })
  }

  return { segments, ticksPerBeat }
}

function secondsToTicks(tempoMap, timeSec) {
  const t = Number(timeSec)
  if (!Number.isFinite(t)) return 0
  const segments = tempoMap.segments
  if (!segments.length) return 0
  let seg = segments[0]
  for (let i = 1; i < segments.length; i += 1) {
    if (t >= segments[i].startSec) seg = segments[i]
    else break
  }
  const ticksPerSec = seg.ticksPerBeat * seg.beatsPerSec
  return seg.startTick + Math.max(0, t - seg.startSec) * ticksPerSec
}

function secondsToBeats(tempoMap, timeSec) {
  const ticks = secondsToTicks(tempoMap, timeSec)
  return ticks / tempoMap.ticksPerBeat
}

function beatsToSeconds(tempoMap, beats) {
  const b = Number(beats)
  if (!Number.isFinite(b)) return 0
  const segments = tempoMap.segments
  if (!segments.length) return 0
  // Find segment by beat -> tick
  const ticks = b * tempoMap.ticksPerBeat
  let seg = segments[0]
  for (let i = 1; i < segments.length; i += 1) {
    if (ticks >= segments[i].startTick) seg = segments[i]
    else break
  }
  const ticksPerSec = seg.ticksPerBeat * seg.beatsPerSec
  return seg.startSec + Math.max(0, ticks - seg.startTick) / ticksPerSec
}

export function extractReferenceMelodyFromMidiData(midi, opts = {}) {
  const channel = Number.isFinite(Number(opts.channel)) ? Number(opts.channel) : 0
  const resolveNoteType = typeof opts.noteTypeResolver === 'function' ? opts.noteTypeResolver : null
  if (!midi?.tracks?.length) {
    return { notes: [], channelUsed: channel, durationSec: 0 }
  }

  const tempoMap = buildTempoMap(midi)

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
      const t0Beat = secondsToBeats(tempoMap, t0Sec)
      const t1Beat = secondsToBeats(tempoMap, t1Sec)
      const resolvedType = resolveNoteType ? resolveNoteType({ note, midi, channel }) : null
      const type = typeof resolvedType === 'string' && resolvedType.length ? resolvedType : 'normal'
      notes.push({
        t0Sec,
        t1Sec,
        t0Beat,
        t1Beat,
        midi: midiValue,
        velocity: Number.isFinite(Number(note.velocity)) ? Number(note.velocity) : undefined,
        type,
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
    timeDivision: tempoMap.ticksPerBeat,
    tempoChanges: Array.isArray(midi?.tempoChanges) ? midi.tempoChanges : [],
    getBeatAtTime: (timeSec) => secondsToBeats(tempoMap, timeSec),
    getBeatsPerSecond: (timeSec) => {
      const t = Number(timeSec)
      if (!Number.isFinite(t)) return tempoMap.segments[0]?.beatsPerSec ?? 2
      const segments = tempoMap.segments
      let seg = segments[0]
      for (let i = 1; i < segments.length; i += 1) {
        if (t >= segments[i].startSec) seg = segments[i]
        else break
      }
      return seg?.beatsPerSec ?? 2
    },
    beatsToSeconds: (beats) => beatsToSeconds(tempoMap, beats),
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

export function getTargetNoteAtBeat(ref, beat, opts = {}) {
  if (!ref?.notes?.length) return null
  const b = Number(beat)
  if (!Number.isFinite(b)) return null
  const maxGap = Number.isFinite(opts.maxGap) ? opts.maxGap : 0
  const edgeToleranceBeat = Number.isFinite(opts.edgeToleranceBeat) ? opts.edgeToleranceBeat : 0

  const notes = ref.notes
  let lo = 0
  let hi = notes.length - 1

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const note = notes[mid]
    const t0 = Number.isFinite(note.t0Beat) ? note.t0Beat : note.t0Sec
    const t1 = Number.isFinite(note.t1Beat) ? note.t1Beat : note.t1Sec
    if (b < t0) {
      hi = mid - 1
    } else if (b >= t1) {
      lo = mid + 1
    } else {
      return note
    }
  }

  if (maxGap > 0) {
    const prev = notes[lo - 1]
    const next = notes[lo]
    if (prev && next) {
      const prevEnd = Number.isFinite(prev.t1Beat) ? prev.t1Beat : prev.t1Sec
      const nextStart = Number.isFinite(next.t0Beat) ? next.t0Beat : next.t0Sec
      if (nextStart - prevEnd <= maxGap) {
        if (b >= prevEnd && b < nextStart) return prev
      }
    }
  }

  if (edgeToleranceBeat > 0) {
    const prev = notes[lo - 1]
    const next = notes[lo]
    if (prev) {
      const p0 = Number.isFinite(prev.t0Beat) ? prev.t0Beat : prev.t0Sec
      const p1 = Number.isFinite(prev.t1Beat) ? prev.t1Beat : prev.t1Sec
      if (b >= p0 - edgeToleranceBeat && b <= p1 + edgeToleranceBeat) return prev
    }
    if (next) {
      const n0 = Number.isFinite(next.t0Beat) ? next.t0Beat : next.t0Sec
      const n1 = Number.isFinite(next.t1Beat) ? next.t1Beat : next.t1Sec
      if (b >= n0 - edgeToleranceBeat && b <= n1 + edgeToleranceBeat) return next
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
  const maxGapBeat = Number.isFinite(opts.maxGapBeat) ? opts.maxGapBeat : 0
  const useBeat = opts.useBeat === true
  const pitchToleranceSemis = Number.isFinite(opts.pitchToleranceSemis) ? opts.pitchToleranceSemis : 0

  const sorted = [...notes].sort((a, b) => a.t0Sec - b.t0Sec || a.t1Sec - b.t1Sec)
  const merged = []

  let current = { ...sorted[0] }
  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i]
    const gap = useBeat
      ? (Number.isFinite(next.t0Beat) ? next.t0Beat : next.t0Sec) -
        (Number.isFinite(current.t1Beat) ? current.t1Beat : current.t1Sec)
      : next.t0Sec - current.t1Sec
    const midiDiff = Math.abs(Number(next.midi) - Number(current.midi))
    const gapLimit = useBeat ? maxGapBeat : maxGapSec
    const canMerge = gap <= gapLimit && Number.isFinite(midiDiff) && midiDiff <= pitchToleranceSemis
    if (canMerge) {
      current.t1Sec = Math.max(current.t1Sec, next.t1Sec)
      if (Number.isFinite(current.t1Beat) || Number.isFinite(next.t1Beat)) {
        const cBeat = Number.isFinite(current.t1Beat) ? current.t1Beat : current.t1Sec
        const nBeat = Number.isFinite(next.t1Beat) ? next.t1Beat : next.t1Sec
        current.t1Beat = Math.max(cBeat, nBeat)
      }
    } else {
      merged.push(current)
      current = { ...next }
    }
  }
  merged.push(current)
  return merged
}
