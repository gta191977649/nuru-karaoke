import { BasicMIDI, MIDIMessage } from 'spessasynth_core'
import { detectDrumChannels, detectMidiStandard, MIDI_STANDARDS } from '../../MidiStandardDetector.js'
import { createSmfKnifeConverter, parseSmfKnifeConfig } from '../../converters/SmfKnifeConverter.js'
import xgSc55CfgText from '../../smf/xg/XGSC55.CFG?raw'
import {
  MIDI_DB_REVISION,
  XG_DRUM_KITS,
  XG_SYSEX_NAMES,
  XG_VOICES,
} from './data/midiDb.generated.js'

const XG_OVER_55_VERSION = 2
const MODERATE_DRUM_BOOSTS = new Map([
  [35, 14], [36, 14],
  [38, 11], [39, 11], [40, 11],
  [41, 8], [43, 8], [45, 8], [47, 8], [48, 8], [50, 8],
  [42, 6], [44, 6], [46, 6],
  [49, 5], [51, 5], [52, 5], [53, 5], [55, 5], [57, 5], [59, 5],
])
const NATURAL_DRUM_PROGRAMS = new Set([40, 41, 48, 82, 85])
const XG_MASTER_PARAMETERS = new Set([0, 4, 5, 6, 126, 127])
const XG_PART_PARAMETERS = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14,
  18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 35,
])
const XG_DRUM_PARAMETERS = new Set([0, 1, 2, 3, 4, 5, 6, 9, 10])
const CONFIGURED_DRUM_PROGRAMS = new Set([
  0, 1, 2, 3, 5, 6, 7, 8, 9, 16, 17, 24, 25, 26, 27, 28, 29, 30, 31,
  32, 33, 40, 41, 48, 64, 65, 66,
])
const DRUM_PROFILE_ALIASES = new Map()

function registerDrumProfile(profile, programs) {
  for (const program of programs) DRUM_PROFILE_ALIASES.set(program, profile)
}

registerDrumProfile(0, [0, 1, 2, 3, 4, 5, 6, 56, 57, 80, 83, 86, 89, 91])
registerDrumProfile(8, [8, 9])
registerDrumProfile(16, [16, 17, 87, 88, 90, 113])
registerDrumProfile(24, [7, 24, 27, 28, 29, 30, 31, 60, 61, 68, 69, 70, 71, 72, 73, 112])
registerDrumProfile(25, [25, 26, 58, 59, 64, 65, 66])
registerDrumProfile(32, [32, 33, 75, 81, 84])
registerDrumProfile(40, [40, 41, 82, 85])
registerDrumProfile(48, [48])

const DRUM_PROFILE_NAMES = Object.freeze({
  0: 'SC-55 Standard',
  8: 'SC-55 Room',
  16: 'SC-55 Power',
  24: 'SC-55 Electronic',
  25: 'SC-55 TR-808',
  32: 'SC-55 Jazz',
  40: 'SC-55 Brush',
  48: 'SC-55 Orchestra',
})

let parsedConfig = null

function getConfig() {
  parsedConfig ||= parseSmfKnifeConfig(xgSc55CfgText, { name: 'XGSC55.CFG' })
  return parsedConfig
}

function clamp7bit(value) {
  return Math.max(0, Math.min(127, Math.round(Number(value) || 0)))
}

function balanceDrumVelocity(velocity, note, state, channel, profile) {
  const input = clamp7bit(velocity)
  if (profile !== 'moderate' || input === 0) return input
  const sourceBank = state.activeDrumKits[channel]?.srcMSB ?? state.bankMSB[channel]
  if (sourceBank !== 127 || NATURAL_DRUM_PROGRAMS.has(state.program[channel])) return input
  const maxBoost = MODERATE_DRUM_BOOSTS.get(clamp7bit(note)) || 0
  if (!maxBoost || input >= 118) return input
  const taper = Math.max(0, Math.min(1, (118 - input) / 88))
  return Math.max(1, clamp7bit(input + Math.round(maxBoost * taper)))
}

function readXgSysexAddress(data) {
  if (!data?.length) return null
  const offset = data[0] === 0xf0 ? 1 : 0
  if (data[offset] !== 0x43 || (data[offset + 1] & 0xf0) !== 0x10 || data[offset + 2] !== 0x4c) {
    return null
  }
  return {
    offset,
    address1: data[offset + 3],
    address2: data[offset + 4],
    address3: data[offset + 5],
    value: data[offset + 6],
  }
}

function sysexParameterName(group, value) {
  return XG_SYSEX_NAMES[group]?.[Number(value).toString(16).padStart(2, '0')] || null
}

function describeXgSysex(data) {
  const address = readXgSysexAddress(data)
  if (!address) return null
  const { address1, address2, address3 } = address
  if (address1 === 0 && address2 === 0) {
    const name = sysexParameterName('master', address3)
    return { ...address, action: XG_MASTER_PARAMETERS.has(address3) ? 'native' : 'filter', known: Boolean(name), path: `system.master.${name || `0x${address3.toString(16)}`}` }
  }
  if (address1 === 2 && address2 === 1) {
    const name = sysexParameterName('effect', address3)
    // The address being documented does not mean the target can implement it.
    // Exact CFG matches run before this filter and are counted as conversions.
    return { ...address, action: 'filter', known: Boolean(name), path: `effect.global.${name || `0x${address3.toString(16)}`}` }
  }
  if (address1 === 8) {
    const name = sysexParameterName('part', address3)
    return { ...address, action: XG_PART_PARAMETERS.has(address3) ? 'native' : 'filter', known: Boolean(name), path: `part${address2 + 1}.${name || `0x${address3.toString(16)}`}` }
  }
  if ((address1 >> 4) === 3) {
    const name = sysexParameterName('drum', address3)
    return { ...address, action: XG_DRUM_PARAMETERS.has(address3) ? 'native' : 'filter', known: Boolean(name), path: `drumSet${(address1 & 0x0f) + 1}.note${address2}.${name || `0x${address3.toString(16)}`}` }
  }
  if (address1 === 6 || address1 === 7) {
    return { ...address, action: 'native', known: true, path: address1 === 6 ? 'display.letter' : 'display.bitmap' }
  }
  return { ...address, action: 'filter', known: false, path: `model4c.${address1.toString(16)}.${address2.toString(16)}.${address3.toString(16)}` }
}

function getXgVoiceName(msb, lsb, program) {
  return XG_VOICES[`${msb}:${lsb}:${program}`]?.[0] || `XG ${msb}:${lsb}:${program + 1}`
}

function resolveMelodicVoice(msb, lsb, program) {
  const sourceName = getXgVoiceName(msb, lsb, program)
  if (msb === 0 && lsb === 0) {
    return { bankMSB: 0, bankLSB: 0, program, exact: true, sourceName, targetName: `SC-55 Capital ${program + 1}` }
  }
  if (msb === 0 && lsb === 3 && program === 1) {
    return { bankMSB: 0, bankLSB: 8, program, exact: true, sourceName, targetName: 'SC-55 Piano 2w' }
  }
  if (msb === 0 && lsb === 3 && program === 6) {
    return { bankMSB: 0, bankLSB: 16, program, exact: true, sourceName, targetName: 'SC-55 Harpsichord w' }
  }
  if (msb === 64) {
    const targetProgram = Math.max(120, Math.min(127, 120 + Math.floor(program / 16)))
    return { bankMSB: 0, bankLSB: 0, program: targetProgram, exact: false, sourceName, targetName: `SC-55 GM SFX ${targetProgram + 1}` }
  }
  return { bankMSB: 0, bankLSB: 0, program, exact: false, sourceName, targetName: `SC-55 Capital ${program + 1}` }
}

function createCcEvent(channel, controller, value) {
  return { type: 'cc', channel, controller, value: clamp7bit(value) }
}

function createProgramEvent(channel, value) {
  return { type: 'program', channel, value: clamp7bit(value) }
}

function detectXgDrumPart(data) {
  if (!data?.length) return null
  const offset = data[0] === 0xf0 ? 1 : 0
  if (data[offset] !== 0x43 || (data[offset + 1] & 0xf0) !== 0x10 || data[offset + 2] !== 0x4c ||
    data[offset + 3] !== 0x08 || data[offset + 5] !== 0x07) return null
  const channel = data[offset + 4]
  if (channel < 0 || channel > 15) return null
  return { channel, isDrum: data[offset + 6] !== 0, label: '[XG Drum]' }
}

function decodeMessage(message) {
  const status = Number(message.statusByte)
  const data = message.data || []
  if (status === 0xf0 || status === 0xf7) {
    return { type: 'sysex', data: Uint8Array.from([0xf0, ...data]) }
  }
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

function buildTelemetry(midi) {
  const activity = Array.from({ length: 16 }, () => ({ times: [], velocities: [] }))
  const activeNotes = Array.from({ length: 16 }, () => new Uint16Array(128))
  const patchState = Array.from({ length: 16 }, () => ({ program: 0, bankMSB: 0, bankLSB: 0 }))
  const polyphonyTimes = []
  const polyphonyCounts = []
  const patchChanges = []
  let polyphony = 0

  for (const entry of midi.timeline) {
    const event = midi.tracks[entry.tr].events[entry.ev]
    const status = Number(event.statusByte)
    if (status < 0x80 || status >= 0xf0) continue
    const type = status & 0xf0
    const channel = status & 0x0f
    const time = midi.midiTicksToSeconds(event.ticks)
    if (type === 0x90 && event.data[1] > 0) {
      activity[channel].times.push(time)
      activity[channel].velocities.push(event.data[1])
      activeNotes[channel][event.data[0]] += 1
      polyphony += 1
      polyphonyTimes.push(time)
      polyphonyCounts.push(polyphony)
    } else if (type === 0x80 || (type === 0x90 && event.data[1] === 0)) {
      const note = event.data[0]
      if (activeNotes[channel][note] > 0) {
        activeNotes[channel][note] -= 1
        polyphony = Math.max(0, polyphony - 1)
        polyphonyTimes.push(time)
        polyphonyCounts.push(polyphony)
      }
    } else if (type === 0xb0 && (event.data[0] === 0 || event.data[0] === 32)) {
      const patch = patchState[channel]
      if (event.data[0] === 0) patch.bankMSB = event.data[1]
      else patch.bankLSB = event.data[1]
      patchChanges.push({ time, channel, ...patch })
    } else if (type === 0xc0) {
      const patch = patchState[channel]
      patch.program = event.data[0]
      patchChanges.push({ time, channel, ...patch })
    }
  }

  return {
    activity: activity.map((channel) => ({
      times: Float32Array.from(channel.times),
      velocities: Uint8Array.from(channel.velocities),
    })),
    polyphonyTimes: Float32Array.from(polyphonyTimes),
    polyphonyCounts: Uint16Array.from(polyphonyCounts),
    patchChanges,
  }
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export function createXGOver55EventMapper(buffer, options = {}) {
  const drumBalanceProfile = options.drumBalanceProfile === 'off' ? 'off' : 'moderate'
  const xgEffectProfile = options.xgEffectProfile === 'passthrough' ? 'passthrough' : 'compatible'
  const xgVoiceProfile = options.xgVoiceProfile === 'passthrough' ? 'passthrough' : 'conservative'
  const sourceBankMSB = new Int16Array(16)
  const sourceBankLSB = new Int16Array(16)
  const translationTimeline = []
  const stats = {
    voiceExactCount: 0,
    voiceFallbackCount: 0,
    drumAliasCount: 0,
    nativeXgSysexCount: 0,
    convertedXgSysexCount: 0,
    filteredXgSysexCount: 0,
    unknownXgSysexCount: 0,
  }
  let enabled = true
  let activeEvent = null
  const initialDrumChannels = options.initialDrumChannels || (buffer ? detectDrumChannels(buffer) : null)

  const recordTranslation = (event, source, target, kind) => {
    translationTimeline.push({
      time: Math.max(0, Number(event?.time) || 0),
      source,
      target,
      kind,
    })
  }

  const resetPluginState = () => {
    sourceBankMSB.fill(0)
    sourceBankLSB.fill(0)
    sourceBankMSB[9] = 127
    translationTimeline.length = 0
    Object.keys(stats).forEach((key) => { stats[key] = 0 })
  }

  const base = createSmfKnifeConverter(getConfig(), {
    ...options,
    preserveDrumDynamics: true,
    ignoreEq: true,
    ignoreFx: xgEffectProfile !== 'compatible',
    initialDrumChannels,
    mapDrumVelocity: (velocity, note, state, channel) =>
      balanceDrumVelocity(velocity, note, state, channel, drumBalanceProfile),
    detectDrumPartSysex: detectXgDrumPart,
    resolveDrumKitSource: (bankMSB, bankLSB, program) => {
      if (bankMSB !== 127 || CONFIGURED_DRUM_PROGRAMS.has(program)) return null
      const aliasedProgram = DRUM_PROFILE_ALIASES.get(program) ?? 0
      stats.drumAliasCount += 1
      const sourceName = XG_DRUM_KITS[`${bankLSB}:${program}`] || `XG Kit ${program}`
      recordTranslation(activeEvent, sourceName, DRUM_PROFILE_NAMES[aliasedProgram], 'drum-alias')
      return { bankMSB: 127, bankLSB: 0, program: aliasedProgram }
    },
    filterSysex: (data) => {
      const description = describeXgSysex(data)
      return !(xgEffectProfile === 'compatible' && description?.action === 'filter')
    },
  })
  // XG System On defines part 10 as a drum part even when the SMF omits the
  // otherwise-redundant CC0=127 bank select.
  sourceBankMSB[9] = 127
  base(createCcEvent(9, 0, 127))

  const mapMelodicProgram = (event, channel, program) => {
    const resolved = resolveMelodicVoice(sourceBankMSB[channel], sourceBankLSB[channel], program)
    if (resolved.exact) stats.voiceExactCount += 1
    else stats.voiceFallbackCount += 1
    recordTranslation(event, resolved.sourceName, resolved.targetName, resolved.exact ? 'voice-exact' : 'voice-fallback')
    return [
      createCcEvent(channel, 0, resolved.bankMSB),
      createCcEvent(channel, 32, resolved.bankLSB),
      createProgramEvent(channel, resolved.program),
    ]
  }

  const mapPartSetupVoiceSysex = (event, description) => {
    const channel = description.address2
    const parameter = description.address3
    const value = clamp7bit(description.value)
    if (channel < 0 || channel > 15 || ![1, 2, 3].includes(parameter)) return null
    stats.convertedXgSysexCount += 1
    if (parameter === 1) {
      sourceBankMSB[channel] = value
      base(createCcEvent(channel, 0, value))
      recordTranslation(event, description.path, `SOURCE BANK MSB ${value}`, 'part-state')
      return []
    }
    if (parameter === 2) {
      sourceBankLSB[channel] = value
      base(createCcEvent(channel, 32, value))
      recordTranslation(event, description.path, `SOURCE BANK LSB ${value}`, 'part-state')
      return []
    }
    const mapped = base(createProgramEvent(channel, value))
    if (base.getState().drumChannels[channel]) {
      recordTranslation(event, description.path, `DRUM PROGRAM ${mapped.at(-1)?.value ?? value}`, 'part-program')
      return mapped
    }
    return mapMelodicProgram(event, channel, value)
  }

  const mapper = (event) => {
    if (!enabled || !event) return base(event)
    activeEvent = event

    if (event.type === 'sysex') {
      const description = describeXgSysex(event.data)
      if (!description) return base(event)

      const resetsXg = description.address1 === 0 && description.address2 === 0 &&
        (description.address3 === 126 || description.address3 === 127)
      if (resetsXg) {
        sourceBankMSB.fill(0)
        sourceBankLSB.fill(0)
        sourceBankMSB[9] = 127
      }

      if (xgVoiceProfile === 'conservative' && description.address1 === 8 &&
        [1, 2, 3].includes(description.address3)) {
        return mapPartSetupVoiceSysex(event, description)
      }

      const mapped = base(event)
      if (resetsXg) base(createCcEvent(9, 0, 127))
      if (mapped.length === 0) {
        stats.filteredXgSysexCount += 1
        if (!description.known) stats.unknownXgSysexCount += 1
        recordTranslation(event, description.path, 'FILTERED // UNSUPPORTED', description.known ? 'sysex-filtered' : 'sysex-unknown')
      } else {
        const outputDescription = describeXgSysex(mapped[0]?.data)
        if (!outputDescription) {
          stats.convertedXgSysexCount += 1
          recordTranslation(event, description.path, 'GS COMPATIBLE EFFECT', 'sysex-converted')
        } else {
          stats.nativeXgSysexCount += 1
          recordTranslation(event, description.path, 'NATIVE XG PASS', 'sysex-native')
        }
      }
      return mapped
    }

    if (event.type === 'cc' && (event.controller === 0 || event.controller === 32)) {
      const channel = event.channel
      if (event.controller === 0) sourceBankMSB[channel] = clamp7bit(event.value)
      else sourceBankLSB[channel] = clamp7bit(event.value)
      const mapped = base(event)
      if (xgVoiceProfile === 'conservative' && !base.getState().drumChannels[channel]) {
        return mapped.map((output) => output.type === 'cc' && (output.controller === 0 || output.controller === 32)
          ? { ...output, value: 0 }
          : output)
      }
      return mapped
    }

    if (event.type === 'program') {
      const channel = event.channel
      const program = clamp7bit(event.value)
      const mapped = base(event)
      if (xgVoiceProfile === 'conservative' && !base.getState().drumChannels[channel]) {
        return mapMelodicProgram(event, channel, program)
      }
      return mapped
    }

    return base(event)
  }
  mapper.reset = () => {
    resetPluginState()
    base.reset()
    base(createCcEvent(9, 0, 127))
  }
  mapper.setEnabled = (value) => {
    enabled = Boolean(value)
    base.setEnabled(value)
  }
  mapper.setPreferGsPlayback = () => {}
  mapper.getState = () => ({
    ...base.getState(),
    detectedStandard: MIDI_STANDARDS.XG,
    mappingVersion: XG_OVER_55_VERSION,
    midiDbRevision: MIDI_DB_REVISION,
    xgEffectProfile,
    xgVoiceProfile,
    drumBalanceProfile,
    ...stats,
    translationTimeline,
    conversionEngine: 'xg-over-55',
  })
  base.onStateChange = () => mapper.onStateChange?.(mapper.getState())
  return mapper
}

export function convertXgMidiBuffer(buffer, options = {}) {
  const startedAt = nowMs()
  if (!XGOver55Engine.canHandle(buffer)) {
    return {
      buffer,
      conversionApplied: false,
      telemetry: null,
      state: null,
      conversionMs: 0,
      version: XG_OVER_55_VERSION,
      midiDbRevision: MIDI_DB_REVISION,
      drumChannels: new Uint8Array(16),
      voiceExactCount: 0,
      voiceFallbackCount: 0,
      drumAliasCount: 0,
      nativeXgSysexCount: 0,
      convertedXgSysexCount: 0,
      filteredXgSysexCount: 0,
      unknownXgSysexCount: 0,
    }
  }
  const midi = BasicMIDI.fromArrayBuffer(buffer, options.fileName)
  const mapper = createXGOver55EventMapper(buffer, options)
  const replacements = Array.from({ length: midi.tracks.length }, () => [])

  for (const entry of midi.timeline) {
    const sourceEvent = midi.tracks[entry.tr].events[entry.ev]
    const decoded = decodeMessage(sourceEvent)
    if (!decoded) continue
    decoded.time = midi.midiTicksToSeconds(sourceEvent.ticks)
    const mapped = mapper(decoded)
    const events = mapped.map((event) => encodeMessage(event, sourceEvent.ticks)).filter(Boolean)
    replacements[entry.tr].push({ index: entry.ev, events })
  }
  replacements.forEach((trackReplacements, trackIndex) => {
    const track = midi.tracks[trackIndex]
    for (let i = trackReplacements.length - 1; i >= 0; i -= 1) {
      const replacement = trackReplacements[i]
      track.deleteEvent(replacement.index)
      if (replacement.events.length) track.addEvents(replacement.index, ...replacement.events)
    }
  })
  midi.flush(true)
  const telemetry = buildTelemetry(midi)
  const state = mapper.getState()
  telemetry.translationTimeline = state.translationTimeline
  return {
    buffer: midi.writeMIDI(),
    conversionApplied: true,
    telemetry,
    state,
    conversionMs: nowMs() - startedAt,
    version: XG_OVER_55_VERSION,
    midiDbRevision: MIDI_DB_REVISION,
    drumChannels: Uint8Array.from(state.drumChannels),
    voiceExactCount: state.voiceExactCount,
    voiceFallbackCount: state.voiceFallbackCount,
    drumAliasCount: state.drumAliasCount,
    nativeXgSysexCount: state.nativeXgSysexCount,
    convertedXgSysexCount: state.convertedXgSysexCount,
    filteredXgSysexCount: state.filteredXgSysexCount,
    unknownXgSysexCount: state.unknownXgSysexCount,
  }
}

export class XGOver55Engine {
  constructor() {
    this.worker = null
    this.pending = new Map()
    this.nextRequestId = 1
  }

  static canHandle(buffer) {
    try {
      return Boolean(buffer) && detectMidiStandard(buffer).standard === MIDI_STANDARDS.XG
    } catch {
      return false
    }
  }

  canHandle(buffer) {
    return XGOver55Engine.canHandle(buffer)
  }

  createEventMapper(buffer, options = {}) {
    return createXGOver55EventMapper(buffer, options)
  }

  async convert(buffer, options = {}) {
    if (typeof Worker === 'undefined') return convertXgMidiBuffer(buffer, options)
    if (!this.worker) {
      this.worker = new Worker(new URL('./xgOver55.worker.js', import.meta.url), { type: 'module' })
      this.worker.onmessage = ({ data }) => {
        const pending = this.pending.get(data.id)
        if (!pending) return
        this.pending.delete(data.id)
        if (data.error) pending.reject(new Error(data.error))
        else pending.resolve(data.result)
      }
      this.worker.onerror = (event) => {
        const error = new Error(event.message || 'XGOver55 worker failed')
        for (const pending of this.pending.values()) pending.reject(error)
        this.pending.clear()
        this.worker?.terminate()
        this.worker = null
      }
    }
    const id = this.nextRequestId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ id, buffer, options }, [buffer])
    })
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    const error = new Error('XGOver55 engine disposed')
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}

export { XG_OVER_55_VERSION, buildTelemetry }
