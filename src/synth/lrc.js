function parseLrcTimestamp(token) {
  const match = token.match(/^\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]$/)
  if (!match) return null
  const minutes = Number(match[1])
  const seconds = Number(match[2])
  const fraction = match[3] ?? '0'
  const millis =
    fraction.length === 3 ? Number(fraction) : fraction.length === 2 ? Number(fraction) * 10 : Number(fraction) * 100
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(millis)) return null
  return minutes * 60 + seconds + millis / 1000
}

function parseLrc(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n')
  const entries = []
  let offsetSeconds = 0

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line) continue

    const offsetMatch = line.match(/^\[offset:([+-]?\d+)\]$/i)
    if (offsetMatch) {
      const ms = Number(offsetMatch[1])
      if (Number.isFinite(ms)) offsetSeconds = ms / 1000
      continue
    }

    if (/^\[[a-z]{2,}:[^\]]*\]$/i.test(line) && !/^\[\d/.test(line)) continue

    const timeTokens = line.match(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g)
    if (!timeTokens?.length) continue

    const lyricText = line.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '').trim()
    for (const t of timeTokens) {
      const time = parseLrcTimestamp(t)
      if (time == null) continue
      entries.push({ time: Math.max(0, time + offsetSeconds), text: lyricText })
    }
  }

  entries.sort((a, b) => a.time - b.time)
  const deduped = []
  for (const entry of entries) {
    const last = deduped[deduped.length - 1]
    if (last && last.time === entry.time) deduped[deduped.length - 1] = entry
    else deduped.push(entry)
  }
  return deduped
}

function findActiveLyricIndex(entries, timeSeconds) {
  if (!entries?.length) return -1
  if (!Number.isFinite(timeSeconds)) return -1
  let lo = 0
  let hi = entries.length - 1
  if (timeSeconds < entries[0].time) return -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const t = entries[mid].time
    if (t === timeSeconds) return mid
    if (t < timeSeconds) lo = mid + 1
    else hi = mid - 1
  }
  return Math.max(0, lo - 1)
}

export { parseLrc, findActiveLyricIndex }

