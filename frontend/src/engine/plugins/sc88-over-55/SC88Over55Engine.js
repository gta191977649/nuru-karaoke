import { BasicMIDI, MIDIMessage } from 'spessasynth_core'
import { detectMidiStandard, MIDI_STANDARDS } from '../../MidiStandardDetector.js'
import { buildTelemetry } from '../../midiTelemetry.js'
import { parseSmfKnifeConfig } from '../../converters/SmfKnifeConverter.js'
import sc88Sc55CfgText from '../../smf/88ish/SC88SC55.CFG?raw'
import { SC55_MELODIC_PRESETS, SC55_SOUNDFONT_SHA256 } from '../gs-over-55/data/sc55Presets.generated.js'
import { GS_VOICES, MIDI_DB_REVISION } from './data/midiDb.generated.js'

const SC88_OVER_55_VERSION = 1
const PART_COUNT = 32
const USER_TONE_BANKS = new Set([64, 65])
const USER_DRUM_PROGRAMS = new Set([64, 65])
const NATURAL_DRUM_PROGRAMS = new Set([40, 48, 56, 57])
const MODERATE_DRUM_BOOSTS = new Map([
  [35, 14], [36, 14], [38, 11], [39, 11], [40, 11],
  [41, 8], [43, 8], [45, 8], [47, 8], [48, 8], [50, 8],
  [42, 6], [44, 6], [46, 6],
  [49, 5], [51, 5], [52, 5], [53, 5], [55, 5], [57, 5], [59, 5],
])
const CURATED_TARGETS = new Map([
  ['2:8:0', 8], ['2:8:1', 8], ['2:8:2', 8], ['2:8:3', 8],
  ['2:8:11', 8], ['2:8:12', 8], ['2:16:6', 16],
  ['3:8:0', 8], ['3:8:1', 8], ['3:8:2', 8], ['3:8:3', 8],
  ['3:8:11', 8], ['3:8:12', 8], ['3:16:6', 16],
])

const cfg = parseSmfKnifeConfig(sc88Sc55CfgText, { name: 'SC88SC55.CFG' })
const targetByKey = new Map(SC55_MELODIC_PRESETS.map((preset) => [`${preset.bank}:${preset.program}`, preset]))
const sourceByProgram = new Map()
for (const [key, value] of Object.entries(GS_VOICES)) {
  const [map, bank, program] = key.split(':').map(Number)
  const index = `${map}:${program}`
  const list = sourceByProgram.get(index) || []
  list.push({ map, bank, program, name: value[0], level: value[1], compatibility: value[2] })
  sourceByProgram.set(index, list)
}
for (const list of sourceByProgram.values()) list.sort((a, b) => a.bank - b.bank)

const clamp7 = (value) => Math.max(0, Math.min(127, Math.round(Number(value) || 0)))
const nowMs = () => typeof performance !== 'undefined' ? performance.now() : Date.now()
const makeCc = (channel, controller, value) => ({ type: 'cc', channel, controller, value: clamp7(value) })
const makeProgram = (channel, value) => ({ type: 'program', channel, value: clamp7(value) })

function sourceMapNumber(map, sourceModule) {
  if (map === 1) return 0
  if (map === 2 || map === 3) return map
  return sourceModule === '88PRO' ? 3 : 2
}

function resolveSourceTone(map, bank, program, sourceModule) {
  const resolvedMap = sourceMapNumber(map, sourceModule)
  const list = sourceByProgram.get(`${resolvedMap}:${program}`) || []
  const exact = list.find((voice) => voice.bank === bank)
  if (exact) return { ...exact, requestedMap: map, requestedBank: bank, sourceExact: true }
  const lower = list.filter((voice) => voice.bank <= bank).at(-1)
  const capital = list.find((voice) => voice.bank === 0)
  const selected = lower || capital || list[0]
  return selected
    ? { ...selected, requestedMap: map, requestedBank: bank, sourceExact: false }
    : { map: resolvedMap, bank: 0, program, name: `GS Program ${program + 1}`, compatibility: '', requestedMap: map, requestedBank: bank, sourceExact: false }
}

export function resolveSc88Tone(map, bank, program, options = {}) {
  const profile = options.sc88ToneProfile === 'passthrough'
    ? 'passthrough'
    : options.sc88ToneProfile === 'conservative' ? 'conservative' : 'curated'
  const sourceModule = options.sourceModule === '88PRO' ? '88PRO' : '88'
  const source = resolveSourceTone(clamp7(map), clamp7(bank), clamp7(program), sourceModule)
  if (profile === 'passthrough') {
    return { source, bank: clamp7(bank), map: clamp7(map), program: clamp7(program), name: source.name, reason: 'passthrough', exact: true }
  }
  let targetBank = 0
  let reason = source.sourceExact ? 'capital-fallback' : 'source-variation-fallback'
  if (source.map === 0 && targetByKey.has(`${source.bank}:${program}`)) {
    targetBank = source.bank
    reason = 'sc55-exact'
  } else if (profile === 'curated') {
    const curatedBank = CURATED_TARGETS.get(`${source.map}:${source.bank}:${program}`)
    if (curatedBank !== undefined && targetByKey.has(`${curatedBank}:${program}`)) {
      targetBank = curatedBank
      reason = 'curated-shared-voice'
    }
  }
  const target = targetByKey.get(`${targetBank}:${program}`) || targetByKey.get(`0:${program}`)
  return {
    source,
    bank: target?.bank ?? 0,
    map: 1,
    program: target?.program ?? clamp7(program),
    name: target?.name || `Program ${program + 1}`,
    reason,
    exact: reason === 'sc55-exact',
    curated: reason === 'curated-shared-voice',
  }
}

function findDrumKit(msb, lsb, program) {
  return cfg.drums.find((kit) => kit.srcMSB === msb && kit.srcLSB === lsb && kit.srcProgram === program) ||
    cfg.drums.find((kit) => kit.srcLSB === lsb && kit.srcProgram === program) ||
    cfg.drums.find((kit) => kit.srcProgram === program) || null
}

function balanceVelocity(velocity, note, program, profile) {
  const input = clamp7(velocity)
  if (profile !== 'moderate' || input === 0 || input >= 118 || NATURAL_DRUM_PROGRAMS.has(program)) return input
  const maxBoost = MODERATE_DRUM_BOOSTS.get(clamp7(note)) || 0
  return clamp7(input + Math.round(maxBoost * Math.max(0, Math.min(1, (118 - input) / 88))))
}

function parseRoland(data) {
  const bytes = Array.from(data || [])
  const offset = bytes[0] === 0xf0 ? 1 : 0
  if (bytes[offset] !== 0x41 || bytes[offset + 2] !== 0x42 || bytes[offset + 3] !== 0x12) return null
  const end = bytes.at(-1) === 0xf7 ? bytes.length - 2 : bytes.length - 1
  return {
    bytes,
    offset,
    address1: bytes[offset + 4],
    address2: bytes[offset + 5],
    address3: bytes[offset + 6],
    values: bytes.slice(offset + 7, Math.max(offset + 7, end)),
  }
}

function sysexPart(address1, address2) {
  if ((address1 !== 0x40 && address1 !== 0x50) || (address2 & 0xf0) !== 0x10) return -1
  let channel = -1
  if (address2 === 0x10) channel = 9
  else if (address2 >= 0x11 && address2 <= 0x19) channel = address2 - 0x11
  else if (address2 >= 0x1a && address2 <= 0x1f) channel = address2 - 0x10
  return channel < 0 ? -1 : channel + (address1 === 0x50 ? 16 : 0)
}

function decodeMessage(message, port = 0) {
  const status = Number(message.statusByte)
  const data = message.data || []
  if (status === 0xf0 || status === 0xf7) return { type: 'sysex', data: Uint8Array.from([0xf0, ...data]), port }
  if (status < 0x80 || status >= 0xf0) return null
  const channel = status & 0x0f
  const logicalPart = Math.min(31, Math.max(0, port * 16 + channel))
  const common = { channel, port, logicalPart }
  switch (status & 0xf0) {
    case 0x80: return { ...common, type: 'note_off', note: data[0], velocity: data[1] }
    case 0x90: return { ...common, type: 'note_on', note: data[0], velocity: data[1] }
    case 0xa0: return { ...common, type: 'poly_pressure', note: data[0], value: data[1] }
    case 0xb0: return { ...common, type: 'cc', controller: data[0], value: data[1] }
    case 0xc0: return { ...common, type: 'program', value: data[0] }
    case 0xd0: return { ...common, type: 'channel_pressure', value: data[0] }
    case 0xe0: return { ...common, type: 'pitch', value: (data[1] << 7) | data[0] }
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

function buildPartTelemetry(midi) {
  const activity = Array.from({ length: PART_COUNT }, () => ({ times: [], velocities: [] }))
  const patchState = Array.from({ length: PART_COUNT }, () => ({ program: 0, bankMSB: 0, bankLSB: 0 }))
  const patchChanges = []
  const ports = new Uint8Array(midi.tracks.length)
  for (const entry of midi.timeline) {
    const event = midi.tracks[entry.tr].events[entry.ev]
    if (event.statusByte === 0x21) { ports[entry.tr] = event.data[0] || 0; continue }
    if (event.statusByte < 0x80 || event.statusByte >= 0xf0) continue
    const part = Math.min(31, ports[entry.tr] * 16 + (event.statusByte & 0x0f))
    const type = event.statusByte & 0xf0
    const time = midi.midiTicksToSeconds(event.ticks)
    if (type === 0x90 && event.data[1] > 0) {
      activity[part].times.push(time); activity[part].velocities.push(event.data[1])
    } else if (type === 0xb0 && (event.data[0] === 0 || event.data[0] === 32)) {
      if (event.data[0] === 0) patchState[part].bankMSB = event.data[1]
      else patchState[part].bankLSB = event.data[1]
      patchChanges.push({ time, logicalPart: part, port: Math.floor(part / 16), channel: part & 15, ...patchState[part] })
    } else if (type === 0xc0) {
      patchState[part].program = event.data[0]
      patchChanges.push({ time, logicalPart: part, port: Math.floor(part / 16), channel: part & 15, ...patchState[part] })
    }
  }
  return {
    partActivity: activity.map((part) => ({ times: Float32Array.from(part.times), velocities: Uint8Array.from(part.velocities) })),
    partPatchChanges: patchChanges,
  }
}

export function createSC88Over55EventMapper(options = {}) {
  const sourceModule = options.sourceModule === '88PRO' ? '88PRO' : '88'
  const sc88ToneProfile = options.sc88ToneProfile === 'passthrough'
    ? 'passthrough'
    : options.sc88ToneProfile === 'conservative' ? 'conservative' : 'curated'
  const sc88EffectProfile = ['strict', 'passthrough'].includes(options.sc88EffectProfile) ? options.sc88EffectProfile : 'compatible'
  const sc88UserDataProfile = options.sc88UserDataProfile === 'off' ? 'off' : 'safe'
  const drumBalanceProfile = options.drumBalanceProfile === 'off' ? 'off' : 'moderate'
  const bankMSB = new Uint8Array(PART_COUNT)
  const bankLSB = new Uint8Array(PART_COUNT)
  const program = new Uint8Array(PART_COUNT)
  const drumParts = new Uint8Array(PART_COUNT)
  const activeKits = Array.from({ length: PART_COUNT }, () => null)
  const noteCache = Array.from({ length: PART_COUNT }, () => Array.from({ length: 128 }, () => []))
  const userTones = Array.from({ length: 2 }, () => Array.from({ length: 128 }, () => ({ map: null, bank: null, program: null })))
  const userDrums = Array.from({ length: 2 }, () => Array.from({ length: 12 }, () => new Uint8Array(128)))
  const userDrumNames = ['', '']
  const translationTimeline = []
  const stats = {
    toneExactCount: 0, toneCuratedCount: 0, toneFallbackCount: 0,
    userToneResolvedCount: 0, userDrumMappedCount: 0,
    nativeGsSysexCount: 0, filteredGsSysexCount: 0, unknownGsSysexCount: 0,
  }
  let enabled = true

  const resetParts = () => {
    bankMSB.fill(0); bankLSB.fill(0); program.fill(0); drumParts.fill(0)
    drumParts[9] = 1; drumParts[25] = 1
    activeKits.fill(null)
    for (const part of noteCache) for (const stack of part) stack.length = 0
  }
  resetParts()

  const record = (event, source, target, kind, reason = '') => {
    const logicalPart = Number(event?.logicalPart ?? ((event?.port || 0) * 16 + (event?.channel || 0)))
    translationTimeline.push({
      time: Math.max(0, Number(event?.time) || 0), logicalPart,
      port: Math.floor(logicalPart / 16), channel: logicalPart & 15,
      source, target, kind, reason,
    })
  }

  const consumeUserData = (description) => {
    const { address1: a1, address2: a2, address3: a3, values } = description
    if (sc88UserDataProfile === 'off') return false
    if (a1 === 0x20) {
      const toneBank = (a2 >> 4) & 1; const parameter = a2 & 0x0f
      if (parameter <= 2 && values.length) {
        const tone = userTones[toneBank][a3]
        if (parameter === 0) tone.map = values[0]
        if (parameter === 1) tone.bank = values[0]
        if (parameter === 2) tone.program = values[0]
      }
      return true
    }
    if (a1 === 0x28) {
      const toneBank = a2 >= 0x10 ? 1 : 0; const parameter = a2 & 0x0f
      if (parameter <= 2) values.forEach((value, index) => {
        const tone = userTones[toneBank][index]
        if (parameter === 0) tone.map = value
        if (parameter === 1) tone.bank = value
        if (parameter === 2) tone.program = value
      })
      return true
    }
    if (a1 === 0x21) {
      const set = (a2 >> 4) & 1; const parameter = a2 & 0x0f
      if (parameter < 12 && values.length) userDrums[set][parameter][a3] = values[0]
      return true
    }
    if (a1 === 0x29) {
      const set = a2 >= 0x10 ? 1 : 0; const parameter = a2 & 0x0f
      if (parameter < 11) userDrums[set][parameter].set(values.slice(0, 128))
      else if (parameter === 11) userDrumNames[set] = String.fromCharCode(...values.slice(0, 12)).trim()
      return true
    }
    return false
  }

  const mapper = (event) => {
    if (!event) return []
    if (!enabled) return [event]
    if (event.type === 'sysex') {
      const gs = parseRoland(event.data)
      if (!gs) return [event]
      if (gs.address1 === 0x40 && gs.address2 === 0 && gs.address3 === 0x7f) resetParts()
      const part = sysexPart(gs.address1, gs.address2)
      if (part >= 0 && gs.address3 === 0x15) {
        drumParts[part] = gs.values[0] ? 1 : 0
        if (!drumParts[part]) activeKits[part] = null
      }
      if (consumeUserData(gs)) {
        if (sc88EffectProfile === 'passthrough') return [event]
        stats.filteredGsSysexCount += 1
        record(event, `GS USER DATA ${gs.address1.toString(16)} ${gs.address2.toString(16)} ${gs.address3.toString(16)}`, 'PARSED // CONSUMED', 'user-data')
        return []
      }
      if (sc88EffectProfile === 'passthrough') return [event]
      const native = [0x00, 0x40, 0x41, 0x50, 0x51].includes(gs.address1)
      const strictBlocked = sc88EffectProfile === 'strict' &&
        ((gs.address2 === 0x03) || (gs.address2 === 0x01 && gs.address3 >= 0x50))
      if (native && !strictBlocked) { stats.nativeGsSysexCount += 1; return [event] }
      stats.filteredGsSysexCount += 1
      if (!native) stats.unknownGsSysexCount += 1
      record(event, `GS ${gs.address1.toString(16)} ${gs.address2.toString(16)} ${gs.address3.toString(16)}`, 'FILTERED // UNSUPPORTED', 'sysex-filtered')
      return []
    }

    const part = Number.isInteger(event.logicalPart)
      ? event.logicalPart
      : Math.min(31, Math.max(0, (Number(event.port) || 0) * 16 + (Number(event.channel) & 15)))
    if (event.type === 'cc' && (event.controller === 0 || event.controller === 32)) {
      if (event.controller === 0) bankMSB[part] = clamp7(event.value)
      else bankLSB[part] = clamp7(event.value)
      return sc88ToneProfile === 'passthrough' || drumParts[part] ? [event] : []
    }
    if (event.type === 'program') {
      const sourceProgram = clamp7(event.value)
      program[part] = sourceProgram
      if (drumParts[part]) {
        const userSet = USER_DRUM_PROGRAMS.has(sourceProgram) ? sourceProgram - 64 : -1
        const kit = userSet >= 0 ? findDrumKit(0, 2, 0) : findDrumKit(bankMSB[part], bankLSB[part], sourceProgram)
        activeKits[part] = { kit, sourceProgram, userSet, targetProgram: kit?.destProgram ?? 0 }
        return [makeCc(event.channel, 0, 0), makeCc(event.channel, 32, 1), makeProgram(event.channel, kit?.destProgram ?? 0)]
      }
      if (sc88ToneProfile === 'passthrough') return [event]
      let sourceMap = bankLSB[part]
      let sourceBank = bankMSB[part]
      let sourceToneProgram = sourceProgram
      let userTone = false
      let unresolvedUserTone = false
      if (USER_TONE_BANKS.has(sourceBank) && sc88UserDataProfile === 'safe') {
        const definition = userTones[sourceBank - 64][sourceProgram]
        if (definition.map !== null && definition.bank !== null && definition.program !== null) {
          sourceMap = definition.map; sourceBank = definition.bank; sourceToneProgram = definition.program
          userTone = true; stats.userToneResolvedCount += 1
        } else {
          sourceBank = 0
          unresolvedUserTone = true
        }
      }
      const target = resolveSc88Tone(sourceMap, sourceBank, sourceToneProgram, { sc88ToneProfile, sourceModule })
      if (unresolvedUserTone) target.reason = 'user-tone-undefined'
      if (target.exact) stats.toneExactCount += 1
      else if (target.curated) stats.toneCuratedCount += 1
      else stats.toneFallbackCount += 1
      record(event,
        `${userTone ? 'USER→' : ''}${target.source.name} [M${sourceMap} B${sourceBank} P${sourceToneProgram + 1}]`,
        `${target.name} [B${target.bank} P${target.program + 1}]`,
        target.exact ? 'tone-exact' : target.curated ? 'tone-curated' : 'tone-fallback', target.reason)
      return [makeCc(event.channel, 0, target.bank), makeCc(event.channel, 32, 1), makeProgram(event.channel, target.program)]
    }
    if (event.type !== 'note_on' && event.type !== 'note_off') return [event]
    if (!drumParts[part]) return [event]

    const isOff = event.type === 'note_off' || event.velocity === 0
    const sourceNote = clamp7(event.note)
    const active = activeKits[part]
    if (isOff) {
      const stack = noteCache[part][sourceNote]
      const targetNote = stack.length ? stack.shift() : sourceNote
      return [{ ...event, note: targetNote }]
    }
    let workingNote = sourceNote
    let velocity = clamp7(event.velocity)
    let sourceKit = active?.sourceProgram ?? 0
    let sourceMap = bankLSB[part] || (sourceModule === '88PRO' ? 3 : 2)
    if (active?.userSet >= 0) {
      const table = userDrums[active.userSet]
      sourceMap = table[8][sourceNote] || sourceMap
      sourceKit = table[9][sourceNote]
      workingNote = table[10][sourceNote] || sourceNote
      const level = table[1][sourceNote]
      velocity = level === 0 ? 0 : clamp7(Math.round(velocity * level / 127))
      stats.userDrumMappedCount += 1
    }
    const kit = findDrumKit(0, sourceMap, sourceKit) || active?.kit
    const noteMapping = kit?.noteMap?.get(workingNote)
    if (noteMapping?.velocity === -127 || velocity === 0) {
      noteCache[part][sourceNote].push(noteMapping?.destNote ?? workingNote)
      return [{ ...event, note: noteMapping?.destNote ?? workingNote, velocity: 0 }]
    }
    const targetNote = clamp7(noteMapping?.destNote ?? workingNote)
    const targetProgram = noteMapping?.destProgram ?? kit?.destProgram ?? active?.targetProgram ?? 0
    velocity = balanceVelocity(velocity, targetNote, targetProgram, drumBalanceProfile)
    noteCache[part][sourceNote].push(targetNote)
    const output = []
    if (active && targetProgram !== active.targetProgram) {
      active.targetProgram = targetProgram
      output.push(makeProgram(event.channel, targetProgram))
    }
    output.push({ ...event, note: targetNote, velocity })
    return output
  }
  mapper.reset = () => {
    resetParts(); translationTimeline.length = 0
    Object.keys(stats).forEach((key) => { stats[key] = 0 })
  }
  mapper.setEnabled = (value) => { enabled = Boolean(value) }
  mapper.setPreferGsPlayback = () => {}
  mapper.getState = () => ({
    globalMode: 'sc88-over-55', detectedStandard: MIDI_STANDARDS.GS,
    detectedModule: sourceModule, configName: '88Over55', conversionEngine: 'sc88-over-55',
    mappingVersion: SC88_OVER_55_VERSION, midiDbRevision: MIDI_DB_REVISION,
    soundFontRevision: SC55_SOUNDFONT_SHA256, partCount: PART_COUNT,
    sc88ToneProfile, sc88EffectProfile, sc88UserDataProfile, drumBalanceProfile,
    drumParts, drumChannels: drumParts.slice(0, 16), translationTimeline,
    userDrumNames: [...userDrumNames], ...stats,
  })
  return mapper
}

export function convertSc88MidiBuffer(buffer, options = {}) {
  const startedAt = nowMs()
  const detection = detectMidiStandard(buffer)
  if (!SC88Over55Engine.canHandle(buffer)) {
    return { buffer, conversionApplied: false, telemetry: null, state: null, conversionMs: 0, version: SC88_OVER_55_VERSION }
  }
  const midi = BasicMIDI.fromArrayBuffer(buffer, options.fileName)
  const mapper = createSC88Over55EventMapper({ ...options, sourceModule: detection.gsModule })
  const ports = new Uint8Array(midi.tracks.length)
  const replacements = Array.from({ length: midi.tracks.length }, () => [])
  for (const entry of midi.timeline) {
    const sourceEvent = midi.tracks[entry.tr].events[entry.ev]
    if (sourceEvent.statusByte === 0x21) { ports[entry.tr] = sourceEvent.data[0] || 0; continue }
    const decoded = decodeMessage(sourceEvent, ports[entry.tr])
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
  const telemetry = { ...buildTelemetry(midi), ...buildPartTelemetry(midi), translationTimeline: state.translationTimeline }
  return {
    buffer: midi.writeMIDI(), conversionApplied: true, telemetry, state,
    conversionMs: nowMs() - startedAt, version: SC88_OVER_55_VERSION,
    sourceModule: detection.gsModule, partCount: PART_COUNT,
    drumParts: Uint8Array.from(state.drumParts),
    toneExactCount: state.toneExactCount, toneCuratedCount: state.toneCuratedCount,
    toneFallbackCount: state.toneFallbackCount, userToneResolvedCount: state.userToneResolvedCount,
    userDrumMappedCount: state.userDrumMappedCount, nativeGsSysexCount: state.nativeGsSysexCount,
    filteredGsSysexCount: state.filteredGsSysexCount, unknownGsSysexCount: state.unknownGsSysexCount,
  }
}

export class SC88Over55Engine {
  constructor() { this.worker = null; this.pending = new Map(); this.nextRequestId = 1 }
  static canHandle(buffer) {
    try {
      const detected = detectMidiStandard(buffer)
      return detected.standard === MIDI_STANDARDS.GS && ['88', '88PRO'].includes(detected.gsModule)
    } catch { return false }
  }
  canHandle(buffer) { return SC88Over55Engine.canHandle(buffer) }
  createEventMapper(options = {}) { return createSC88Over55EventMapper(options) }
  async convert(buffer, options = {}) {
    if (typeof Worker === 'undefined') return convertSc88MidiBuffer(buffer, options)
    if (!this.worker) {
      this.worker = new Worker(new URL('./sc88Over55.worker.js', import.meta.url), { type: 'module' })
      this.worker.onmessage = ({ data }) => {
        const pending = this.pending.get(data.id)
        if (!pending) return
        this.pending.delete(data.id)
        if (data.error) pending.reject(new Error(data.error)); else pending.resolve(data.result)
      }
      this.worker.onerror = (event) => {
        const error = new Error(event.message || 'SC88Over55 worker failed')
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
    const error = new Error('SC88Over55 engine disposed')
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}

export { SC88_OVER_55_VERSION }
