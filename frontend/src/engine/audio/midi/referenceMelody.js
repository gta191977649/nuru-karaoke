function normalizeNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function pickFinite(...values) {
  for (const value of values) {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return NaN
}

function extractRawTickNotes(midi, channel, tempoMap) {
  const tracks = Array.isArray(midi?.tracks) ? midi.tracks : []
  if (!tracks.length) return []
  const ticksPerBeat = tempoMap?.ticksPerBeat || 480
  const notes = []
  const active = new Map()

  const pushActive = (ch, note, tick, velocity) => {
    const key = `${ch}:${note}`
    const list = active.get(key) || []
    list.push({ tick, velocity })
    active.set(key, list)
  }

  const popActive = (ch, note) => {
    const key = `${ch}:${note}`
    const list = active.get(key)
    if (!list || !list.length) return null
    return list.shift()
  }

  const resolveSeconds = (tick) => {
    if (!Number.isFinite(tick)) return NaN
    if (typeof midi?.midiTicksToSeconds === 'function') {
      const sec = midi.midiTicksToSeconds(tick)
      if (Number.isFinite(sec)) return sec
    }
    return ticksToSeconds(tempoMap, tick)
  }

  tracks.forEach((track, trackIndex) => {
    const events = Array.isArray(track?.events) ? track.events : []
    events.forEach((event) => {
      const tick = Number(event?.ticks)
      if (!Number.isFinite(tick)) return

      let type = event?.type || null
      let ch = Number(event?.channel)
      let note = Number(event?.note ?? event?.noteNumber ?? event?.midiNote)
      let velocity = Number(event?.velocity ?? event?.vel ?? event?.v)

      const status = Number(event?.statusByte ?? event?.status)
      const data = event?.data || event?.bytes || event?.message || null
      const hasArrayLikeData =
        data != null &&
        typeof data !== 'string' &&
        Number.isFinite(Number(data.length))
      const data0 = hasArrayLikeData ? Number(data[0]) : NaN
      const data1 = hasArrayLikeData ? Number(data[1]) : NaN

      if (!type && Number.isFinite(status)) {
        const hi = status & 0xf0
        ch = status & 0x0f
        if (hi === 0x90) type = 'note_on'
        if (hi === 0x80) type = 'note_off'
        if (!Number.isFinite(note)) note = data0
        if (!Number.isFinite(velocity)) velocity = data1
      }

      if (!Number.isFinite(ch)) ch = 0
      if (!Number.isFinite(note)) return
      if (Number.isFinite(channel) && ch !== channel) return

      const isNoteOn = type === 'note_on' && Number.isFinite(velocity) ? velocity > 0 : type === 'note_on'
      const isNoteOff = type === 'note_off' || (type === 'note_on' && Number.isFinite(velocity) && velocity <= 0)
      if (!isNoteOn && !isNoteOff) return

      if (isNoteOn) {
        pushActive(ch, note, tick, Number.isFinite(velocity) ? velocity : undefined)
        return
      }

      const start = popActive(ch, note)
      if (!start) return
      const t0Tick = start.tick
      const t1Tick = tick
      const t0Sec = resolveSeconds(t0Tick)
      const t1Sec = resolveSeconds(t1Tick)
      notes.push({
        t0Tick,
        t1Tick,
        t0Beat: t0Tick / ticksPerBeat,
        t1Beat: t1Tick / ticksPerBeat,
        t0Sec,
        t1Sec,
        midi: note,
        velocity: start.velocity,
        channel: ch,
        trackIndex,
        type: 'normal',
      })
    })
  })

  notes.sort((a, b) => a.t0Tick - b.t0Tick || a.t1Tick - b.t1Tick)
  return notes
}

function buildTempoMap(midi) {
  const timeDivision = Number(midi?.timeDivision)
  const ticksPerBeat = Number.isFinite(timeDivision) && timeDivision > 0 ? timeDivision : 480
  const tempoChanges = Array.isArray(midi?.tempoChanges) ? midi.tempoChanges.slice() : []
  if (!tempoChanges.length) {
    tempoChanges.push({ ticks: 0, tempo: 120 })
  }
  tempoChanges.sort((a, b) => Number(a.ticks) - Number(b.ticks))

  const deduped = []
  for (let i = 0; i < tempoChanges.length; i += 1) {
    const change = tempoChanges[i]
    const tick = Number(change.ticks) || 0
    const last = deduped[deduped.length - 1]
    if (last && Number(last.ticks) === tick) {
      deduped[deduped.length - 1] = change
    } else {
      deduped.push(change)
    }
  }

  const segments = []
  let currentSec = 0
  let prevTick = Number(deduped[0]?.ticks) || 0
  let prevBpm = Number(deduped[0]?.tempo) || 120
  let lastStartSec = 0

  for (let i = 0; i < deduped.length; i += 1) {
    const change = deduped[i]
    const startTick = Number(change.ticks) || 0
    const bpm = Number(change.tempo) || 120

    if (i > 0) {
      const deltaTicks = startTick - prevTick
      currentSec += (deltaTicks / ticksPerBeat) * (60 / prevBpm)
    }

    let startSec = currentSec
    if (typeof midi?.midiTicksToSeconds === 'function') {
      const alt = midi.midiTicksToSeconds(startTick)
      if (Number.isFinite(alt)) {
        const closeEnough = Math.abs(alt - currentSec) <= 0.02
        const monotonic = alt + 1e-6 >= lastStartSec
        if (closeEnough && monotonic) startSec = alt
      }
    }
    lastStartSec = startSec

    segments.push({
      startTick,
      startSec,
      bpm,
      beatsPerSec: bpm / 60,
      ticksPerBeat,
    })

    prevTick = startTick
    prevBpm = bpm
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

function getSegmentAtTime(tempoMap, timeSec) {
  const t = Number(timeSec)
  if (!Number.isFinite(t)) return tempoMap.segments[0] || null
  const segments = tempoMap.segments
  if (!segments.length) return null
  let seg = segments[0]
  for (let i = 1; i < segments.length; i += 1) {
    if (t >= segments[i].startSec) seg = segments[i]
    else break
  }
  return seg
}

function getSegmentAtBeat(tempoMap, beat) {
  const b = Number(beat)
  if (!Number.isFinite(b)) return tempoMap.segments[0] || null
  const segments = tempoMap.segments
  if (!segments.length) return null
  const ticks = b * tempoMap.ticksPerBeat
  let seg = segments[0]
  for (let i = 1; i < segments.length; i += 1) {
    if (ticks >= segments[i].startTick) seg = segments[i]
    else break
  }
  return seg
}

function secondsToBeats(tempoMap, timeSec) {
  const ticks = secondsToTicks(tempoMap, timeSec)
  return ticks / tempoMap.ticksPerBeat
}

function ticksToSeconds(tempoMap, ticks) {
  const t = Number(ticks)
  if (!Number.isFinite(t)) return 0
  const segments = tempoMap.segments
  if (!segments.length) return 0
  let seg = segments[0]
  for (let i = 1; i < segments.length; i += 1) {
    if (t >= segments[i].startTick) seg = segments[i]
    else break
  }
  const ticksPerSec = seg.ticksPerBeat * seg.beatsPerSec
  return seg.startSec + Math.max(0, t - seg.startTick) / ticksPerSec
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
      const t0SecRaw = normalizeNumber(note.start, 0)
      const length = normalizeNumber(note.length, 0)
      const t1SecRaw = t0SecRaw + Math.max(0, length)
      const midiValue = normalizeNumber(note.midiNote, NaN)
      if (!Number.isFinite(midiValue)) return
      let t0Tick = pickFinite(note.ticks, note.tick, note.startTick, note.startTicks)
      const tickLength = pickFinite(
        note.durationTicks,
        note.lengthTicks,
        note.ticksLength,
        note.tickLength,
      )
      let t1Tick =
        Number.isFinite(t0Tick) && Number.isFinite(tickLength)
          ? t0Tick + Math.max(0, tickLength)
          : NaN

      if (!Number.isFinite(t0Tick)) {
        t0Tick = secondsToTicks(tempoMap, t0SecRaw)
      }
      if (!Number.isFinite(t1Tick)) {
        t1Tick = secondsToTicks(tempoMap, t1SecRaw)
      }

      const t0Sec = Number.isFinite(t0Tick) ? ticksToSeconds(tempoMap, t0Tick) : t0SecRaw
      const t1Sec = Number.isFinite(t1Tick) ? ticksToSeconds(tempoMap, t1Tick) : t1SecRaw

      const t0Beat = t0Tick / tempoMap.ticksPerBeat
      const t1Beat = t1Tick / tempoMap.ticksPerBeat
      const resolvedType = resolveNoteType ? resolveNoteType({ note, midi, channel }) : null
      const type = typeof resolvedType === 'string' && resolvedType.length ? resolvedType : 'normal'
      notes.push({
        t0Sec,
        t1Sec,
        t0Beat,
        t1Beat,
        t0Tick: Number.isFinite(t0Tick) ? t0Tick : undefined,
        t1Tick: Number.isFinite(t1Tick) ? t1Tick : undefined,
        midi: midiValue,
        velocity: Number.isFinite(Number(note.velocity)) ? Number(note.velocity) : undefined,
        type,
        channel,
        trackIndex: -1,
      })
    })
  }

  notes.sort((a, b) => {
    const a0 = Number.isFinite(a.t0Tick) ? a.t0Tick : a.t0Sec
    const b0 = Number.isFinite(b.t0Tick) ? b.t0Tick : b.t0Sec
    if (a0 !== b0) return a0 - b0
    const a1 = Number.isFinite(a.t1Tick) ? a.t1Tick : a.t1Sec
    const b1 = Number.isFinite(b.t1Tick) ? b.t1Tick : b.t1Sec
    return a1 - b1
  })

  const rawNotes = extractRawTickNotes(midi, channel, tempoMap)
  if (!notes.length && rawNotes.length) {
    notes.push(...rawNotes)
  }

  const durationSec = normalizeNumber(midi.duration, 0)
  const fallbackDuration = notes.length ? Math.max(...notes.map((note) => note.t1Sec)) : durationSec

  return {
    notes,
    rawNotes: rawNotes.length ? rawNotes : [],
    channelUsed: channel,
    durationSec: Math.max(durationSec, fallbackDuration),
    timeDivision: tempoMap.ticksPerBeat,
    tempoChanges: Array.isArray(midi?.tempoChanges) ? midi.tempoChanges : [],
    getBeatAtTime: (timeSec) => secondsToBeats(tempoMap, timeSec),
    getBeatsPerSecond: (timeSec) => {
      const t = Number(timeSec)
      if (!Number.isFinite(t)) return tempoMap.segments[0]?.beatsPerSec ?? 2
      const seg = getSegmentAtTime(tempoMap, t)
      return seg?.beatsPerSec ?? 2
    },
    beatsToSeconds: (beats) => beatsToSeconds(tempoMap, beats),
    getTickAtTime: (timeSec) => secondsToTicks(tempoMap, timeSec),
    ticksToSeconds: (ticks) => ticksToSeconds(tempoMap, ticks),
    getTempoSegmentAtTime: (timeSec) => getSegmentAtTime(tempoMap, timeSec),
    getTempoSegmentAtBeat: (beat) => getSegmentAtBeat(tempoMap, beat),
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
  const ticksPerBeat = Number(ref?.timeDivision) || 480
  const tick = b * ticksPerBeat
  const maxGapTick = Number.isFinite(opts.maxGap) ? opts.maxGap * ticksPerBeat : 0
  const edgeToleranceTick = Number.isFinite(opts.edgeToleranceBeat) ? opts.edgeToleranceBeat * ticksPerBeat : 0
  return getTargetNoteAtTick(ref, tick, { maxGapTick, edgeToleranceTick })
}

export function getTargetMidiAtTime(ref, songTimeSec, opts = {}) {
  const note = getTargetNoteAtTime(ref, songTimeSec, opts)
  return note ? note.midi : null
}

export function getTargetNoteAtTick(ref, tick, opts = {}) {
  if (!ref?.notes?.length) return null
  const t = Number(tick)
  if (!Number.isFinite(t)) return null
  const maxGapTick = Number.isFinite(opts.maxGapTick) ? opts.maxGapTick : 0
  const edgeToleranceTick = Number.isFinite(opts.edgeToleranceTick) ? opts.edgeToleranceTick : 0
  const ticksPerBeat = Number(ref?.timeDivision) || 480

  const notes = ref.notes
  let lo = 0
  let hi = notes.length - 1

  const noteToTick = (note, key) => {
    const v = Number(note?.[key])
    if (Number.isFinite(v)) return v
    const beat = key === 't0Tick' ? Number(note?.t0Beat) : Number(note?.t1Beat)
    if (Number.isFinite(beat)) return beat * ticksPerBeat
    return null
  }

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const note = notes[mid]
    const t0 = noteToTick(note, 't0Tick')
    const t1 = noteToTick(note, 't1Tick')
    if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null
    if (t < t0) {
      hi = mid - 1
    } else if (t >= t1) {
      lo = mid + 1
    } else {
      return note
    }
  }

  if (maxGapTick > 0) {
    const prev = notes[lo - 1]
    const next = notes[lo]
    if (prev && next) {
      const prevEnd = noteToTick(prev, 't1Tick')
      const nextStart = noteToTick(next, 't0Tick')
      if (Number.isFinite(prevEnd) && Number.isFinite(nextStart)) {
        if (nextStart - prevEnd <= maxGapTick) {
          if (t >= prevEnd && t < nextStart) return prev
        }
      }
    }
  }

  if (edgeToleranceTick > 0) {
    const prev = notes[lo - 1]
    const next = notes[lo]
    if (prev) {
      const p0 = noteToTick(prev, 't0Tick')
      const p1 = noteToTick(prev, 't1Tick')
      if (Number.isFinite(p0) && Number.isFinite(p1)) {
        if (t >= p0 - edgeToleranceTick && t <= p1 + edgeToleranceTick) return prev
      }
    }
    if (next) {
      const n0 = noteToTick(next, 't0Tick')
      const n1 = noteToTick(next, 't1Tick')
      if (Number.isFinite(n0) && Number.isFinite(n1)) {
        if (t >= n0 - edgeToleranceTick && t <= n1 + edgeToleranceTick) return next
      }
    }
  }

  return null
}

export function getTargetMidiAtTick(ref, tick, opts = {}) {
  const note = getTargetNoteAtTick(ref, tick, opts)
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
      if (Number.isFinite(current.t1Tick) || Number.isFinite(next.t1Tick)) {
        const cTick = Number.isFinite(current.t1Tick) ? current.t1Tick : -Infinity
        const nTick = Number.isFinite(next.t1Tick) ? next.t1Tick : -Infinity
        const mergedTick = Math.max(cTick, nTick)
        if (Number.isFinite(mergedTick)) current.t1Tick = mergedTick
      }
    } else {
      merged.push(current)
      current = { ...next }
    }
  }
  merged.push(current)
  return merged
}
