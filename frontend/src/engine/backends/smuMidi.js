// Transform only performance controls. All original bank/program/SysEx bytes survive.
export class SmuMidiControls {
  constructor() {
    this.transpose = 0
    this.muted = Array(16).fill(false)
    this.reset()
  }

  reset() {
    this.drums = Array.from({ length: 64 }, (_, i) => i % 16 === 9)
    this.notes = new Map()
  }

  transform(bytes, port) {
    const status = bytes[0]
    const type = status & 0xf0
    const channel = status & 15
    const physical = port * 16 + channel
    if (status === 0xf0) {
      // XG System On and XG multipart receive-mode (normal/drum).
      if (bytes[1] === 0x43 && bytes[3] === 0x4c) {
        if (bytes[4] === 0 && bytes[5] === 0 && bytes[6] === 0x7e) this.reset()
        if (bytes[4] === 8 && bytes[6] === 7 && bytes[5] < 64) this.drums[bytes[5]] = bytes[7] !== 0
      }
      // GM / GM2 resets.
      if (bytes[1] === 0x7e && bytes[3] === 9) this.reset()
      return bytes
    }
    if (type === 0xb0 && bytes[1] === 0) this.drums[physical] = bytes[2] === 127 || bytes[2] === 126
    if (type !== 0x80 && type !== 0x90) return bytes
    const key = `${physical}:${bytes[1]}`
    const on = type === 0x90 && bytes[2] > 0
    if (on) {
      const note = this.drums[physical] ? bytes[1] : bytes[1] + this.transpose
      const result = this.muted[channel] || note < 0 || note > 127 ? null : [status, note, bytes[2]]
      const stack = this.notes.get(key) || []
      stack.push(result?.[1] ?? null)
      this.notes.set(key, stack)
      return result
    }
    const stack = this.notes.get(key)
    const note = stack?.length ? stack.shift() : bytes[1]
    if (stack && !stack.length) this.notes.delete(key)
    return note === null ? null : [status, note, bytes[2]]
  }
}
