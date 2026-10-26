export const SMU_EQ_PRESETS = ['FLAT', 'JAZZ', 'POP', 'ROCK', 'CONCERT']
export const eqPresetMessage = preset => [0xf0, 0x43, 0x10, 0x4c, 2, 0x40, 0, preset, 0xf7]

export function isMidiReset(bytes) {
  return (bytes[0] === 0xf0 && bytes[1] === 0x43 && bytes[3] === 0x4c && bytes[4] === 0 && bytes[5] === 0 && [0x7e, 0x7f].includes(bytes[6])) ||
    (bytes[0] === 0xf0 && bytes[1] === 0x7e && bytes[3] === 9) ||
    (bytes[0] === 0xf0 && bytes[1] === 0x41 && bytes[3] === 0x42 && bytes[4] === 0x12 && bytes[5] === 0x40 && bytes[6] === 0 && bytes[7] === 0x7f)
}

// Preserve writes outside master EQ even if one XG block spans its addresses.
export function filterLockedEq(bytes, locked) {
  if (!locked || bytes[0] !== 0xf0 || bytes[1] !== 0x43 || (bytes[2] & 0xf0) !== 0x10 || bytes[3] !== 0x4c) return [bytes]
  const start = (bytes[4] << 14) | (bytes[5] << 7) | bytes[6]
  const first = (2 << 14) | (0x40 << 7)
  const last = first + 0x15
  const length = bytes.length - 8
  if (start >= last || start + length <= first) return [bytes]
  const segments = []
  const add = (offset, end) => {
    if (end <= offset) return
    const address = start + offset
    segments.push([0xf0, 0x43, bytes[2], 0x4c, (address >> 14) & 127,
      (address >> 7) & 127, address & 127, ...bytes.slice(7 + offset, 7 + end), 0xf7])
  }
  add(0, Math.max(0, first - start))
  add(Math.min(length, last - start), length)
  return segments
}
