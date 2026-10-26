import fs from 'node:fs'
import { prepareSmuBoot } from '../src/engine/backends/smuBootWorker.js'
import { eqPresetMessage } from '../src/engine/backends/smuEq.js'

const directory = process.argv[2] || 'src/soundfont/rom'
const names = ['mu2000_flash.bin','xv364a0.ic49','xv365a0.ic50','xw848a0.ic53','xw849a0.ic54','sin-table.bin','hd44780u_b04.bin']
const roms = names.map((name, kind) => {
  const bytes = fs.readFileSync(`${directory}/${name}`)
  return { kind, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }
})
const messages = []
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: message => messages.push(message) } } }
globalThis.sampleRate = 44100
globalThis.currentTime = 0
const { SmuProcessor } = await import('../src/engine/backends/smuProcessor.js')
const module = await WebAssembly.compile(fs.readFileSync('public/smu2000/smu.wasm'))
const outputs = [[new Float32Array(128), new Float32Array(128)]]
for (const exact of [false, true]) {
  const { snapshot } = await prepareSmuBoot({ module, roms, exact, session: 'controls' })
  const processor = new SmuProcessor()
  await processor.command({ type: 'init', id: 1, module, roms, snapshot, exact, session: 'controls' })
  function run(seconds) {
    let power = 0, frames = 0
    const count = Math.ceil(seconds * 44100 / 128)
    for (let i = 0; i < count; i++) {
      processor.process([], outputs); currentTime += 128 / 44100
      if (processor.state === 'error') throw new Error(messages.at(-1).message)
      if (i > count / 2) for (const channel of outputs[0]) for (const value of channel) { power += value * value; frames++ }
    }
    return Math.sqrt(power / frames)
  }
  await processor.command({ type: 'load', events: [], length: 100 })
  await processor.command({ type: 'play' }); run(0.5)
  if (processor.emu.smu_eq_type() !== 2) throw new Error('Default POP was not applied to native core')
  await processor.command({ type: 'midi', bytes: eqPresetMessage(4), port: 0 }); run(0.3)
  if (processor.emu.smu_eq_type() !== 2) throw new Error('EQ LOCK allowed MIDI override')
  await processor.command({ type: 'midi', bytes: [0xf0,0x43,0x10,0x4c,0,0,0x7e,0,0xf7], port: 0 }); run(0.5)
  if (processor.emu.smu_eq_type() !== 2) throw new Error('EQ LOCK did not survive XG reset')
  await processor.command({ type: 'eq', preset: 2, locked: false })
  await processor.command({ type: 'midi', bytes: eqPresetMessage(4), port: 0 }); run(0.3)
  if (processor.emu.smu_eq_type() !== 4) throw new Error('Unlocked EQ did not accept CONCERT')
  await processor.command({ type: 'eq', preset: 2, locked: true })
  for (let port = 0; port < 4; port++) {
    await processor.command({ type: 'load', events: [
      { frame: 0, port, bytes: [0xb4,91,0] }, { frame: 0, port, bytes: [0xb4,93,0] },
      { frame: 0, port, bytes: [0xc4,16] }, { frame: 3000, port, bytes: [0x94,60,110] },
    ], length: 10 })
    await processor.command({ type: 'play' })
    const audible = run(0.6)
    await processor.command({ type: 'mute', channel: 4, muted: true })
    const muted = run(0.5)
    if (!(audible > 0.0001 && muted < audible * 0.04)) throw new Error(`Mute failed mode=${exact} port=${port} ${audible} -> ${muted}`)
    await processor.command({ type: 'mute', channel: 4, muted: false })
    const unmuted = run(0.3)
    if (!(unmuted > muted * 4)) throw new Error('Unmute failed')
    console.log(JSON.stringify({ exact, port, audibleRms: audible, mutedRms: muted, unmutedRms: unmuted }))
  }
  await processor.command({ type: 'dispose' })
}
console.log('CONTROLS OK: native POP, EQ lock/reset/unlock, mute/unmute held voices on all four ports, both modes')
