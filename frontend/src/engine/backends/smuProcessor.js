import { instantiateSmu } from './smuWasm.js'
import { SMU_PROCESSOR_NAME } from './smuVersion.js'
import { SmuMidiControls } from './smuMidi.js'
import { installSmuRoms, readSmuLcd } from './smuCore.js'
import { eqPresetMessage, filterLockedEq, isMidiReset } from './smuEq.js'
import { chaseSmuEvents } from './smuSeek.js'

const RATE = 44100

export class SmuProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.controls = new SmuMidiControls()
    this.eqPreset = 2
    this.eqLocked = true
    this.events = []
    this.position = 0
    this.cursor = 0
    this.length = 0
    this.state = 'idle'
    this.running = false
    this.alive = true
    this.lcd = false
    this.lastReport = -1
    this.lastLcd = -1
    this.lcdSequence = 0
    this.fifoLeft = new Float32Array(8192)
    this.fifoRight = new Float32Array(8192)
    this.fifoLength = 0
    this.phase = 0
    this.reportedError = false
    this.port.onmessage = ({ data }) => {
      this.command(data).catch(error => this.fail(error, data.id))
    }
  }

  post(message, transfer = []) { this.port.postMessage(message, transfer) }
  ack(id) { if (id) this.post({ type: 'ack', id }) }
  fail(error, id) {
    this.running = false
    this.state = 'error'
    this.post({ type: 'error', id: id || this.pending, message: String(error.message || error) })
    this.pending = null
  }

  async command(message) {
    const { type, id } = message
    if (id) this.operation = id
    if (type === 'init') {
      this.emu = await instantiateSmu(message.module)
      this.exact = message.exact
      this.eqPreset = message.eqPreset ?? 2
      this.eqLocked = message.eqLocked !== false
      installSmuRoms(this.emu, message.roms)
      if (!message.snapshot?.byteLength) throw new Error('S-MU2000 boot snapshot missing')
      this.session = message.session
      this.bootLength = message.snapshot.byteLength
      this.bootPointer = this.emu.malloc(this.bootLength)
      new Uint8Array(this.emu.memory.buffer).set(new Uint8Array(message.snapshot), this.bootPointer)
      this.out = this.emu.malloc(8192 * 4)
      this.midi = this.emu.malloc(65536)
      this.dots = this.emu.malloc(384)
      this.rebuild(0, false, id)
      return
    }
    if (type === 'dispose') {
      this.emu?.smu_shutdown()
      if (this.emu) for (const ptr of [this.out, this.midi, this.dots, this.bootPointer]) this.emu.free(ptr)
      this.emu = null
      this.alive = false
      this.ack(id)
      return
    }
    if (type === 'lcd') { this.lcd = message.enabled; if (this.lcd) this.publishLcd(); this.ack(id); return }
    if (!this.emu) throw new Error('S-MU2000 not initialized')
    if (type === 'load') {
      this.events = message.events
      this.length = message.length
      this.rebuild(0, false, id)
      return
    }
    if (type === 'play') {
      if (this.needsRebuild) this.rebuild(this.position, true, id)
      else { this.running = true; this.state = 'ready'; this.ack(id); this.report() }
      return
    }
    if (type === 'pause' || type === 'stop') {
      if (type === 'pause' && this.state === 'ready') {
        this.running = false
        this.ack(id); this.report()
        return
      }
      if (this.pending) this.post({ type: 'cancelled', id: this.pending })
      this.pending = null
      this.rebuild(0, false, id)
      return
    }
    if (type === 'seek') {
      if (this.pending) this.post({ type: 'cancelled', id: this.pending })
      this.rebuild(message.position, message.running, id); return
    }
    if (type === 'eq') {
      this.eqPreset = message.preset; this.eqLocked = message.locked
      this.applyEq(); this.ack(id); return
    }
    if (type === 'transpose') {
      this.controls.transpose = message.value
      // Apply to following notes. Existing note-offs retain their original
      // translated pitch, so changing key never needs to restart the song.
      this.ack(id); this.report()
      return
    }
    if (type === 'mute') {
      this.controls.muted[message.channel] = message.muted
      this.applyMute()
    }
    if (type === 'midi') this.send(message.bytes, message.port || 0)
    if (type === 'panic') this.silence()
    this.ack(id)
  }

  send(bytes, port, internal = false) {
    if (!bytes?.length) return
    for (const message of internal ? [bytes] : filterLockedEq(bytes, this.eqLocked)) {
      if (message.length > 65536) throw new Error('SysEx exceeds 64 KiB')
      new Uint8Array(this.emu.memory.buffer).set(message, this.midi)
      if (this.emu.smu_midi_in(port, this.midi, message.length) < 0) throw new Error('MIDI input failed')
      if (!internal && this.eqLocked && isMidiReset(message)) this.applyEq()
    }
  }
  applyMute() {
    const mask = this.controls.muted.reduce((value, muted, channel) => value | (muted ? 1 << channel : 0), 0)
    this.emu.smu_mute_channels(mask)
  }
  applyEq() { this.send(eqPresetMessage(this.eqPreset), 0, true) }
  silence() {
    for (let port = 0; port < 4; port++) for (let ch = 0; ch < 16; ch++) {
      this.send([0xb0 | ch, 64, 0], port)
      this.send([0xb0 | ch, 120, 0], port)
    }
  }
  rebuild(position, running, id) {
    this.pending = id
    this.running = false
    this.resumeAfterBuild = running
    this.target = Math.round(Math.min(this.length, Math.max(0, position)) * RATE)
    this.position = 0
    this.frame = 0
    this.cursor = 0
    this.phase = 0
    this.fifoLength = 0
    this.controls.reset()
    this.reportedError = false
    if (this.emu.smu_boot_restore(this.bootPointer, this.bootLength, this.exact ? 1 : 0) < 0) {
      throw new Error('S-MU2000 boot snapshot restore failed')
    }
    // Control chase needs firmware throughput. Native keepalive deliberately
    // sleeps between notes, which otherwise turns dense SysEx seeks into seconds.
    if (this.target > 0 && !this.exact) this.emu.smu_set_native_engine(0)
    this.applyMute()
    this.applyEq()
    this.emu.smu_fast_midi(this.target > 0 ? 1 : 0)
    this.seekState = this.target > 0 ? chaseSmuEvents(this.events, this.target) : null
    this.seekAt = 0
    this.seekTail = 0
    this.state = this.target > 0 ? 'rebuilding' : 'ready'
    this.needsRebuild = false
    if (this.target === 0) {
      this.running = running
      this.ack(this.pending); this.pending = null
      this.post({ type: 'busy', busy: false })
      this.report()
      this.publishLcd()
    } else this.post({ type: 'busy', busy: true })
  }

  publishLcd() {
    if (!this.emu || !this.dots) return
    this.lastLcd = currentTime
    const frame = readSmuLcd(this.emu, this.dots, this.session, ++this.lcdSequence)
    this.post(frame, [frame.dots.buffer])
  }

  // Render at event boundaries, including during silent state reconstruction.
  render(count, offset = 0) {
    const left = this.fifoLeft
    const right = this.fifoRight
    if (offset + count > left.length) throw new Error('Unsupported audio quantum size')
    let written = 0
    while (written < count) {
      while (this.cursor < this.events.length && this.events[this.cursor].frame <= this.frame) {
        const event = this.events[this.cursor++]
        this.send(this.controls.transform(event.bytes, event.port), event.port)
      }
      const next = this.events[this.cursor]?.frame ?? Infinity
      const frames = Math.min(count - written, next - this.frame, 8192)
      if (frames <= 0) continue
      const got = this.emu.smu_render_frames(this.out, frames)
      if (got !== frames) throw new Error('S-MU2000 render failed')
      if (this.pcmView?.buffer !== this.emu.memory.buffer) {
        this.pcmView = new Int16Array(this.emu.memory.buffer, this.out, 8192 * 2)
      }
      const pcm = this.pcmView
      for (let i = 0; i < got; i++) {
        left[offset + written + i] = pcm[i * 2] / 32768
        right[offset + written + i] = pcm[i * 2 + 1] / 32768
      }
      this.frame += frames
      written += frames
    }
  }

  report(done = false) {
    this.post({ type: 'position', position: this.position, length: this.length,
      running: this.running, done, contextTime: currentTime, operation: this.operation })
    this.lastReport = currentTime
    this.post({ type: 'eq-state', preset: this.emu.smu_eq_type() })
  }

  process(_inputs, outputs) {
    const [left, right] = outputs[0] || []
    if (!left || !right || !this.alive) return this.alive
    left.fill(0); right.fill(0)
    try {
      if (this.state === 'rebuilding') {
        // Chase controls without rendering the skipped musical duration.
        const state = this.seekState
        for (let n = 0; n < 16 && this.seekAt < state.controls.length; n++) {
          const event = state.controls[this.seekAt++]
          this.send(this.controls.transform(event.bytes, event.port), event.port)
        }
        this.emu.smu_render_frames(this.out, 128)
        if (this.seekAt >= state.controls.length && this.emu.smu_midi_idle()) this.seekTail += 128
        else this.seekTail = 0
        if (this.seekTail >= 2048) {
          if (!this.exact) this.emu.smu_set_native_engine(1)
          for (const event of state.held) this.send(this.controls.transform(event.bytes, event.port), event.port)
          this.emu.smu_fast_midi(0)
          this.cursor = state.cursor
          this.frame = this.target
          this.position = this.target / RATE
          this.state = 'ready'
          this.running = this.resumeAfterBuild
          this.needsRebuild = false
          this.ack(this.pending); this.pending = null
          this.post({ type: 'busy', busy: false })
          this.report()
          this.publishLcd()
        }
      } else if (this.state === 'ready' && this.running) {
        const ratio = RATE / sampleRate
        const needed = Math.floor(this.phase + (left.length - 1) * ratio) + 2
        const oldLength = this.fifoLength
        const produced = Math.max(0, needed - oldLength)
        this.render(produced, oldLength)
        const l = this.fifoLeft, r = this.fifoRight
        for (let i = 0; i < left.length; i++) {
          const at = this.phase + i * ratio
          const base = Math.floor(at), frac = at - base
          left[i] = l[base] + (l[base + 1] - l[base]) * frac
          right[i] = r[base] + (r[base + 1] - r[base]) * frac
        }
        const consumed = Math.floor(this.phase + left.length * ratio)
        this.phase = this.phase + left.length * ratio - consumed
        this.fifoLength = oldLength + produced - consumed
        l.copyWithin(0, consumed, oldLength + produced)
        r.copyWithin(0, consumed, oldLength + produced)
        this.position += left.length / sampleRate
        if (this.position >= this.length + 2) {
          this.position = this.length
          this.running = false
          this.silence()
          this.needsRebuild = true
          this.report(true)
        } else if (currentTime - this.lastReport >= 0.1) this.report()
      }
      if (this.emu && this.lcd && currentTime - this.lastLcd >= 0.1) {
        this.publishLcd()
      }
    } catch (error) {
      if (!this.reportedError) { this.reportedError = true; this.fail(error) }
    }
    return this.alive
  }
}

if (typeof registerProcessor === 'function') registerProcessor(SMU_PROCESSOR_NAME, SmuProcessor)
