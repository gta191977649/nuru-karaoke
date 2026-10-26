import { parseSmf, resolvePorts } from './smuSmf.ts'
import { loadSmuResources } from './smuResources.js'
import { prepareSmuResources } from './smuBoot.js'
import { SMU_PROCESSOR_NAME, SMU_RUNTIME_VERSION } from './smuVersion.js'

const registered = new WeakSet()

export class SmuBackend {
  id = 'smu2000'
  constructor({ exact = false, eqPreset = 2, eqLocked = true, onState = () => {}, onLcd = () => {} } = {}) {
    this.exact = exact
    this.eqPreset = eqPreset
    this.eqLocked = eqLocked
    this.session = crypto.randomUUID()
    this.lcdSequence = -1
    this.lcdSubscribed = false
    this.latestLcd = null
    this.onState = onState
    this.onLcd = onLcd
    this.pending = new Map()
    this.serial = 0
    this.time = 0
    this.duration = 0
    this.paused = true
    this.isFinished = false
    this.busy = false
    this.listeners = new Map()
    this.eventHandler = { addEvent: (event, key, callback) => this.listeners.set(`${event}:${key}`, callback) }
    this.transport = this
    this.systemParameters = { keyShift: 0, gain: 1, reverbGain: 1, chorusGain: 1 }
    // Existing MIDI-channel UI is one logical channel across all four ports.
    this.synth = this
    this.presetList = []
    this.midiChannels = Array.from({ length: 64 }, (_, index) => ({
      setSystemParameter: (key, muted) => {
        if (key === 'isMuted') this.notify('mute', { channel: index % 16, muted })
      },
    }))
  }

  async initialize(context, onProgress) {
    this.context = context
    this.onProgress = onProgress
    const resources = await loadSmuResources(onProgress)
    onProgress({ stage: 'smu-boot', text: 'S-MU2000 を起動しています…' })
    const prepared = await prepareSmuResources(resources, this.exact, this.session, onProgress,
      worker => { this.bootWorker = worker })
    this.metrics = prepared.metrics
    this.receive(prepared.lcd)
    if (!registered.has(context)) {
      await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}smu2000/processor.js?v=${SMU_RUNTIME_VERSION}`)
      registered.add(context)
    }
    this.node = new AudioWorkletNode(context, SMU_PROCESSOR_NAME, {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
    })
    this.output = context.createGain()
    this.node.connect(this.output)
    // Connected at zero gain while booting, otherwise process() never runs.
    this.bootGain = context.createGain()
    this.bootGain.gain.value = 0
    this.output.connect(this.bootGain).connect(context.destination)
    this.node.port.onmessage = ({ data }) => this.receive(data)
    this.node.onprocessorerror = () => this.receive({ type: 'error', message: 'S-MU2000 AudioWorklet failed' })
    // Audio activation belongs to existing user interactions, never initialization.
    await this.request('init', { module: resources.module, roms: prepared.roms,
      snapshot: prepared.snapshot, exact: this.exact, session: this.session,
      eqPreset: this.eqPreset, eqLocked: this.eqLocked },
      [...prepared.roms.map(rom => rom.data), prepared.snapshot])
    return this
  }

  activate() { this.bootGain?.disconnect(); this.output.disconnect(this.bootGain) }
  request(type, data = {}, transfer = []) {
    if (['play', 'load', 'seek', 'transpose'].includes(type)) {
      this.busy = true
      this.onState({ synthBusy: true, isPlaying: false })
    }
    const id = ++this.serial
    if (type === 'seek') this.lastSeekId = id
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`S-MU2000 ${type} timeout`))
      }, type === 'dispose' ? 2000
        : type === 'seek' || type === 'play' || type === 'transpose'
          ? Math.max(120000, this.duration * 2000) : 120000)
      this.pending.set(id, { resolve, reject, timeout })
      this.node.port.postMessage({ type, id, ...data }, transfer)
    })
  }
  notify(type, data = {}) { this.node?.port.postMessage({ type, ...data }) }
  receive(message) {
    if (message.type === 'ack') {
      const pending = this.pending.get(message.id)
      if (pending) { clearTimeout(pending.timeout); pending.resolve(); this.pending.delete(message.id) }
    } else if (message.type === 'cancelled') {
      const pending = this.pending.get(message.id)
      if (pending) { clearTimeout(pending.timeout); pending.reject(new Error('Playback operation cancelled')); this.pending.delete(message.id) }
    } else if (message.type === 'error') {
      for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(new Error(message.message)) }
      this.pending.clear()
      this.paused = true
      this.busy = false
      this.onState({ isPlaying: false, synthBusy: false, status: message.message, synthError: message.message })
    } else if (message.type === 'busy') {
      this.busy = message.busy
      this.onState({ synthBusy: message.busy })
    } else if (message.type === 'position') {
      if (message.operation < (this.lastSeekId || 0)) return
      this.time = message.position
      this.lastContextTime = message.contextTime
      this.paused = !message.running
      this.isFinished = message.done
      this.busy = false
      this.onState({ synthBusy: false, isPlaying: message.running, currentTime: message.position,
        playbackFinished: message.done })
    } else if (message.type === 'eq-state') {
      this.onState({ smuEqActualPreset: message.preset })
    } else if (message.type === 'lcd') {
      if (message.session !== this.session || message.sequence <= this.lcdSequence) return
      this.lcdSequence = message.sequence
      this.latestLcd = message
      if (this.lcdSubscribed) this.onLcd(message)
    }
    else if (message.type === 'boot') this.onProgress?.({ stage: 'smu-boot', text: 'S-MU2000 を起動しています…', fraction: message.fraction })
  }
  get currentTime() { return this.currentHighResolutionTime }
  set currentTime(value) {
    if (value === 0 && this.time === 0) return
    void this.seek(value).catch(() => {})
  }
  get currentHighResolutionTime() {
    return Math.min(this.duration + 2, this.time + (!this.paused && !this.busy
      ? Math.max(0, this.context.currentTime - (this.lastContextTime ?? this.context.currentTime)) : 0))
  }
  async prepare(buffer, name) {
    const song = parseSmf(new Uint8Array(buffer))
    this.events = resolvePorts(song.events, true, true).map(event => ({ ...event, frame: Math.round(event.time * 44100) }))
    this.duration = song.length
    this.name = name
    await this.request('load', { events: this.events, length: this.duration })
    this.time = 0; this.paused = true; this.isFinished = false
  }
  connectMIDIOutput() {} // Scheduling remains in this backend's audio clock.
  getMIDI() { return Promise.resolve(this.referenceMidi) }
  async play() {
    if (this.busy) return false
    await this.request('play')
    this.paused = false; this.isFinished = false
    return true
  }
  pause() { this.time = this.currentTime; this.paused = true; this.notify('pause') }
  stopAll() { this.notify('panic') }
  async stop() { this.paused = true; this.time = 0; this.isFinished = false; await this.request('stop') }
  async seek(position) {
    if (position === 0 && this.time === 0 && !this.isFinished && !this.seeking) return
    void this.context.resume().catch(() => {})
    const generation = (this.seekGeneration || 0) + 1
    if (!this.seeking) this.seekRunning = !this.paused
    this.seeking = true
    this.seekGeneration = generation
    try {
      await this.request('seek', { position, running: this.seekRunning })
      if (generation === this.seekGeneration) this.time = Math.min(this.duration, Math.max(0, position))
    } finally { if (generation === this.seekGeneration) this.seeking = false }
  }
  setChannelMuted(channel, muted) { this.notify('mute', { channel, muted }) }
  setEq(preset, locked) {
    this.eqPreset = preset; this.eqLocked = locked
    this.notify('eq', { preset, locked })
  }
  sendMessage(bytes, channelOffset = 0) { this.notify('midi', { bytes: Array.from(bytes), port: Math.floor(channelOffset / 16) }) }
  controllerChange(channel, controller, value) { this.sendMessage([0xb0 | (channel & 15), controller, value], Math.floor(channel / 16) * 16) }
  setSystemParameter(key, value) {
    if (this.systemParameters[key] === value) return
    this.systemParameters[key] = value
    if (key === 'keyShift') void this.request('transpose', { value }).catch(() => {})
  }
  subscribeLcd(enabled) {
    this.lcdSubscribed = enabled
    if (enabled && this.latestLcd) this.onLcd(this.latestLcd)
    this.notify('lcd', { enabled })
  }
  async dispose() {
    this.bootWorker?.terminate()
    if (this.node) {
      try { await this.request('dispose') } finally {
        this.node.disconnect(); this.output.disconnect(); this.bootGain?.disconnect(); this.node.port.close()
        for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(new Error('Disposed')) }
        this.pending.clear()
      }
    }
  }
}
