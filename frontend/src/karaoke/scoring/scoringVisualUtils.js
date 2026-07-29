export const TECHNIQUE_LANDING_WINDOW_SEC = 0.25
export const TECHNIQUE_MIN_STABLE_LANDING_SEC = 0.08
export const VISUAL_CONFIRMATION_MAX_SEC = 0.16

export function smoothLiveMarkerPosition(
  previousPosition,
  targetPosition,
  deltaSec,
  responseSec = 0.08,
) {
  if (!Number.isFinite(targetPosition)) return null
  const target = Number(targetPosition)
  if (!Number.isFinite(previousPosition)) return target
  const previous = Number(previousPosition)

  const delta = Math.max(0, Number(deltaSec) || 0)
  const response = Math.max(1e-4, Number(responseSec) || 0.08)
  const alpha = 1 - Math.exp(-delta / response)
  return previous + (target - previous) * alpha
}

export function getLivePitchTrailSegments(
  history,
  nowSec,
  {
    durationSec = 2,
    rmsGate = 0,
    maxGapSec = 0.15,
  } = {},
) {
  const now = Number(nowSec)
  if (!Number.isFinite(now) || !Array.isArray(history)) return []

  const duration = Math.max(0, Number(durationSec) || 0)
  const cutoff = now - duration
  const gate = Math.max(0, Number(rmsGate) || 0)
  const maxGap = Math.max(0, Number(maxGapSec) || 0)
  const segments = []
  let previous = null

  for (const point of history) {
    const timeSec = Number(point?.t)
    const midi = Number.isFinite(point?.userMidi) ? Number(point.userMidi) : null
    const rms = Number.isFinite(point?.rms) ? Number(point.rms) : null
    const voiced =
      Number.isFinite(timeSec) &&
      timeSec >= cutoff &&
      timeSec <= now + 0.05 &&
      Number.isFinite(midi) &&
      (!Number.isFinite(rms) || rms >= gate)

    if (!voiced) {
      previous = null
      continue
    }

    const current = { timeSec, midi }
    if (
      previous &&
      current.timeSec > previous.timeSec &&
      current.timeSec - previous.timeSec <= maxGap
    ) {
      const ageSec = Math.max(0, now - current.timeSec)
      const fade = duration > 0 ? Math.max(0, 1 - ageSec / duration) : 1
      segments.push({
        t0Sec: previous.timeSec,
        t1Sec: current.timeSec,
        midi0: previous.midi,
        midi1: current.midi,
        alpha: fade * fade,
      })
    }
    previous = current
  }

  return segments
}

export function mergeConfirmedSpans(spans = [], toleranceSec = 0) {
  const tolerance = Math.max(0, Number(toleranceSec) || 0)
  const sorted = (spans || [])
    .filter((span) => Number.isFinite(Number(span?.t0)) && Number.isFinite(Number(span?.t1)))
    .map((span) => ({
      ...span,
      t0: Number(span.t0),
      t1: Number(span.t1),
      showAt: Number.isFinite(Number(span.showAt)) ? Number(span.showAt) : 0,
    }))
    .filter((span) => span.t1 > span.t0)
    .sort((a, b) => a.t0 - b.t0)
  if (!sorted.length) return []

  const merged = [{ ...sorted[0] }]
  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index]
    const current = merged[merged.length - 1]
    if (next.t0 <= current.t1 + tolerance + 1e-9) {
      current.t1 = Math.max(current.t1, next.t1)
      current.showAt = Math.max(current.showAt, next.showAt)
    } else {
      merged.push({ ...next })
    }
  }
  return merged
}

export function getConfirmedSegmentFillEnd(segment, nowSec, fillSpeed = 1) {
  const startSec = Number(segment?.t0Sec)
  const endSec = Number(segment?.t1Sec)
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return null

  const confirmedAtSec = Number(segment?.confirmedAtSec)
  if (!Number.isFinite(confirmedAtSec)) return endSec

  const now = Number(nowSec)
  const speed = Math.max(0, Number(fillSpeed) || 0)
  if (!Number.isFinite(now) || now <= confirmedAtSec) return startSec
  return Math.min(endSec, startSec + (now - confirmedAtSec) * speed)
}

export function getStableHitTargetMidi(segment, noteResults = [], transposition = 0) {
  const noteResult = (noteResults || []).find((result) => result?.noteId === segment?.noteId)
  const noteMidi = Number(noteResult?.note?.midi)
  const segmentMidi = Number(segment?.midi)
  const targetMidi = Number.isFinite(noteMidi) ? noteMidi : segmentMidi
  if (!Number.isFinite(targetMidi)) return null

  const transpose = Number(transposition)
  return targetMidi + (Number.isFinite(transpose) ? transpose : 0)
}

export function getTechniqueResolutionTime(
  eventTimeSec,
  noteEndSec,
  confirmationDelaySec = VISUAL_CONFIRMATION_MAX_SEC,
) {
  const eventTime = Number(eventTimeSec)
  if (!Number.isFinite(eventTime)) return null
  const landingDeadline = eventTime + TECHNIQUE_LANDING_WINDOW_SEC
  const noteEnd = Number(noteEndSec)
  const confirmationDelay = Math.max(0, Number(confirmationDelaySec) || 0)
  return Number.isFinite(noteEnd)
    ? Math.max(landingDeadline, noteEnd + confirmationDelay)
    : landingDeadline
}

export function getStableLandingDuration(
  stableSegments,
  eventTimeSec,
  windowSec = TECHNIQUE_LANDING_WINDOW_SEC,
) {
  const start = Number(eventTimeSec)
  if (!Number.isFinite(start)) return 0
  const end = start + Math.max(0, Number(windowSec) || 0)

  const clipped = (stableSegments || []).flatMap((segment) => {
    const segmentStart = Number(segment?.t0Sec)
    const segmentEnd = Number(segment?.t1Sec)
    if (!Number.isFinite(segmentStart) || !Number.isFinite(segmentEnd)) return []
    const clippedStart = Math.max(start, segmentStart)
    const clippedEnd = Math.min(end, segmentEnd)
    return clippedEnd > clippedStart ? [{ start: clippedStart, end: clippedEnd }] : []
  }).sort((a, b) => a.start - b.start)

  let total = 0
  let current = null
  for (const interval of clipped) {
    if (!current || interval.start > current.end) {
      if (current) total += current.end - current.start
      current = { ...interval }
    } else {
      current.end = Math.max(current.end, interval.end)
    }
  }
  return total + (current ? current.end - current.start : 0)
}

export function hasStableTechniqueLanding(stableSegments, eventTimeSec, options = {}) {
  const windowSec = Number(options.windowSec) || TECHNIQUE_LANDING_WINDOW_SEC
  const minStableSec = Number(options.minStableSec) || TECHNIQUE_MIN_STABLE_LANDING_SEC
  return getStableLandingDuration(stableSegments, eventTimeSec, windowSec) >= minStableSec - 1e-9
}
