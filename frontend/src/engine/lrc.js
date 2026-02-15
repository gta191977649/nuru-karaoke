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

function parseWordTimedLine(line, matches, offsetSeconds) {
  if (!matches.length) return null
  const tokens = []
  let lineStart = null
  let lineEnd = null
  let weightOffset = 0
  const prefix = line.slice(0, matches[0].index)

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]
    const time = parseLrcTimestamp(match[0])
    if (time == null) continue
    const startIndex = match.index + match[0].length
    const endIndex = matches[i + 1]?.index ?? line.length
    let segment = line.slice(startIndex, endIndex)
    if (i === 0 && prefix) segment = `${prefix}${segment}`

    const isLast = i === matches.length - 1
    if (!segment && isLast) {
      lineEnd = Math.max(0, time + offsetSeconds)
      continue
    }
    if (!segment.trim() && isLast) {
      lineEnd = Math.max(0, time + offsetSeconds)
      if (!segment) continue
    }

    const adjustedTime = Math.max(0, time + offsetSeconds)
    if (lineStart == null) lineStart = adjustedTime

    const weight = 1
    tokens.push({ time: adjustedTime, text: segment, weight, weightStart: weightOffset })
    weightOffset += weight
  }

  if (!tokens.length || lineStart == null) return null
  const text = tokens.map((token) => token.text).join('')
  return {
    time: lineStart,
    text,
    tokens,
    tokenTotalWeight: weightOffset,
    endTime: lineEnd,
  }
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

    const matches = [...line.matchAll(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g)]
    if (!matches.length) continue

    let wordByTime = false
    let lastIndex = 0
    for (const match of matches) {
      const between = line.slice(lastIndex, match.index)
      if (/\S/.test(between)) {
        wordByTime = true
        break
      }
      lastIndex = match.index + match[0].length
    }

    if (wordByTime) {
      const entry = parseWordTimedLine(line, matches, offsetSeconds)
      if (entry) entries.push(entry)
      continue
    }

    const lyricText = line.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '').trim()
    for (const match of matches) {
      const time = parseLrcTimestamp(match[0])
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
