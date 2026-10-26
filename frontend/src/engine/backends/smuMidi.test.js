import { describe, expect, it } from 'vitest'
import { SmuMidiControls } from './smuMidi.js'

describe('MU2000 performance controls', () => {
  it('preserves XG SysEx and programs, transposes melody and preserves drum pitch', () => {
    const controls = new SmuMidiControls()
    controls.transpose = 3
    const sysex = [0xf0, 0x43, 0x10, 0x4c, 0, 0, 0x7e, 0, 0xf7]
    expect(controls.transform(sysex, 0)).toBe(sysex)
    expect(controls.transform([0x90, 60, 100], 0)).toEqual([0x90, 63, 100])
    expect(controls.transform([0x99, 36, 100], 3)).toEqual([0x99, 36, 100])
    const program = [0xc0, 20]
    expect(controls.transform(program, 0)).toBe(program)
    controls.transform([0xb1, 0, 127], 1)
    expect(controls.transform([0x91, 40, 100], 1)).toEqual([0x91, 40, 100])
  })
  it('matches note-offs to original pitches after a key change and isolates ports', () => {
    const controls = new SmuMidiControls()
    controls.transpose = -2
    controls.transform([0x90, 60, 100], 0)
    controls.transpose = 4
    controls.transform([0x90, 60, 100], 1)
    expect(controls.transform([0x80, 60, 0], 0)).toEqual([0x80, 58, 0])
    expect(controls.transform([0x90, 60, 0], 1)).toEqual([0x90, 64, 0])
  })
  it('suppresses muted and out-of-range notes without producing unmatched note-offs', () => {
    const controls = new SmuMidiControls()
    controls.muted[0] = true
    expect(controls.transform([0x90, 60, 80], 3)).toBeNull()
    controls.muted[0] = false
    expect(controls.transform([0x80, 60, 0], 3)).toBeNull()
    controls.transpose = -12
    expect(controls.transform([0x90, 2, 80], 0)).toBeNull()
    expect(controls.transform([0x80, 2, 0], 0)).toBeNull()
  })
})
