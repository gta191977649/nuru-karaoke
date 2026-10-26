import { describe, expect, it } from 'vitest'
import { eqPresetMessage, filterLockedEq, isMidiReset, SMU_EQ_PRESETS } from './smuEq.js'

describe('native MU2000 master EQ', () => {
  it('uses the upstream POPS type 2 for the displayed POP preset', () => {
    expect(SMU_EQ_PRESETS[2]).toBe('POP')
    expect(eqPresetMessage(2)).toEqual([0xf0,0x43,0x10,0x4c,2,0x40,0,2,0xf7])
  })
  it('blocks song EQ writes only when locked and preserves surrounding XG parameters', () => {
    const eq = eqPresetMessage(4)
    expect(filterLockedEq(eq, true)).toEqual([])
    expect(filterLockedEq(eq, false)).toEqual([eq])
    const fx = [0xf0,0x43,0x10,0x4c,2,1,0,5,0xf7]
    expect(filterLockedEq(fx, true)).toEqual([fx])
    const spanning = [0xf0,0x43,0x10,0x4c,2,0x3f,0x7f, ...Array(23).fill(7), 0xf7]
    expect(filterLockedEq(spanning, true)).toEqual([
      [0xf0,0x43,0x10,0x4c,2,0x3f,0x7f,7,0xf7],
      [0xf0,0x43,0x10,0x4c,2,0x40,0x15,7,0xf7],
    ])
  })
  it('detects XG, GM/GM2 and GS resets so locked EQ can be reasserted', () => {
    expect(isMidiReset([0xf0,0x43,0x10,0x4c,0,0,0x7e,0,0xf7])).toBe(true)
    expect(isMidiReset([0xf0,0x7e,0x7f,9,3,0xf7])).toBe(true)
    expect(isMidiReset([0xf0,0x41,0x10,0x42,0x12,0x40,0,0x7f,0,0x41,0xf7])).toBe(true)
    expect(isMidiReset(eqPresetMessage(0))).toBe(false)
  })
})
