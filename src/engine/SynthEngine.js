import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib'
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'
import defaultSoundFontUrl from '../soundfont/gmplus.sf2'
//import defaultSoundFontUrl from '../soundfont/sc55.sf2'
import { findActiveLyricIndex, parseLrc } from './lrc.js'
import { PLAYER_CONFIG } from '../config.js'

function extractChannelPatchesFromMIDI(midi) {
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
      patchAtFirstNote[channel] = {
        program,
        bankMSB: bankCandidateMSB[channel],
        bankLSB: bankCandidateLSB[channel],
        isGMGSDrum: channel === 9,
      }
    }
  }

  for (let ch = 0; ch < 16; ch++) {
    if (patchAtFirstNote[ch]) continue
    if (programCandidate[ch] == null) continue
    patchAtFirstNote[ch] = {
      program: programCandidate[ch],
      bankMSB: bankCandidateMSB[ch],
      bankLSB: bankCandidateLSB[ch],
      isGMGSDrum: ch === 9,
    }
  }

  for (let ch = 0; ch < 16; ch++) {
    if (patchAtFirstNote[ch]) continue
    if (!hasAnyEvent[ch]) continue
    patchAtFirstNote[ch] = { program: 0, bankMSB: bankMSB[ch], bankLSB: bankLSB[ch], isGMGSDrum: ch === 9 }
  }

  return patchAtFirstNote
}

function resolvePatchName(presetList, patch, channelIndex) {
  if (!patch) return channelIndex === 9 ? 'Drums' : '—'
  if (patch.isGMGSDrum || channelIndex === 9) return 'Drums'
  const exact = presetList?.find(
    (p) => p.program === patch.program && p.bankMSB === patch.bankMSB && p.bankLSB === patch.bankLSB,
  )
  if (exact?.name) return exact.name

  const byProgramBank = presetList?.find((p) => p.program === patch.program && p.bankMSB === patch.bankMSB)
  if (byProgramBank?.name) return byProgramBank.name

  const fallback = presetList?.find((p) => p.program === patch.program)
  return fallback?.name || `Program ${patch.program + 1}`
}

class SynthEngine {
  constructor() {
    this._listeners = new Set()
    this._initialized = false
    this._initializing = null

    this._context = null
    this._synth = null
    this._seq = null

    this._raf = 0
    this._prevFinished = false
    this._isAdvancing = false
    this._isStopping = false

    this._state = {
      ready: false,
      status: 'Initializing…',
      soundFontUrl: defaultSoundFontUrl,
      soundFontName: 'GM',
      midiUrl: '',
      midiName: '',
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      reverbGain: 0.6,
      chorusGain: 0.6,
      transposition: 0,
      queue: [],
      queueIndex: -1,
      history: [],
      pendingSong: null,
      enabledChannels: Array.from({ length: 16 }, () => true),
      channelInstrumentNames: Array.from({ length: 16 }, (_, i) => (i === 9 ? 'Drums' : '—')),
      lrcName: '',
      lrcEntries: [],
      lyricOffsetMs: 0,
      activeLyricIndex: -1,
      karaokeProgress: 0,
    }
  }

  subscribe(listener) {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  getSnapshot() {
    return this._state
  }

  _emit() {
    for (const listener of this._listeners) listener()
  }

  _setState(patch) {
    this._state = { ...this._state, ...patch }
    this._emit()
  }

  async ensureInitialized() {
    if (this._initialized) return
    if (this._initializing) return this._initializing

    this._initializing = (async () => {
      this._setState({ status: 'Loading SynthEngine…' })
      const context = new AudioContext()
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

      try {
        this._setState({
          reverbGain: Number(synth.getMasterParameter('reverbGain')) || 0,
          chorusGain: Number(synth.getMasterParameter('chorusGain')) || 0,
          transposition: Number(synth.getMasterParameter('transposition')) || 0,
        })
      } catch {
        // ignore
      }

      this._state.enabledChannels.forEach((enabled, i) => synth.muteChannel(i, !enabled))

      this._initialized = true
      this._setState({ ready: true, status: 'Ready' })
      this._startClock()
    })()

    try {
      await this._initializing
    } finally {
      this._initializing = null
    }
  }

  _startClock() {
    if (this._raf) return
    const tick = () => {
      const seq = this._seq
      if (seq) {
        const currentTime = seq.currentHighResolutionTime ?? seq.currentTime ?? 0
        const duration = seq.duration || 0

        const t = currentTime - this._state.lyricOffsetMs / 1000
        const activeLyricIndex = findActiveLyricIndex(this._state.lrcEntries, t)
        let karaokeProgress = 0
        if (activeLyricIndex >= 0) {
          const start = this._state.lrcEntries[activeLyricIndex].time
          const end = this._state.lrcEntries[activeLyricIndex + 1]?.time ?? Math.max(start + 1, duration || start + 1)
          const denom = Math.max(0.001, end - start)
          karaokeProgress = Math.min(1, Math.max(0, (t - start) / denom))
        }

        const isPlaying = !seq.paused && !seq.isFinished
        this._setState({ currentTime, duration, isPlaying, activeLyricIndex, karaokeProgress })

        if (seq.isFinished && !this._prevFinished) {
          this._prevFinished = true
          this._advanceQueueIfNeeded().catch(() => {
            // ignore
          })
        }
        if (!seq.isFinished) this._prevFinished = false
      }
      this._raf = window.requestAnimationFrame(tick)
    }
    this._raf = window.requestAnimationFrame(tick)
  }

  async resumeAudio() {
    await this.ensureInitialized()
    await this._context.resume()
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

  async loadMidiFromUrl(url, options = {}) {
    await this.ensureInitialized()
    this._setState({ status: `Loading MIDI: ${url}` })
    const response = await fetch(url)
    if (!response.ok) throw new Error(`MIDI HTTP ${response.status}`)
    const buffer = await response.arrayBuffer()
    console.log({ status: `Loading MIDI: ${url}` })

    this._seq.pause()
    this._seq.currentTime = 0
    this._synth.stopAll(true)
    this._seq.loadNewSongList([{ binary: buffer, fileName: url.split('/').pop() }])
    const midiName = url.split('/').pop() || url
    this._setState({ midiUrl: url, midiName, status: `MIDI loaded: ${midiName}` })

    this._updateChannelInstrumentNames().catch(() => {
      // ignore
    })

    const autoPlay = options.autoPlay !== false
    if (autoPlay) this.play()

    return buffer
  }

  async loadMidiFromFile(file, options = {}) {
    await this.ensureInitialized()
    const buffer = await file.arrayBuffer()
    const midiName = file.name
    this._seq.pause()
    this._seq.currentTime = 0
    this._synth.stopAll(true)
    this._seq.loadNewSongList([{ binary: buffer, fileName: midiName }])
    this._setState({ midiUrl: '', midiName, status: `MIDI loaded: ${midiName}` })

    this._updateChannelInstrumentNames().catch(() => {
      // ignore
    })

    const autoPlay = options.autoPlay !== false
    if (autoPlay) this.play()

    return buffer
  }

  setPendingSong(song) {
    this._setState({ pendingSong: song || null })
  }

  clearPendingSong() {
    this._setState({ pendingSong: null })
  }

  enqueueSong(song) {
    if (!song) return
    const next = this._state.queue.slice()
    next.push(song)
    this._setState({ queue: next })
  }

  enqueuePendingSong() {
    if (!this._state.pendingSong) return
    this.enqueueSong(this._state.pendingSong)
    this.clearPendingSong()
  }

  clearQueue() {
    this._setState({ queue: [], queueIndex: -1 })
  }

  removeFromQueue(index) {
    const i = Number(index)
    if (!Number.isInteger(i)) return
    const next = this._state.queue.slice()
    if (i < 0 || i >= next.length) return
    next.splice(i, 1)
    let queueIndex = this._state.queueIndex
    if (queueIndex >= next.length) queueIndex = next.length - 1
    this._setState({ queue: next, queueIndex })
  }

  bumpQueueNext(index) {
    const i = Number(index)
    if (!Number.isInteger(i)) return
    const queue = this._state.queue.slice()
    if (i < 0 || i >= queue.length) return
    const currentIndex = this._state.queueIndex
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
    if (!Number.isInteger(i) || i < 0 || i >= this._state.queue.length) return
    const song = this._state.queue[i]
    if (!song?.url) return
    await this.resumeAudio()
    this.setTransposition(0)
    this._setState({
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
          this._setState({
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
    if (!this._state.queue.length) return
    if (this._state.queueIndex >= 0) return
    await this.playQueueFrom(0)
  }

  async _advanceQueueIfNeeded() {
    await this._advanceQueue({ autoPlayNext: true })
  }

  play() {
    if (!this._seq) return
    this._seq.play()
  }

  pause() {
    if (!this._seq) return
    this._seq.pause()
  }

  stop() {
    if (!this._seq || !this._synth) return
    this._seq.pause()
    this._seq.currentTime = 0
    this._synth.stopAll(true)
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
      if (this._state.queueIndex >= 0 && this._seq?.paused) {
        await this.playQueueFrom(this._state.queueIndex)
      }
    } finally {
      this._isStopping = false
    }
  }

  async _advanceQueue({ autoPlayNext }) {
    if (this._isAdvancing) return
    if (this._state.queueIndex < 0) return
    this._isAdvancing = true
    try {
      const queue = this._state.queue.slice()
      const history = this._state.history.slice()
      const currentIndex = this._state.queueIndex
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

  setTransposition(semitones) {
    if (!this._synth) return
    const v = Number(semitones) || 0
    this._synth.setMasterParameter('transposition', v)
    this._setState({ transposition: v })
  }

  shiftTransposition(deltaSemitones) {
    const next = (Number(this._state.transposition) || 0) + (Number(deltaSemitones) || 0)
    this.setTransposition(next)
  }

  setChannelEnabled(channelIndex, enabled) {
    if (!this._synth) return
    const idx = Number(channelIndex)
    if (!Number.isInteger(idx) || idx < 0 || idx > 15) return
    const next = this._state.enabledChannels.slice()
    next[idx] = Boolean(enabled)
    this._synth.muteChannel(idx, !next[idx])
    this._setState({ enabledChannels: next })
  }

  async loadLrcFromFile(file) {
    const text = await file.text()
    const entries = parseLrc(text)
    this._setState({ lrcName: file.name, lrcEntries: entries })
  }

  setLyricOffsetMs(ms) {
    const value = Math.max(-30000, Math.min(30000, Number(ms) || 0))
    this._setState({ lyricOffsetMs: value })
  }

  async _updateChannelInstrumentNames(timeoutMs = 1500) {
    if (!this._seq || !this._synth) return
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('getMIDI timeout')), timeoutMs)
    })
    const midi = await Promise.race([this._seq.getMIDI(), timeout])
    const patches = extractChannelPatchesFromMIDI(midi)
    const channelInstrumentNames = patches.map((patch, idx) => resolvePatchName(this._synth.presetList, patch, idx))
    this._setState({ channelInstrumentNames })
  }
}

const synthEngine = new SynthEngine()

export { synthEngine }
