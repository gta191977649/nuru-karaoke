import { isMidiReset } from './smuEq.js'

// Sequencer-style chase: restore controls and held notes, not skipped PCM/tails.
// Bank/program, RPN/NRPN and SysEx are barriers so their ordering stays intact.
export function chaseSmuEvents(events, targetFrame) {
  let cursor = 0
  let controls = []
  const latest = new Map()
  const notes = new Map()
  const sustain = Array(64).fill(false)
  const flush = () => latest.clear()
  const clearNotes = channel => {
    for (const [key, stack] of notes) if (stack[0]?.physical === channel) notes.delete(key)
  }
  for (; cursor < events.length && events[cursor].frame <= targetFrame; cursor++) {
    const event = events[cursor]
    const bytes = event.bytes, type = bytes[0] & 0xf0
    const physical = event.port * 16 + (bytes[0] & 15)
    const key = `${physical}:${bytes[1]}`
    if (isMidiReset(bytes)) {
      controls = []; flush(); notes.clear(); sustain.fill(false)
    }
    if (type === 0x90 && bytes[2] > 0) {
      const stack = notes.get(key) || []
      stack.push({ physical, port: event.port, bytes: [...bytes], released: false })
      notes.set(key, stack)
      continue
    }
    if (type === 0x80 || (type === 0x90 && bytes[2] === 0)) {
      const stack = notes.get(key)
      const at = stack?.findIndex(note => !note.released) ?? -1
      if (at >= 0) {
        if (sustain[physical]) stack[at].released = true
        else stack.splice(at, 1)
        if (!stack.length) notes.delete(key)
      }
      continue
    }
    if (type === 0xb0) {
      if (bytes[1] === 64 || bytes[1] === 121) {
        sustain[physical] = bytes[1] === 64 && bytes[2] >= 64
        if (!sustain[physical]) for (const [noteKey, stack] of notes) {
          if (stack[0]?.physical === physical) {
            const held = stack.filter(note => !note.released)
            if (held.length) notes.set(noteKey, held); else notes.delete(noteKey)
          }
        }
      }
      if (bytes[1] === 120 || bytes[1] === 123) clearNotes(physical)
    }
    const coalesce = type === 0xe0 || type === 0xd0 || (type === 0xb0 &&
      ![0, 32, 6, 38, 96, 97, 98, 99, 100, 101, 120, 121, 123].includes(bytes[1]))
    if (coalesce) {
      const id = `${physical}:${type}:${type === 0xb0 ? bytes[1] : ''}`
      if (latest.has(id)) controls[latest.get(id)] = null
      latest.set(id, controls.length)
    } else flush()
    controls.push({ bytes, port: event.port })
  }
  const held = []
  for (const stack of notes.values()) for (const note of stack) {
    held.push({ bytes: note.bytes, port: note.port })
    if (note.released) held.push({ bytes: [0x80 | (note.physical & 15), note.bytes[1], 0], port: note.port })
  }
  return { controls: controls.filter(Boolean), held, cursor }
}
