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

function pushLyricSegment(segments, segment) {
  if (!segment?.text) return
  const last = segments[segments.length - 1]
  if (last && !last.ruby && !segment.ruby && last.falsetto === segment.falsetto) {
    last.text += segment.text
    return
  }
  segments.push(segment)
}

const compactRubyPatterns = [
  ['予よ', '予', 'よ'],
  ['想そう', '想', 'そう'],
  ['通どお', '通', 'どお'],
  ['僕ぼく', '僕', 'ぼく'],
  ['何なに', '何', 'なに'],
  ['綺き', '綺', 'き'],
  ['麗れい', '麗', 'れい'],
  ['否いな', '否', 'いな'],
  ['難がた', '難', 'がた'],
  ['痛いた', '痛', 'いた'],
  ['甘あま', '甘', 'あま'],
]

function appendPlainLyricSegment(segments, text, falsetto) {
  if (!text) return
  let cursor = 0
  let plainBuffer = ''

  while (cursor < text.length) {
    const compactRuby = compactRubyPatterns.find(([source]) => text.startsWith(source, cursor))
    if (!compactRuby) {
      plainBuffer += text[cursor]
      cursor += 1
      continue
    }

    if (plainBuffer) {
      pushLyricSegment(segments, { text: plainBuffer, ruby: '', falsetto })
      plainBuffer = ''
    }
    pushLyricSegment(segments, { text: compactRuby[1], ruby: compactRuby[2], falsetto })
    cursor += compactRuby[0].length
  }

  if (plainBuffer) pushLyricSegment(segments, { text: plainBuffer, ruby: '', falsetto })
}

function appendRubyLyricSegment(segments, base, ruby, falsetto) {
  if (!base) return
  const wordMatch = base.match(/[A-Za-z][A-Za-z0-9'-]*$/)
  if (wordMatch) {
    const word = wordMatch[0]
    const prefix = base.slice(0, base.length - word.length)
    if (prefix) appendPlainLyricSegment(segments, prefix, falsetto)
    pushLyricSegment(segments, { text: word, ruby, falsetto })
    return
  }

  const prefix = base.slice(0, -1)
  const lastChar = base.slice(-1)
  if (prefix) appendPlainLyricSegment(segments, prefix, falsetto)
  if (lastChar) pushLyricSegment(segments, { text: lastChar, ruby, falsetto })
}

function parseLyricSegments(text) {
  const raw = String(text ?? '')
  const segments = []
  let cursor = 0
  let falsetto = false

  while (cursor < raw.length) {
    const rubyIndex = raw.indexOf('<', cursor)
    const tagIndex = raw.indexOf('{', cursor)
    const hasRuby = rubyIndex >= 0
    const hasTag = tagIndex >= 0
    const nextIndex =
      hasRuby && hasTag ? Math.min(rubyIndex, tagIndex) : hasRuby ? rubyIndex : hasTag ? tagIndex : -1

    if (nextIndex === -1) {
      appendPlainLyricSegment(segments, raw.slice(cursor), falsetto)
      break
    }

    if (nextIndex === rubyIndex) {
      const close = raw.indexOf('>', rubyIndex + 1)
      if (close === -1) {
        appendPlainLyricSegment(segments, raw.slice(cursor), falsetto)
        break
      }
      const base = raw.slice(cursor, rubyIndex)
      const ruby = raw.slice(rubyIndex + 1, close)
      appendRubyLyricSegment(segments, base, ruby, falsetto)
      cursor = close + 1
      continue
    }

    const plainText = raw.slice(cursor, tagIndex)
    if (plainText) appendPlainLyricSegment(segments, plainText, falsetto)

    if (raw.startsWith('{f}', tagIndex)) {
      falsetto = true
      cursor = tagIndex + 3
      continue
    }
    if (raw.startsWith('{/f}', tagIndex)) {
      falsetto = false
      cursor = tagIndex + 4
      continue
    }

    appendPlainLyricSegment(segments, '{', falsetto)
    cursor = tagIndex + 1
  }

  return {
    segments,
    plainText: segments.map((segment) => segment.text).join(''),
    hasRuby: segments.some((segment) => Boolean(segment.ruby)),
  }
}

function parseWordTimedLine(line, matches, offsetSeconds) {
  if (!matches.length) return null
  const tokens = []
  let lineStart = null
  let lineEnd = null
  let weightOffset = 0
  const prefix = line.slice(0, matches[0].index)
  const rawTextParts = []

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

    rawTextParts.push(segment)

    const parsedToken = parseLyricSegments(segment)
    const plainText = parsedToken.plainText
    const weight = /\S/u.test(plainText) ? 1 : 0
    tokens.push({ time: adjustedTime, text: plainText, weight, weightStart: weightOffset })
    weightOffset += weight
  }

  if (!tokens.length || lineStart == null) return null
  const text = rawTextParts.join('')
  const parsedLine = parseLyricSegments(text)
  return {
    time: lineStart,
    text,
    plainText: parsedLine.plainText,
    segments: parsedLine.segments,
    hasRuby: parsedLine.hasRuby,
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
    const parsedLyric = parseLyricSegments(lyricText)
    for (const match of matches) {
      const time = parseLrcTimestamp(match[0])
      if (time == null) continue
      entries.push({
        time: Math.max(0, time + offsetSeconds),
        text: lyricText,
        plainText: parsedLyric.plainText,
        segments: parsedLyric.segments,
        hasRuby: parsedLyric.hasRuby,
      })
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

export { parseLrc, findActiveLyricIndex, parseLyricSegments }
