import { AUTO_GAIN_DEFAULTS } from './autoGainController.js'

const MIDI_GAIN_ESTIMATOR_DEFAULTS = Object.freeze({
  targetDb: AUTO_GAIN_DEFAULTS.targetDb,
  minGainDb: AUTO_GAIN_DEFAULTS.minGainDb,
  maxGainDb: AUTO_GAIN_DEFAULTS.maxGainDb,
  defaultChannelVolume: 100,
  defaultExpression: 127,
  // SC-55 SoundFont calibration: a MIDI RMS of 1.0 renders around this level.
  // Bias slightly high because the real-time controller cuts excess gain quickly,
  // while a low starting estimate would cause the audible slow fade-in we avoid.
  renderedReferenceDb: -36,
})

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const getEventPriority = (status, data) => {
  const type = status & 0xf0
  if (type === 0xb0 && (data?.[0] === 7 || data?.[0] === 11 || data?.[0] === 121)) return 0
  if (type === 0x80 || (type === 0x90 && (Number(data?.[1]) || 0) <= 0)) return 1
  if (type === 0x90) return 2
  if (type === 0xb0) return 3
  return 4
}

function collectVolumeEvents(midi) {
  const events = []
  let ordinal = 0

  for (const track of midi?.tracks || []) {
    for (const event of track?.events || []) {
      const status = Number(event?.statusByte ?? event?.status)
      const ticks = Number(event?.ticks)
      if (!Number.isFinite(status) || !Number.isFinite(ticks) || status < 0x80 || status >= 0xf0) continue
      const type = status & 0xf0
      if (type !== 0x80 && type !== 0x90 && type !== 0xb0) continue
      const data = event?.data || event?.bytes || event?.message
      events.push({
        ticks,
        status,
        data,
        priority: getEventPriority(status, data),
        ordinal: ordinal++,
      })
    }
  }

  events.sort((a, b) => a.ticks - b.ticks || a.priority - b.priority || a.ordinal - b.ordinal)
  return events
}

function estimateMidiInitialGainDb(midi, options = {}) {
  const config = { ...MIDI_GAIN_ESTIMATOR_DEFAULTS, ...options }
  const events = collectVolumeEvents(midi)
  if (!events.length) return null

  const channelVolume = Array.from({ length: 16 }, () => config.defaultChannelVolume / 127)
  const channelExpression = Array.from({ length: 16 }, () => config.defaultExpression / 127)
  const channelNotePower = Array.from({ length: 16 }, () => 0)
  const activeNotes = Array.from({ length: 16 }, () => new Map())

  let weightedPower = 0
  let activeTicks = 0
  let noteCount = 0
  let velocitySum = 0
  let fallbackNotePower = 0
  let previousTick = events[0].ticks

  const getCombinedPower = () => channelNotePower.reduce((total, notePower, channel) => {
    const channelGain = channelVolume[channel] * channelExpression[channel]
    return total + notePower * channelGain * channelGain
  }, 0)

  const clearChannelNotes = (channel) => {
    activeNotes[channel].clear()
    channelNotePower[channel] = 0
  }

  for (const event of events) {
    const deltaTicks = Math.max(0, event.ticks - previousTick)
    const combinedPower = getCombinedPower()
    if (deltaTicks > 0 && combinedPower > 0) {
      weightedPower += combinedPower * deltaTicks
      activeTicks += deltaTicks
    }
    previousTick = event.ticks

    const type = event.status & 0xf0
    const channel = event.status & 0x0f
    const data0 = Number(event.data?.[0]) || 0
    const data1 = Number(event.data?.[1]) || 0

    if (type === 0xb0) {
      if (data0 === 7) channelVolume[channel] = clamp(data1, 0, 127) / 127
      else if (data0 === 11) channelExpression[channel] = clamp(data1, 0, 127) / 127
      else if (data0 === 121) {
        channelExpression[channel] = config.defaultExpression / 127
      } else if (data0 === 120 || data0 === 123) {
        clearChannelNotes(channel)
      }
      continue
    }

    const isNoteOn = type === 0x90 && data1 > 0
    const isNoteOff = type === 0x80 || (type === 0x90 && data1 <= 0)
    if (isNoteOn) {
      const velocityRatio = clamp(data1, 1, 127) / 127
      const notePower = velocityRatio * velocityRatio
      const noteStack = activeNotes[channel].get(data0) || []
      noteStack.push(notePower)
      activeNotes[channel].set(data0, noteStack)
      channelNotePower[channel] += notePower
      fallbackNotePower += notePower
      velocitySum += data1
      noteCount += 1
      continue
    }

    if (isNoteOff) {
      const noteStack = activeNotes[channel].get(data0)
      if (!noteStack?.length) continue
      const notePower = noteStack.shift()
      channelNotePower[channel] = Math.max(0, channelNotePower[channel] - notePower)
      if (noteStack.length) activeNotes[channel].set(data0, noteStack)
      else activeNotes[channel].delete(data0)
    }
  }

  if (!noteCount) return null
  const meanPower = activeTicks > 0
    ? weightedPower / activeTicks
    : fallbackNotePower / noteCount
  if (!Number.isFinite(meanPower) || meanPower <= 0) return null

  const midiRms = Math.sqrt(meanPower)
  const estimatedInputDb = config.renderedReferenceDb + 20 * Math.log10(midiRms)
  const gainDb = clamp(
    config.targetDb - estimatedInputDb,
    config.minGainDb,
    config.maxGainDb,
  )

  return {
    gainDb,
    estimatedInputDb,
    midiRms,
    averageVelocity: velocitySum / noteCount,
    noteCount,
  }
}

export {
  MIDI_GAIN_ESTIMATOR_DEFAULTS,
  collectVolumeEvents,
  estimateMidiInitialGainDb,
}
