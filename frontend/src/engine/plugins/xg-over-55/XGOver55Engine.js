import { BasicMIDI, MIDIMessage } from 'spessasynth_core'
import { detectDrumChannels, detectMidiStandard, MIDI_STANDARDS } from '../../MidiStandardDetector.js'
import { createSmfKnifeConverter, parseSmfKnifeConfig } from '../../converters/SmfKnifeConverter.js'
import xgSc55CfgText from '../../smf/xg/XGSC55.CFG?raw'

const XG_OVER_55_VERSION = 1
const MODERATE_DRUM_BOOSTS = new Map([
  [35, 14], [36, 14],
  [38, 11], [39, 11], [40, 11],
  [41, 8], [43, 8], [45, 8], [47, 8], [48, 8], [50, 8],
  [42, 6], [44, 6], [46, 6],
  [49, 5], [51, 5], [52, 5], [53, 5], [55, 5], [57, 5], [59, 5],
])
const NATURAL_DRUM_PROGRAMS = new Set([40, 41, 48])
const XG_MASTER_PARAMETERS = new Set([0, 4, 5, 6, 126, 127])
const XG_PART_PARAMETERS = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14,
  18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 35,
])
const XG_DRUM_PARAMETERS = new Set([0, 1, 2, 3, 4, 5, 6, 9, 10])

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

function isSupportedNativeXgSysex(data) {
  if (!data?.length) return null
  const offset = data[0] === 0xf0 ? 1 : 0
  if (data[offset] !== 0x43 || (data[offset + 1] & 0xf0) !== 0x10 || data[offset + 2] !== 0x4c) {
    return null
  }
  const address1 = data[offset + 3]
  const address2 = data[offset + 4]
  const address3 = data[offset + 5]
  if (address1 === 0 && address2 === 0) return XG_MASTER_PARAMETERS.has(address3)
  if (address1 === 8) return XG_PART_PARAMETERS.has(address3)
  if ((address1 >> 4) === 3) return XG_DRUM_PARAMETERS.has(address3)
  return address1 === 6 || address1 === 7
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
  let filteredXgSysexCount = 0
  const initialDrumChannels = options.initialDrumChannels || (buffer ? detectDrumChannels(buffer) : null)
  const base = createSmfKnifeConverter(getConfig(), {
    ...options,
    preserveDrumDynamics: true,
    ignoreEq: true,
    ignoreFx: xgEffectProfile !== 'compatible',
    initialDrumChannels,
    mapDrumVelocity: (velocity, note, state, channel) =>
      balanceDrumVelocity(velocity, note, state, channel, drumBalanceProfile),
    detectDrumPartSysex: detectXgDrumPart,
    filterSysex: (data) => {
      const supported = isSupportedNativeXgSysex(data)
      if (xgEffectProfile === 'compatible' && supported === false) {
        filteredXgSysexCount += 1
        return false
      }
      return true
    },
  })
  const mapper = (event) => base(event)
  mapper.reset = () => {
    filteredXgSysexCount = 0
    base.reset()
  }
  mapper.setEnabled = (value) => base.setEnabled(value)
  mapper.setPreferGsPlayback = () => {}
  mapper.getState = () => ({
    ...base.getState(),
    detectedStandard: MIDI_STANDARDS.XG,
    mappingVersion: XG_OVER_55_VERSION,
    xgEffectProfile,
    drumBalanceProfile,
    filteredXgSysexCount,
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
      drumChannels: new Uint8Array(16),
      filteredXgSysexCount: 0,
    }
  }
  const midi = BasicMIDI.fromArrayBuffer(buffer, options.fileName)
  const mapper = createXGOver55EventMapper(buffer, options)
  const replacements = Array.from({ length: midi.tracks.length }, () => [])

  for (const entry of midi.timeline) {
    const sourceEvent = midi.tracks[entry.tr].events[entry.ev]
    const decoded = decodeMessage(sourceEvent)
    if (!decoded) continue
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
  return {
    buffer: midi.writeMIDI(),
    conversionApplied: true,
    telemetry,
    state,
    conversionMs: nowMs() - startedAt,
    version: XG_OVER_55_VERSION,
    drumChannels: Uint8Array.from(state.drumChannels),
    filteredXgSysexCount: state.filteredXgSysexCount,
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
