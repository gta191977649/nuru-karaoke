import { BasicMIDI, MIDIMessage } from 'spessasynth_core'
import { detectMidiStandard, MIDI_STANDARDS } from '../../MidiStandardDetector.js'
import { buildTelemetry } from '../../midiTelemetry.js'
import { SC55_MELODIC_PRESETS, SC55_SOUNDFONT_SHA256 } from './data/sc55Presets.generated.js'

const GS_OVER_55_VERSION = 1
const PRESETS_BY_PROGRAM = new Map()
for (const preset of SC55_MELODIC_PRESETS) {
  const list = PRESETS_BY_PROGRAM.get(preset.program) || []
  list.push(preset)
  PRESETS_BY_PROGRAM.set(preset.program, list)
}
for (const list of PRESETS_BY_PROGRAM.values()) list.sort((a, b) => a.bank - b.bank)

const clamp7 = (value) => Math.max(0, Math.min(127, Math.round(Number(value) || 0)))
const nowMs = () => typeof performance !== 'undefined' ? performance.now() : Date.now()

export function resolveSc55GsTone(bank, program) {
  const sourceBank = clamp7(bank)
  const sourceProgram = clamp7(program)
  const available = PRESETS_BY_PROGRAM.get(sourceProgram) || []
  const exact = available.find((preset) => preset.bank === sourceBank)
  if (exact) return { ...exact, exact: true, reason: 'exact' }

  const capital = available.find((preset) => preset.bank === 0)
  if (sourceBank === 126 || sourceBank === 127) {
    return capital
      ? { ...capital, exact: false, reason: sourceBank === 126 ? 'cm-32p-capital-fallback' : 'mt-32-capital-fallback' }
      : null
  }

  const lower = available.filter((preset) => preset.bank <= sourceBank).at(-1)
  const target = lower || capital || available[0]
  return target ? { ...target, exact: false, reason: target.bank === 0 ? 'capital-fallback' : 'alternate-voice-fallback' } : null
}

function gsPartMode(data) {
  const bytes = Array.from(data || [])
  const offset = bytes[0] === 0xf0 ? 1 : 0
  if (bytes[offset] !== 0x41 || bytes[offset + 2] !== 0x42 || bytes[offset + 3] !== 0x12) return null
  const addr1 = bytes[offset + 4]
  const addr2 = bytes[offset + 5]
  const addr3 = bytes[offset + 6]
  if ((addr1 !== 0x40 && addr1 !== 0x50) || addr3 !== 0x15 || (addr2 & 0xf0) !== 0x10) return null
  let channel = -1
  if (addr2 === 0x10) channel = 9
  else if (addr2 >= 0x11 && addr2 <= 0x19) channel = addr2 - 0x11
  else if (addr2 >= 0x1a && addr2 <= 0x1f) channel = addr2 - 0x10
  if (addr1 === 0x50) channel += 16
  if (channel < 0 || channel > 15) return null
  return { channel, isDrum: bytes[offset + 7] !== 0 }
}

function isGsReset(data) {
  const bytes = Array.from(data || [])
  const offset = bytes[0] === 0xf0 ? 1 : 0
  return bytes[offset] === 0x41 && bytes[offset + 2] === 0x42 && bytes[offset + 3] === 0x12 &&
    bytes[offset + 4] === 0x40 && bytes[offset + 5] === 0 && bytes[offset + 6] === 0x7f
}

function decodeMessage(message) {
  const status = Number(message.statusByte)
  const data = message.data || []
  if (status === 0xf0 || status === 0xf7) return { type: 'sysex', data: Uint8Array.from([0xf0, ...data]) }
  if (status < 0x80 || status >= 0xf0) return null
  const channel = status & 0x0f
  switch (status & 0xf0) {
    case 0x80: return { type: 'note_off', channel, note: data[0], velocity: data[1] }
    case 0x90: return { type: 'note_on', channel, note: data[0], velocity: data[1] }
    case 0xa0: return { type: 'poly_pressure', channel, note: data[0], value: data[1] }
    case 0xb0: return { type: 'cc', channel, controller: data[0], value: data[1] }
    case 0xc0: return { type: 'program', channel, value: data[0] }
    case 0xd0: return { type: 'channel_pressure', channel, value: data[0] }
    case 0xe0: return { type: 'pitch', channel, value: (data[1] << 7) | data[0] }
    default: return null
  }
}

function encodeMessage(event, ticks) {
  const channel = Number(event.channel) & 0x0f
  switch (event.type) {
    case 'note_off': return new MIDIMessage(ticks, 0x80 | channel, Uint8Array.from([event.note, event.velocity]))
    case 'note_on': return new MIDIMessage(ticks, 0x90 | channel, Uint8Array.from([event.note, event.velocity]))
    case 'poly_pressure': return new MIDIMessage(ticks, 0xa0 | channel, Uint8Array.from([event.note, event.value]))
    case 'cc': return new MIDIMessage(ticks, 0xb0 | channel, Uint8Array.from([event.controller, event.value]))
    case 'program': return new MIDIMessage(ticks, 0xc0 | channel, Uint8Array.from([event.value]))
    case 'channel_pressure': return new MIDIMessage(ticks, 0xd0 | channel, Uint8Array.from([event.value]))
    case 'pitch': return MIDIMessage.pitchWheel(ticks, channel, event.value)
    case 'sysex': {
      const bytes = Array.from(event.data || [])
      return MIDIMessage.systemExclusive(ticks, bytes[0] === 0xf0 ? bytes.slice(1) : bytes)
    }
    default: return null
  }
}

export function createGSOver55EventMapper(buffer, options = {}) {
  const gsToneProfile = options.gsToneProfile === 'passthrough' ? 'passthrough' : 'compatible'
  const bankMSB = new Uint8Array(16)
  const bankLSB = new Uint8Array(16)
  const program = new Uint8Array(16)
  const drumChannels = new Uint8Array(16)
  const explicitPartMode = new Int8Array(16).fill(-1)
  const legacyPrevented = new Uint8Array(16)
  const translationTimeline = []
  drumChannels[9] = 1
  let enabled = true
  const stats = {
    gsExactToneCount: 0,
    gsVariationFallbackCount: 0,
    gsLegacyMapFallbackCount: 0,
    gsDrumMisclassificationPreventedCount: 0,
  }

  const resetChannelState = () => {
    bankMSB.fill(0); bankLSB.fill(0); program.fill(0)
    drumChannels.fill(0); drumChannels[9] = 1
    explicitPartMode.fill(-1); legacyPrevented.fill(0)
  }
  const reset = () => {
    resetChannelState()
    translationTimeline.length = 0
    Object.keys(stats).forEach((key) => { stats[key] = 0 })
  }

  const mapper = (event) => {
    if (!event || !enabled || gsToneProfile === 'passthrough') return event ? [event] : []
    if (event.type === 'sysex') {
      if (isGsReset(event.data)) resetChannelState()
      const mode = gsPartMode(event.data)
      if (mode) {
        explicitPartMode[mode.channel] = mode.isDrum ? 1 : 0
        drumChannels[mode.channel] = mode.isDrum ? 1 : 0
      }
      return [event]
    }
    const channel = Number(event.channel) & 0x0f
    if (event.type === 'cc' && (event.controller === 0 || event.controller === 32)) {
      if (event.controller === 0) {
        bankMSB[channel] = clamp7(event.value)
        if (!drumChannels[channel] && (bankMSB[channel] === 126 || bankMSB[channel] === 127) && !legacyPrevented[channel]) {
          legacyPrevented[channel] = 1
          stats.gsDrumMisclassificationPreventedCount += 1
        }
      } else bankLSB[channel] = clamp7(event.value)
      return drumChannels[channel] ? [event] : []
    }
    if (event.type !== 'program') return [event]
    program[channel] = clamp7(event.value)
    if (drumChannels[channel]) return [event]

    const sourceBank = bankMSB[channel]
    const target = resolveSc55GsTone(sourceBank, program[channel]) || resolveSc55GsTone(0, program[channel])
    if (!target) return [event]
    if (target.exact) stats.gsExactToneCount += 1
    else if (sourceBank === 126 || sourceBank === 127) stats.gsLegacyMapFallbackCount += 1
    else stats.gsVariationFallbackCount += 1
    translationTimeline.push({
      time: Math.max(0, Number(event.time) || 0),
      kind: target.exact ? 'gs-tone-exact' : 'gs-tone-fallback',
      channel,
      source: `GS B${sourceBank} P${program[channel] + 1}`,
      target: `${target.name} (B${target.bank} P${target.program + 1})`,
      sourceBankMSB: sourceBank,
      sourceBankLSB: bankLSB[channel],
      sourceProgram: program[channel],
      targetBankMSB: target.bank,
      targetBankLSB: 0,
      targetProgram: target.program,
      reason: target.reason,
    })
    return [
      { type: 'cc', channel, controller: 0, value: target.bank },
      { type: 'cc', channel, controller: 32, value: 0 },
      { type: 'program', channel, value: target.program },
    ]
  }
  mapper.reset = reset
  mapper.setEnabled = (value) => { enabled = Boolean(value) }
  mapper.setPreferGsPlayback = () => {}
  mapper.getState = () => ({
    globalMode: MIDI_STANDARDS.GS,
    detectedStandard: MIDI_STANDARDS.GS,
    detectedBy: 'auto-detect',
    configName: 'GSOver55 Compatible',
    conversionEngine: 'gs-over-55',
    mappingVersion: GS_OVER_55_VERSION,
    soundFontRevision: SC55_SOUNDFONT_SHA256,
    gsToneProfile,
    bankMSB,
    bankLSB,
    program,
    drumChannels,
    translationTimeline,
    ...stats,
  })
  return mapper
}

export function convertGsMidiBuffer(buffer, options = {}) {
  const startedAt = nowMs()
  if (!GSOver55Engine.canHandle(buffer)) {
    return { buffer, conversionApplied: false, telemetry: null, state: null, conversionMs: 0, version: GS_OVER_55_VERSION }
  }
  const midi = BasicMIDI.fromArrayBuffer(buffer, options.fileName)
  const mapper = createGSOver55EventMapper(buffer, options)
  const replacements = Array.from({ length: midi.tracks.length }, () => [])
  for (const entry of midi.timeline) {
    const sourceEvent = midi.tracks[entry.tr].events[entry.ev]
    const decoded = decodeMessage(sourceEvent)
    if (!decoded) continue
    decoded.time = midi.midiTicksToSeconds(sourceEvent.ticks)
    const events = mapper(decoded).map((event) => encodeMessage(event, sourceEvent.ticks)).filter(Boolean)
    replacements[entry.tr].push({ index: entry.ev, events })
  }
  replacements.forEach((items, trackIndex) => {
    const track = midi.tracks[trackIndex]
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const replacement = items[index]
      track.deleteEvent(replacement.index)
      if (replacement.events.length) track.addEvents(replacement.index, ...replacement.events)
    }
  })
  midi.flush(true)
  const state = mapper.getState()
  const telemetry = buildTelemetry(midi)
  telemetry.translationTimeline = state.translationTimeline
  return {
    buffer: midi.writeMIDI(),
    conversionApplied: true,
    telemetry,
    state,
    conversionMs: nowMs() - startedAt,
    version: GS_OVER_55_VERSION,
    drumChannels: Uint8Array.from(state.drumChannels),
    gsExactToneCount: state.gsExactToneCount,
    gsVariationFallbackCount: state.gsVariationFallbackCount,
    gsLegacyMapFallbackCount: state.gsLegacyMapFallbackCount,
    gsDrumMisclassificationPreventedCount: state.gsDrumMisclassificationPreventedCount,
  }
}

export class GSOver55Engine {
  constructor() {
    this.worker = null
    this.pending = new Map()
    this.nextRequestId = 1
  }
  static canHandle(buffer) {
    try { return Boolean(buffer) && detectMidiStandard(buffer).standard === MIDI_STANDARDS.GS } catch { return false }
  }
  canHandle(buffer) { return GSOver55Engine.canHandle(buffer) }
  createEventMapper(buffer, options = {}) { return createGSOver55EventMapper(buffer, options) }
  async convert(buffer, options = {}) {
    if (typeof Worker === 'undefined') return convertGsMidiBuffer(buffer, options)
    if (!this.worker) {
      this.worker = new Worker(new URL('./gsOver55.worker.js', import.meta.url), { type: 'module' })
      this.worker.onmessage = ({ data }) => {
        const pending = this.pending.get(data.id)
        if (!pending) return
        this.pending.delete(data.id)
        if (data.error) pending.reject(new Error(data.error)); else pending.resolve(data.result)
      }
      this.worker.onerror = (event) => {
        const error = new Error(event.message || 'GSOver55 worker failed')
        for (const pending of this.pending.values()) pending.reject(error)
        this.pending.clear(); this.worker?.terminate(); this.worker = null
      }
    }
    const id = this.nextRequestId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ id, buffer, options }, [buffer])
    })
  }
  dispose() {
    this.worker?.terminate(); this.worker = null
    const error = new Error('GSOver55 engine disposed')
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}

export { GS_OVER_55_VERSION }
