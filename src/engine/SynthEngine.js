import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib'
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'
import defaultSoundFontUrl from '../soundfont/sc55.sf2'
//import defaultSoundFontUrl from '../soundfont/gm.sf2' //Default, Save Memory
import { createMidiMapper } from './MidiMapper.js'
import { findActiveLyricIndex, parseLrc } from './lrc.js'
import { getKaraokeAudioEngine } from './audioEngine.js'
import { PLAYER_CONFIG } from '../config.js'
import { getKaraokeStoreState, setKaraokeStoreState } from '../state/karaokeStore.js'

const DEFAULT_CONFIG = {
  enableMIDIStandardMapping: true,
  reverb: 1.5,
  chorus: 1.3,
}

const MIDI_STATUS = {
  NOTE_OFF: 0x80,
  NOTE_ON: 0x90,
  POLY_PRESSURE: 0xa0,
  CC: 0xb0,
  PROGRAM: 0xc0,
  CHANNEL_PRESSURE: 0xd0,
  PITCH: 0xe0,
}

const createMidiEvent = () => ({
  type: 'unknown',
  channel: 0,
  note: 0,
  velocity: 0,
  controller: 0,
  value: 0,
  status: 0,
  data: null,
  raw: null,
})

const parseMidiMessage = (message, event) => {
  const status = Number(message?.[0] ?? 0)
  event.status = status
  event.raw = message
  event.data = null
  event.note = 0
  event.velocity = 0
  event.controller = 0
  event.value = 0
  event.channel = status & 0x0f
  event.type = 'unknown'

  if (status >= 0x80 && status < 0xf0) {
    const type = status & 0xf0
    switch (type) {
      case MIDI_STATUS.NOTE_OFF:
        event.type = 'note_off'
        event.note = Number(message?.[1] ?? 0)
        event.velocity = Number(message?.[2] ?? 0)
        break
      case MIDI_STATUS.NOTE_ON:
        event.type = 'note_on'
        event.note = Number(message?.[1] ?? 0)
        event.velocity = Number(message?.[2] ?? 0)
        break
      case MIDI_STATUS.POLY_PRESSURE:
        event.type = 'poly_pressure'
        event.note = Number(message?.[1] ?? 0)
        event.value = Number(message?.[2] ?? 0)
        break
      case MIDI_STATUS.CC:
        event.type = 'cc'
        event.controller = Number(message?.[1] ?? 0)
        event.value = Number(message?.[2] ?? 0)
        break
      case MIDI_STATUS.PROGRAM:
        event.type = 'program'
        event.value = Number(message?.[1] ?? 0)
        break
      case MIDI_STATUS.CHANNEL_PRESSURE:
        event.type = 'channel_pressure'
        event.value = Number(message?.[1] ?? 0)
        break
      case MIDI_STATUS.PITCH: {
        event.type = 'pitch'
        const lsb = Number(message?.[1] ?? 0) & 0x7f
        const msb = Number(message?.[2] ?? 0) & 0x7f
        event.value = (msb << 7) | lsb
        break
      }
      default:
        event.type = 'channel'
        break
    }
    return event
  }

  if (status === 0xf0 || status === 0xf7) {
    event.type = 'sysex'
    event.data = message
    return event
  }

  event.type = 'system'
  event.data = message
  return event
}

const encodeMidiEvent = (event, buffer3, buffer2) => {
  switch (event.type) {
    case 'note_on':
      buffer3[0] = MIDI_STATUS.NOTE_ON | (event.channel & 0x0f)
      buffer3[1] = event.note & 0x7f
      buffer3[2] = event.velocity & 0x7f
      return buffer3
    case 'note_off':
      buffer3[0] = MIDI_STATUS.NOTE_OFF | (event.channel & 0x0f)
      buffer3[1] = event.note & 0x7f
      buffer3[2] = event.velocity & 0x7f
      return buffer3
    case 'cc':
      buffer3[0] = MIDI_STATUS.CC | (event.channel & 0x0f)
      buffer3[1] = event.controller & 0x7f
      buffer3[2] = event.value & 0x7f
      return buffer3
    case 'program':
      buffer2[0] = MIDI_STATUS.PROGRAM | (event.channel & 0x0f)
      buffer2[1] = event.value & 0x7f
      return buffer2
    case 'channel_pressure':
      buffer2[0] = MIDI_STATUS.CHANNEL_PRESSURE | (event.channel & 0x0f)
      buffer2[1] = event.value & 0x7f
      return buffer2
    case 'poly_pressure':
      buffer3[0] = MIDI_STATUS.POLY_PRESSURE | (event.channel & 0x0f)
      buffer3[1] = event.note & 0x7f
      buffer3[2] = event.value & 0x7f
      return buffer3
    case 'pitch': {
      const value = Number(event.value) || 0
      buffer3[0] = MIDI_STATUS.PITCH | (event.channel & 0x0f)
      buffer3[1] = value & 0x7f
      buffer3[2] = (value >> 7) & 0x7f
      return buffer3
    }
    case 'sysex':
    case 'system':
      return event.data || event.raw
    default:
      return event.raw
  }
}

function extractChannelPatchesFromMIDI(midi, drumChannels = null) {
  if (!midi?.tracks?.length) return Array.from({ length: 16 }, () => null)

  const bankMSB = Array.from({ length: 16 }, () => 0)
  const bankLSB = Array.from({ length: 16 }, () => 0)
  const patchAtFirstNote = Array.from({ length: 16 }, () => null)
  const programCandidate = Array.from({ length: 16 }, () => null)
  const bankCandidateMSB = Array.from({ length: 16 }, () => 0)
  const bankCandidateLSB = Array.from({ length: 16 }, () => 0)
  const firstNoteSeen = Array.from({ length: 16 }, () => false)
  const hasAnyEvent = Array.from({ length: 16 }, () => false)

  const events = []
  let ordinal = 0
  for (const track of midi.tracks) {
    if (!track?.events?.length) continue
    for (const e of track.events) {
      if (!e) continue
      const status = Number(e.statusByte)
      if (!Number.isFinite(status) || status < 0x80) continue
      const ticks = Number(e.ticks) || 0
      const type = status & 0xf0
      const channel = status & 0x0f
      const data0 = e.data?.[0]
      const data1 = e.data?.[1]

      // Ordering within same tick:
      // bank select (CC 0/32) -> program change -> note on -> others
      let order = 9
      if (type === 0xb0 && (data0 === 0 || data0 === 32)) order = 0
      else if (type === 0xc0) order = 1
      else if (type === 0x90 && (data1 ?? 0) > 0) order = 2
      else if (type === 0xb0) order = 8

      events.push({ ticks, status, data: e.data, order, ordinal: ordinal++ })
      if (channel >= 0 && channel <= 15) hasAnyEvent[channel] = true
    }
  }

  events.sort((a, b) => a.ticks - b.ticks || a.order - b.order || a.ordinal - b.ordinal)

  for (const event of events) {
    const type = event.status & 0xf0
    const channel = event.status & 0x0f
    if (channel < 0 || channel > 15) continue

    if (type === 0xb0) {
      const controllerNumber = event.data?.[0]
      const value = event.data?.[1]
      if (controllerNumber === 0) {
        bankMSB[channel] = value ?? 0
        bankCandidateMSB[channel] = bankMSB[channel]
      }
      if (controllerNumber === 32) {
        bankLSB[channel] = value ?? 0
        bankCandidateLSB[channel] = bankLSB[channel]
      }
      continue
    }

    if (type === 0xc0) {
      const program = event.data?.[0] ?? 0
      programCandidate[channel] = program
      bankCandidateMSB[channel] = bankMSB[channel]
      bankCandidateLSB[channel] = bankLSB[channel]
      continue
    }

    if (type === 0x90 && (event.data?.[1] ?? 0) > 0) {
      if (firstNoteSeen[channel]) continue
      firstNoteSeen[channel] = true
      const program = programCandidate[channel] ?? 0
      const isDrum = channel === 9 || Boolean(drumChannels?.[channel])
      patchAtFirstNote[channel] = {
        program,
        bankMSB: bankCandidateMSB[channel],
        bankLSB: bankCandidateLSB[channel],
        isGMGSDrum: isDrum,
      }
    }
  }

  for (let ch = 0; ch < 16; ch++) {
    if (patchAtFirstNote[ch]) continue
    if (programCandidate[ch] == null) continue
    const isDrum = ch === 9 || Boolean(drumChannels?.[ch])
    patchAtFirstNote[ch] = {
      program: programCandidate[ch],
      bankMSB: bankCandidateMSB[ch],
      bankLSB: bankCandidateLSB[ch],
      isGMGSDrum: isDrum,
    }
  }

  for (let ch = 0; ch < 16; ch++) {
    if (patchAtFirstNote[ch]) continue
    if (!hasAnyEvent[ch]) continue
    const isDrum = ch === 9 || Boolean(drumChannels?.[ch])
    patchAtFirstNote[ch] = { program: 0, bankMSB: bankMSB[ch], bankLSB: bankLSB[ch], isGMGSDrum: isDrum }
  }

  return patchAtFirstNote
}

function resolvePatchName(presetList, patch, channelIndex) {
  if (!patch) return channelIndex === 9 ? 'Drums (0)' : '—'
  // 1-based program for display
  const progDisp = (patch.program || 0) + 1

  if (patch.isGMGSDrum || channelIndex === 9) return `Drums (${progDisp})`

  const exact = presetList?.find(
    (p) => p.program === patch.program && p.bankMSB === patch.bankMSB && p.bankLSB === patch.bankLSB,
  )
  if (exact?.name) return `${exact.name} (${progDisp})`

  const byProgramBank = presetList?.find((p) => p.program === patch.program && p.bankMSB === patch.bankMSB)
  if (byProgramBank?.name) return `${byProgramBank.name} (${progDisp})`

  const fallback = presetList?.find((p) => p.program === patch.program)
  return fallback?.name ? `${fallback.name} (${progDisp})` : `Program ${progDisp}`
}

class SynthEngine {
  constructor() {
    this._initialized = false
    this._initializing = null

    this._context = null
    this._synth = null
    this._seq = null

    this._smfKnifeConfigText = ''
    this._smfKnifeConfigName = ''
    this._smfKnifeForce = false
    this._lastMidiBuffer = null

    this._midiMapper = createMidiMapper(null)
    this._midiEvent = createMidiEvent()
    this._midiMessage3 = new Uint8Array(3)
    this._midiMessage2 = new Uint8Array(2)
    this._channelActivityVelocity = Array.from({ length: 16 }, () => 0)
    this._channelActivityTime = Array.from({ length: 16 }, () => -1)
    this._activeNoteCounts = Array.from({ length: 16 }, () => Array.from({ length: 128 }, () => 0))
    this._polyphonyCount = 0
    this._activityDirty = false
    this._polyphonyDirty = false

    // Real-time instrument tracking
    this._channelInstrumentNames = Array.from({ length: 16 }, () => '—')
    this._channelPrograms = Array.from({ length: 16 }, () => ({ program: 0, bankMSB: 0, bankLSB: 0 }))
    this._drumChannelsApplied = new Uint8Array(16)
    this._midiChannelState = Array.from({ length: 16 }, (_, i) => ({
      channel: i,
      isDrum: i === 9,
      program: 0,
      bankMSB: 0,
      bankLSB: 0,
      name: i === 9 ? 'Drums' : '—',
    }))
    this._instrumentDirty = false

    this._raf = 0
    this._prevFinished = false
    this._isAdvancing = false
    this._isStopping = false
    this._sequencerEventsBound = false
    this._autoPlayOnNextSong = false

    this._midiMapper.setEnabled(DEFAULT_CONFIG.enableMIDIStandardMapping)
    this._midiMapper.onStateChange = (state) => {
      this._setState({ midiMapState: state })
      this._bgSyncDrums(state.drumChannels)
    }
    this._setState({
      enableMIDIStandardMapping: DEFAULT_CONFIG.enableMIDIStandardMapping,
      midiMapState: this._midiMapper.getState(),
      reverbGain: DEFAULT_CONFIG.reverb,
      chorusGain: DEFAULT_CONFIG.chorus,
      smfKnifeConfigName: '',
      smfKnifeSource: '',
      smfKnifeDestination: '',
      midiChannels: this._cloneMidiChannelState(),
    })
  }

  _setState(patch) {
    setKaraokeStoreState(patch)
  }

  _cloneMidiChannelState() {
    return this._midiChannelState.map((entry) => ({ ...entry }))
  }

  _syncMidiChannelState(channel) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 15) return
    const base = this._midiChannelState[channel]
    const programState = this._channelPrograms[channel]
    const name = this._channelInstrumentNames[channel] || '—'
    this._midiChannelState[channel] = {
      ...base,
      program: programState.program,
      bankMSB: programState.bankMSB,
      bankLSB: programState.bankLSB,
      name,
    }
    this._setState({ midiChannels: this._cloneMidiChannelState() })
  }

  async ensureInitialized() {
    if (this._initialized) return
    if (this._initializing) return this._initializing

    this._initializing = (async () => {
      this._setState({ status: 'Loading SynthEngine…' })
      const audioEngine = getKaraokeAudioEngine()
      const context = audioEngine.ensureAudioContext()
      await context.audioWorklet.addModule(processorUrl)

      const synth = new WorkletSynthesizer(context, { initializeChorusProcessor: true, initializeReverbProcessor: true })
      synth.connect(context.destination)

      const response = await fetch(defaultSoundFontUrl)
      if (!response.ok) throw new Error(`SoundFont HTTP ${response.status}`)
      const sfBuffer = await response.arrayBuffer()
      await synth.soundBankManager.addSoundBank(sfBuffer, 'main')

      const seq = new Sequencer(synth)
      seq.loopCount = -1

      this._context = context
      this._synth = synth
      this._seq = seq
      this._bindSequencerEvents()
      this._setupMidiMapper()

      this._applyDefaultEffects()

      const { enabledChannels } = getKaraokeStoreState()
      enabledChannels.forEach((enabled, i) => synth.muteChannel(i, !enabled))

      this._initialized = true
      this._setState({ ready: true, status: 'Ready' })
    })()

    try {
      await this._initializing
    } finally {
      this._initializing = null
    }
  }

  _applyDefaultEffects() {
    if (!this._synth) return
    try {
      if (Number.isFinite(DEFAULT_CONFIG.reverb)) {
        this._synth.setMasterParameter('reverbGain', DEFAULT_CONFIG.reverb)
      }
      if (Number.isFinite(DEFAULT_CONFIG.chorus)) {
        this._synth.setMasterParameter('chorusGain', DEFAULT_CONFIG.chorus)
      }

      this._setState({
        reverbGain: Number(this._synth.getMasterParameter('reverbGain')) || 0,
        chorusGain: Number(this._synth.getMasterParameter('chorusGain')) || 0,
        transposition: Number(this._synth.getMasterParameter('transposition')) || 0,
      })
    } catch (e) {
      console.warn('Failed to apply default effects', e)
    }
  }

  _startClock() {
    if (this._raf) return
    const tick = () => {
      const seq = this._seq
      if (seq) {
        const currentTime = seq.currentHighResolutionTime ?? seq.currentTime ?? 0
        const duration = seq.duration || 0

        const uiState = getKaraokeStoreState()
        const t = currentTime - (uiState.lyricOffsetMs || 0) / 1000
        const activeLyricIndex = findActiveLyricIndex(uiState.lrcEntries || [], t)
        let karaokeProgress = 0
        if (activeLyricIndex >= 0) {
          const start = uiState.lrcEntries[activeLyricIndex].time
          const end =
            uiState.lrcEntries[activeLyricIndex + 1]?.time ?? Math.max(start + 1, duration || start + 1)
          const denom = Math.max(0.001, end - start)
          karaokeProgress = Math.min(1, Math.max(0, (t - start) / denom))
        }

        const isPlaying = !seq.paused && !seq.isFinished
        const patch = { currentTime, duration, isPlaying }
        if (this._activityDirty) {
          patch.channelActivityVelocity = this._channelActivityVelocity.slice()
          patch.channelActivityTime = this._channelActivityTime.slice()
          this._activityDirty = false
        }
        if (this._polyphonyDirty) {
          patch.polyphonyCount = this._polyphonyCount
          this._polyphonyDirty = false
        }
        if (this._instrumentDirty) {
          patch.channelInstrumentNames = this._channelInstrumentNames.slice()
          this._instrumentDirty = false
        }
        this._setState(patch)
        setKaraokeStoreState({ activeLyricIndex, karaokeProgress })

        if (seq.isFinished && !this._prevFinished) {
          this._prevFinished = true
          if (PLAYER_CONFIG.autoAdvanceOnFinish) {
            this._advanceQueueIfNeeded().catch(() => {
              // ignore
            })
          }
        }
        if (!seq.isFinished) this._prevFinished = false
      }
      if (seq && !seq.paused && !seq.isFinished) {
        this._raf = window.requestAnimationFrame(tick)
      } else {
        this._raf = 0
      }
    }
    this._raf = window.requestAnimationFrame(tick)
  }

  _stopClock() {
    if (!this._raf) return
    window.cancelAnimationFrame(this._raf)
    this._raf = 0
  }

  _bgSyncDrums(drumChannels) {
    if (!this._synth || !drumChannels) return
    if (typeof this._synth.setDrums !== 'function') return
    try {
      drumChannels.forEach((isDrum, channel) => {
        const next = isDrum ? 1 : 0
        if (this._drumChannelsApplied[channel] === next) return
        this._drumChannelsApplied[channel] = next
        const entry = this._midiChannelState[channel]
        if (entry) {
          entry.isDrum = Boolean(isDrum)
          if (entry.isDrum && !entry.name) entry.name = 'Drums'
        }
        this._synth.setDrums(channel, Boolean(isDrum))
        const program = this._channelPrograms?.[channel]?.program ?? 0
        if (typeof this._synth.programChange === 'function') {
          this._synth.programChange(channel, program)
        }
      })
      this._setState({ midiChannels: this._cloneMidiChannelState() })
    } catch (e) {
      console.warn('Failed to sync drums', e)
    }
  }

  _setupMidiMapper() {
    if (!this._seq || !this._synth || !this._midiMapper) return
    // Sync initial state
    this._bgSyncDrums(this._midiMapper.getState().drumChannels)

    this._seq.connectMIDIOutput({
      send: (data) => {
        this._handleMidiOutputMessage(data)
      },
    })
  }

  _bindSequencerEvents() {
    if (!this._seq || this._sequencerEventsBound) return
    this._sequencerEventsBound = true
    this._seq.eventHandler.addEvent('songChange', 'sync-playback-state', () => {
      const duration = this._seq?.duration || 0
      this._setState({ currentTime: 0, duration })
      if (this._autoPlayOnNextSong) {
        this._autoPlayOnNextSong = false
        this.play()
      }
    })
  }

  _rebuildMidiMapper(buffer) {
    if (buffer) this._lastMidiBuffer = buffer
    const prevEnabled = getKaraokeStoreState().enableMIDIStandardMapping ?? DEFAULT_CONFIG.enableMIDIStandardMapping
    this._midiMapper = createMidiMapper(buffer, {
      smfKnifeConfigText: this._smfKnifeConfigText,
      smfKnifeConfigName: this._smfKnifeConfigName,
      forceSmfKnife: Boolean(this._smfKnifeForce),
    })
    this._midiMapper.setEnabled(prevEnabled)
    if (typeof this._midiMapper.reset === 'function') {
      this._midiMapper.reset()
    }
    this._midiMapper.onStateChange = (state) => {
      this._setState({ midiMapState: state })
      console.log(state)
      this._bgSyncDrums(state.drumChannels)
    }
    const newState = this._midiMapper.getState()
    this._setState({
      midiMapState: newState,
      smfKnifeConfigName: newState?.globalMode === 'smfknife' ? newState.configName : '',
      smfKnifeSource: newState?.mappingSource || '',
      smfKnifeDestination: newState?.mappingDestination || '',
    })
    this._bgSyncDrums(newState.drumChannels)
  }

  _handleMidiOutputMessage(message) {
    if (!this._synth) return
    const event = parseMidiMessage(message, this._midiEvent)
    const events = this._midiMapper ? this._midiMapper(event) : [event]

    for (const nextEvent of events) {
      if (!nextEvent) continue

      const bytes = encodeMidiEvent(nextEvent, this._midiMessage3, this._midiMessage2)
      if (!bytes) continue
      this._synth.sendMessage(bytes)
      this._trackChannelActivity(nextEvent)
      this._trackPolyphony(nextEvent)
      this._trackProgramChange(nextEvent) // Track real-time program changes
    }
  }

  _trackProgramChange(event) {
    if (!event) return
    const channel = Number(event.channel)
    if (!Number.isInteger(channel) || channel < 0 || channel > 15) return

    let changed = false
    const state = this._channelPrograms[channel]

    if (event.type === 'program') {
      const val = Number(event.value) || 0
      if (state.program !== val) {
        state.program = val
        changed = true
      }
      // If program changes, re-check instrument name using current banks
      // IMPORTANT: We use the *mapped* program if it came from the mapper.
    } else if (event.type === 'cc') {
      if (event.controller === 0) { // MSB
        const val = Number(event.value) || 0
        if (state.bankMSB !== val) {
          state.bankMSB = val
          changed = true
        }
      } else if (event.controller === 32) { // LSB
        const val = Number(event.value) || 0
        if (state.bankLSB !== val) {
          state.bankLSB = val
          changed = true
        }
      }
    }

    if (changed) {
      // Resolve name
      const patch = {
        program: state.program,
        bankMSB: state.bankMSB,
        bankLSB: state.bankLSB,
        isGMGSDrum: channel === 9 || (this._midiMapper?.getState()?.drumChannels?.[channel])
      }
      const name = resolvePatchName(this._synth.presetList, patch, channel)
      if (this._channelInstrumentNames[channel] !== name) {
        this._channelInstrumentNames[channel] = name
        this._instrumentDirty = true
      }
      this._syncMidiChannelState(channel)
    }
  }

  _resetMidiMapperState() {
    if (!this._midiMapper) return
    this._midiMapper.reset()
  }

  _resetChannelActivity() {
    this._channelActivityVelocity.fill(0)
    this._channelActivityTime.fill(-1)
    this._activityDirty = false
    this._drumChannelsApplied.fill(0)

    // Reset instrument state
    this._channelInstrumentNames.fill('—')
    this._channelPrograms.forEach(p => { p.program = 0; p.bankMSB = 0; p.bankLSB = 0 })
    this._instrumentDirty = true
    this._midiChannelState = Array.from({ length: 16 }, (_, i) => ({
      channel: i,
      isDrum: i === 9,
      program: 0,
      bankMSB: 0,
      bankLSB: 0,
      name: i === 9 ? 'Drums' : '—',
    }))

    this._setState({
      channelActivityVelocity: this._channelActivityVelocity.slice(),
      channelActivityTime: this._channelActivityTime.slice(),
      channelInstrumentNames: this._channelInstrumentNames.slice(),
      midiChannels: this._cloneMidiChannelState(),
    })
  }

  _resetPolyphony() {
    this._activeNoteCounts.forEach((notes) => notes.fill(0))
    this._polyphonyCount = 0
    this._polyphonyDirty = false
    this._setState({ polyphonyCount: 0 })
  }

  _reportPolyphony() {
    this._setState({ polyphonyCount: this._polyphonyCount })
    this._polyphonyDirty = false
  }

  _trackChannelActivity(event) {
    if (event?.type !== 'note_on') return
    const velocity = Number(event.velocity)
    if (!(velocity > 0)) return
    const channel = Number(event.channel)
    if (!Number.isInteger(channel) || channel < 0 || channel > 15) return
    const now = this._seq?.currentHighResolutionTime ?? this._seq?.currentTime ?? 0
    const level = Math.max(0, Math.min(1, velocity / 127))
    const prev = this._channelActivityVelocity[channel] || 0
    this._channelActivityVelocity[channel] = Math.max(prev * 0.6, level)
    this._channelActivityTime[channel] = now
    this._activityDirty = true
  }

  _trackPolyphony(event) {
    if (!event) return
    const channel = Number(event.channel)
    if (!Number.isInteger(channel) || channel < 0 || channel > 15) return
    const note = Number(event.note)
    if (!Number.isInteger(note) || note < 0 || note > 127) return
    const isNoteOn = event.type === 'note_on' && Number(event.velocity) > 0
    const isNoteOff = event.type === 'note_off' || (event.type === 'note_on' && Number(event.velocity) === 0)
    if (!isNoteOn && !isNoteOff) return

    const counts = this._activeNoteCounts[channel]
    if (isNoteOn) {
      counts[note] += 1
      this._polyphonyCount += 1
    } else if (counts[note] > 0) {
      counts[note] -= 1
      this._polyphonyCount = Math.max(0, this._polyphonyCount - 1)
    }
    this._polyphonyDirty = true
  }

  panic() {
    if (!this._synth) return
    const synth = this._synth
    const sendController =
      typeof synth.controllerChange === 'function'
        ? (channel, controller, value) => synth.controllerChange(channel, controller, value)
        : typeof synth.controller === 'function'
          ? (channel, controller, value) => synth.controller(channel, controller, value)
          : typeof synth.sendMessage === 'function'
            ? (channel, controller, value) =>
              synth.sendMessage(new Uint8Array([0xb0 + channel, controller, value]))
            : null
    const sendProgram =
      typeof synth.programChange === 'function'
        ? (channel, program) => synth.programChange(channel, program)
        : typeof synth.sendMessage === 'function'
          ? (channel, program) => synth.sendMessage(new Uint8Array([0xc0 + channel, program]))
          : null
    if (typeof synth.resetControllers === 'function') {
      try {
        synth.resetControllers()
      } catch {
        // ignore
      }
    }
    if (sendController) {
      // Reset controllers/effects and stop active notes without stopping playback.
      for (let ch = 0; ch < 16; ch++) {
        sendController(ch, 121, 0) // Reset All Controllers
        sendController(ch, 120, 0) // All Sound Off
        sendController(ch, 123, 0) // All Notes Off
        sendController(ch, 91, 0) // Reverb (Effect 1 Depth)
        sendController(ch, 93, 0) // Chorus (Effect 3 Depth)
        sendController(ch, 0, 0) // Bank Select MSB
        sendController(ch, 32, 0) // Bank Select LSB
        if (sendProgram) sendProgram(ch, 0)
      }
    }
    if (typeof synth.setDrums === 'function') {
      for (let ch = 0; ch < 16; ch++) {
        const isDrum = ch === 9
        synth.setDrums(ch, isDrum)
        const entry = this._midiChannelState?.[ch]
        if (entry) {
          entry.isDrum = isDrum
          entry.name = isDrum ? 'Drums' : (this._channelInstrumentNames?.[ch] || '—')
        }
        this._drumChannelsApplied[ch] = isDrum ? 1 : 0
      }
      this._setState({ midiChannels: this._cloneMidiChannelState() })
    }
    if (typeof synth.stopAll === 'function') {
      try {
        synth.stopAll(true)
      } catch {
        // ignore
      }
    }
    if (typeof synth.muteChannel === 'function') {
      const enabled = getKaraokeStoreState().enabledChannels || []
      for (let ch = 0; ch < 16; ch++) {
        synth.muteChannel(ch, !enabled[ch])
      }
    }
    // Reset internal instrument tracking to default state
    this._channelPrograms.forEach((state, channel) => {
      state.program = 0
      state.bankMSB = 0
      state.bankLSB = 0
      const patch = {
        program: state.program,
        bankMSB: state.bankMSB,
        bankLSB: state.bankLSB,
        isGMGSDrum: channel === 9 || (this._midiMapper?.getState()?.drumChannels?.[channel]),
      }
      const name = resolvePatchName(this._synth.presetList, patch, channel)
      this._channelInstrumentNames[channel] = name
    })
    this._instrumentDirty = true
    this._channelActivityVelocity.fill(0)
    this._channelActivityTime.fill(-1)
    this._activityDirty = true
    // Reset polyphony tracking
    this._activeNoteCounts.forEach((notes) => notes.fill(0))
    this._polyphonyCount = 0
    this._polyphonyDirty = true
    this._reportPolyphony()
  }

  async resumeAudio() {
    await this.ensureInitialized()
    const audioEngine = getKaraokeAudioEngine()
    await audioEngine.resumeAudio()
  }

  getAudioContext() {
    return this._context
  }

  async getMidiData() {
    if (!this._seq) return null
    try {
      return await this._seq.getMIDI()
    } catch {
      return null
    }
  }

  async loadMIDI({ buffer, midiName, midiUrl = '' }) {
    await this.ensureInitialized()
    this.panic()
    this._autoPlayOnNextSong = true

    this._rebuildMidiMapper(buffer)
    this._setupMidiMapper()

    this._resetChannelActivity()
    this._resetPolyphony()
    this._setState({ isPlaying: false, currentTime: 0, duration: 0 })

    this._seq.pause()
    this._seq.currentTime = 0
    this._synth.stopAll(true)
    this._seq.loadNewSongList([{ binary: buffer, fileName: midiName }])
    this._setState({ midiUrl, midiName, status: `MIDI loaded: ${midiName}` })

    this._updateChannelInstrumentNames().catch(() => {
      // ignore
    })
    this._applyDefaultEffects()
    this._startClock()

    return buffer
  }

  async loadMidiFromUrl(url, options = {}) {
    this._setState({ status: `Loading MIDI: ${url}` })
    const response = await fetch(url)
    if (!response.ok) throw new Error(`MIDI HTTP ${response.status}`)
    const buffer = await response.arrayBuffer()
    const midiName = url.split('/').pop() || url
    return this.loadMIDI({ buffer, midiName, midiUrl: url })
  }

  async loadMidiFromFile(file, options = {}) {
    const buffer = await file.arrayBuffer()
    const midiName = file.name
    return this.loadMIDI({ buffer, midiName, midiUrl: '' })
  }

  setPendingSong(song) {
    setKaraokeStoreState({ pendingSong: song || null })
  }

  clearPendingSong() {
    setKaraokeStoreState({ pendingSong: null })
  }

  enqueueSong(song) {
    if (!song) return
    const next = getKaraokeStoreState().queue.slice()
    next.push(song)
    this._setState({ queue: next })
  }

  enqueuePendingSong() {
    const pending = getKaraokeStoreState().pendingSong
    if (!pending) return
    this.enqueueSong(pending)
    this.clearPendingSong()
  }

  clearQueue() {
    this._setState({ queue: [], queueIndex: -1 })
  }

  removeFromQueue(index) {
    const i = Number(index)
    if (!Number.isInteger(i)) return
    const next = getKaraokeStoreState().queue.slice()
    if (i < 0 || i >= next.length) return
    next.splice(i, 1)
    let queueIndex = getKaraokeStoreState().queueIndex
    if (queueIndex >= next.length) queueIndex = next.length - 1
    this._setState({ queue: next, queueIndex })
  }

  bumpQueueNext(index) {
    const i = Number(index)
    if (!Number.isInteger(i)) return
    const queue = getKaraokeStoreState().queue.slice()
    if (i < 0 || i >= queue.length) return
    const currentIndex = getKaraokeStoreState().queueIndex
    const targetIndex = currentIndex >= 0 ? currentIndex + 1 : 0
    if (i === targetIndex) return
    const [song] = queue.splice(i, 1)
    const safeIndex = Math.min(targetIndex, queue.length)
    queue.splice(safeIndex, 0, song)
    let nextQueueIndex = currentIndex
    if (currentIndex >= 0) {
      if (i < currentIndex) nextQueueIndex = currentIndex - 1
      if (safeIndex <= nextQueueIndex) nextQueueIndex += 1
    }
    this._setState({ queue, queueIndex: nextQueueIndex })
  }

  async playQueueFrom(index = 0) {
    await this.ensureInitialized()
    const i = Number(index)
    const queue = getKaraokeStoreState().queue
    if (!Number.isInteger(i) || i < 0 || i >= queue.length) return
    const song = queue[i]
    if (!song?.url) return
    await this.resumeAudio()
    this.setTransposition(0)
    setKaraokeStoreState({
      lrcName: '',
      lrcEntries: [],
      lyricOffsetMs: 0,
      activeLyricIndex: -1,
      karaokeProgress: 0,
    })
    this._setState({ queueIndex: i })
    await this.loadMidiFromUrl(song.url, { autoPlay: false })

    if (song.lrc) {
      try {
        const res = await fetch(song.lrc)
        if (res.ok) {
          const text = await res.text()
          setKaraokeStoreState({
            lrcName: song.lrcName || song.lrc.split('/').pop() || 'lyrics.lrc',
            lrcEntries: parseLrc(text),
          })
        }
      } catch {
        // ignore
      }
    }
    if (Number.isFinite(song.lrc_offset)) this.setLyricOffsetMs(song.lrc_offset)
    this.play()

  }

  async playQueueIfIdle() {
    await this.ensureInitialized()
    const { queue, queueIndex } = getKaraokeStoreState()
    if (!queue.length) return
    if (queueIndex >= 0) return
    await this.playQueueFrom(0)
  }

  async _advanceQueueIfNeeded() {
    await this._advanceQueue({ autoPlayNext: true })
  }

  play() {
    if (!this._seq) return
    this._seq.play()
    this._setState({ isPlaying: true })
    this._startClock()
  }

  pause() {
    if (!this._seq) return
    this._seq.pause()
    this._setState({ isPlaying: false })
    this._stopClock()
  }

  stop() {
    if (!this._seq || !this._synth) return
    this._seq.pause()
    this._seq.currentTime = 0
    this._synth.stopAll(true)
    this._resetChannelActivity()
    this._resetPolyphony()
    this._setState({ isPlaying: false, currentTime: 0 })
    this._stopClock()
  }

  async stopAndAdvance(options = {}) {
    await this.ensureInitialized()
    if (!this._synth || !this._seq) return
    if (this._isStopping) return

    this._isStopping = true
    const fadeMs = Math.max(0, Number(options.fadeMs ?? PLAYER_CONFIG.stopFadeMs))
    const startGain = Number(this._synth.getMasterParameter('masterGain')) || 1

    try {
      if (fadeMs > 0) {
        const start = performance.now()
        await new Promise((resolve) => {
          const step = (now) => {
            const t = Math.min(1, (now - start) / fadeMs)
            const nextGain = startGain * (1 - t)
            this._synth.setMasterParameter('masterGain', nextGain)
            if (t >= 1) resolve()
            else requestAnimationFrame(step)
          }
          requestAnimationFrame(step)

        })
      } else {
        this._synth.setMasterParameter('masterGain', 0)
      }

      this.stop()
      this._synth.setMasterParameter('masterGain', startGain)
      await new Promise((resolve) => setTimeout(resolve, fadeMs))
      await this._advanceQueue({ autoPlayNext: true })
      const { queueIndex } = getKaraokeStoreState()
      if (queueIndex >= 0 && this._seq?.paused) {
        await this.playQueueFrom(queueIndex)
      }
    } finally {
      this._isStopping = false
    }
  }

  async _advanceQueue({ autoPlayNext }) {
    if (this._isAdvancing) return
    if (getKaraokeStoreState().queueIndex < 0) return
    this._isAdvancing = true
    try {
      const { queue: currentQueue, history: currentHistory, queueIndex: currentIndex } = getKaraokeStoreState()
      const queue = currentQueue.slice()
      const history = currentHistory.slice()
      const current = queue[currentIndex]
      if (current) history.unshift(current)
      if (currentIndex >= 0 && currentIndex < queue.length) queue.splice(currentIndex, 1)

      const nextIndex = queue.length ? Math.min(currentIndex, queue.length - 1) : -1
      this._setState({ queue, history, queueIndex: nextIndex })

      if (autoPlayNext && nextIndex >= 0) {
        await this.playQueueFrom(nextIndex)
      }
    } finally {
      this._isAdvancing = false
    }
  }

  seek(timeSeconds) {
    if (!this._seq) return
    this._seq.currentTime = Math.max(0, Number(timeSeconds) || 0)
  }

  setReverbGain(value) {
    if (!this._synth) return
    const v = Math.max(0, Number(value) || 0)
    this._synth.setMasterParameter('reverbGain', v)
    this._setState({ reverbGain: v })
  }

  setChorusGain(value) {
    if (!this._synth) return
    const v = Math.max(0, Number(value) || 0)
    this._synth.setMasterParameter('chorusGain', v)
    this._setState({ chorusGain: v })
  }

  setSmfKnifeMapping(text, name = '') {
    const sourceText = String(text || '')
    if (!sourceText.trim()) return
    this._smfKnifeConfigText = sourceText
    this._smfKnifeConfigName = name || 'SMF Knife'
    this._smfKnifeForce = false
    this._setState({
      smfKnifeConfigName: this._smfKnifeConfigName,
      smfKnifeSource: '',
      smfKnifeDestination: '',
    })
    this._rebuildMidiMapper(this._lastMidiBuffer || null)
  }

  clearSmfKnifeMapping() {
    this._smfKnifeConfigText = ''
    this._smfKnifeConfigName = ''
    this._smfKnifeForce = false
    this._setState({
      smfKnifeConfigName: '',
      smfKnifeSource: '',
      smfKnifeDestination: '',
    })
    this._rebuildMidiMapper(this._lastMidiBuffer || null)
  }

  setTransposition(semitones) {
    if (!this._synth) return
    const v = Number(semitones) || 0
    this._synth.setMasterParameter('transposition', v)
    this._setState({ transposition: v })
  }

  setEnableMIDIStandardMapping(enabled) {
    const next = Boolean(enabled)
    this._midiMapper?.setEnabled(next)
    this._setState({ enableMIDIStandardMapping: next })
  }

  shiftTransposition(deltaSemitones) {
    const next = (Number(getKaraokeStoreState().transposition) || 0) + (Number(deltaSemitones) || 0)
    this.setTransposition(next)
  }

  setChannelEnabled(channelIndex, enabled) {
    if (!this._synth) return
    const idx = Number(channelIndex)
    if (!Number.isInteger(idx) || idx < 0 || idx > 15) return
    const next = getKaraokeStoreState().enabledChannels.slice()
    next[idx] = Boolean(enabled)
    this._synth.muteChannel(idx, !next[idx])
    this._setState({ enabledChannels: next })
  }

  async loadLrcFromFile(file) {
    const text = await file.text()
    const entries = parseLrc(text)
    setKaraokeStoreState({ lrcName: file.name, lrcEntries: entries })
  }

  setLyricOffsetMs(ms) {
    const value = Math.max(-30000, Math.min(30000, Number(ms) || 0))
    setKaraokeStoreState({ lyricOffsetMs: value })
  }

  async _updateChannelInstrumentNames(timeoutMs = 1500) {
    if (!this._seq || !this._synth) return
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('getMIDI timeout')), timeoutMs)
    })
    const midi = await Promise.race([this._seq.getMIDI(), timeout])
    const drumChannels = this._midiMapper?.getState?.()?.drumChannels
    const patches = extractChannelPatchesFromMIDI(midi, drumChannels)
    // Update internal state
    patches.forEach((p, i) => {
      if (p) {
        this._channelPrograms[i] = { ...p }
      }
    })
    const channelInstrumentNames = patches.map((patch, idx) => resolvePatchName(this._synth.presetList, patch, idx))
    this._channelInstrumentNames = channelInstrumentNames
    this._setState({ channelInstrumentNames })
  }
}

const synthEngine = new SynthEngine()

export { synthEngine, DEFAULT_CONFIG }
