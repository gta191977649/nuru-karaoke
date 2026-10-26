import { describe, expect, it } from 'vitest'
import { chaseSmuEvents } from './smuSeek.js'

const event = (frame, bytes, port = 0) => ({ frame, bytes, port })
describe('MU2000 seek state chase', () => {
  it('collapses dense controller curves without replaying the skipped notes or time', () => {
    const events = Array.from({ length: 10000 }, (_, i) => event(i, [0xb0, 11, i % 128]))
    const result = chaseSmuEvents(events, 9000)
    expect(result.cursor).toBe(9001)
    expect(result.controls).toEqual([{ port: 0, bytes: [0xb0, 11, 9000 % 128] }])
    expect(result.held).toEqual([])
  })
  it('preserves bank/program, RPN and SysEx ordering, and isolates MIDI ports', () => {
    const messages = [[0xb0,0,1], [0xb0,32,2], [0xc0,10], [0xb0,0,3],
      [0xb0,101,0], [0xb0,100,0], [0xb0,6,12], [0xb0,101,127]]
    const events = messages.map((bytes, i) => event(i, bytes))
    events.push(event(8, [0xc0, 30], 2))
    expect(chaseSmuEvents(events, 20).controls.map(e => e.bytes)).toEqual([...messages, [0xc0,30]])
    expect(chaseSmuEvents(events, 20).controls.at(-1).port).toBe(2)
  })
  it('chases held and sustained notes, drops released notes after pedal up, and clears on reset', () => {
    const events = [event(0,[0xb0,64,127]), event(1,[0x90,60,90]), event(2,[0x80,60,0]),
      event(3,[0x91,64,100],1), event(4,[0xb0,64,0]), event(5,[0xf0,0x43,0x10,0x4c,0,0,0x7e,0,0xf7])]
    expect(chaseSmuEvents(events, 3).held).toEqual([
      { port: 0, bytes: [0x90,60,90] }, { port: 0, bytes: [0x80,60,0] }, { port: 1, bytes: [0x91,64,100] },
    ])
    expect(chaseSmuEvents(events, 4).held).toEqual([{ port: 1, bytes: [0x91,64,100] }])
    expect(chaseSmuEvents(events, 5).held).toEqual([])
    expect(chaseSmuEvents(events, 5).controls).toHaveLength(1)
  })
})
