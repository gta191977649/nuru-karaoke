import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const messages = []
let Registered
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: m => messages.push(m), close() {} } } }
globalThis.registerProcessor = (_name, Processor) => { Registered = Processor }
globalThis.sampleRate = 44100
globalThis.currentTime = 0
await import(pathToFileURL(`${process.cwd()}/public/builtin-synth/processor.js`).href)
const worklet = new Registered({ processorOptions: { eventsEnabled: true, oneOutput: false } })
await worklet.core.synthesizer.processorInitialized
const sf = fs.readFileSync('src/soundfont/sc55.sf2')
worklet.core.handleMessage({ type: 'soundBankManager', data: { type: 'addSoundBank', data: {
  soundBankBuffer: sf.buffer.slice(sf.byteOffset, sf.byteOffset + sf.length), id: 'main', bankOffset: 0,
} } })
const synth = worklet.core.synthesizer
const outputs = Array.from({ length: 17 }, () => [new Float32Array(128), new Float32Array(128)])
function render(seconds) {
  let peak = 0
  for (let n = 0; n < Math.ceil(seconds * sampleRate / 128); n++) {
    for (const output of outputs) for (const channel of output) channel.fill(0)
    worklet.process([], outputs)
    currentTime += 128 / sampleRate
    for (const output of outputs) for (const channel of output) for (const value of channel) peak = Math.max(peak, Math.abs(value))
  }
  return peak
}
const midi = bytes => synth.processMessage(bytes)
// Drive all effects, sustain and multiple ports, then leave a delayed old note queued.
for (const offset of [0, 16]) {
  while (synth.midiChannels.length <= offset + 2) synth.createMIDIChannel()
  synth.processMessage([0xb2,64,127], offset)
  synth.processMessage([0xb2,66,127], offset)
  synth.processMessage([0xb2,91,127], offset)
  synth.processMessage([0xb2,93,127], offset)
  synth.processMessage([0x92,60,120], offset)
}
const sounding = render(0.4)
if (!(sounding > 0.001)) throw new Error('Builtin harness could not produce sound')
const fxBefore = synth.reverbProcessor.getSnapshot()
const allFxBefore = synth.getSnapshot()
synth.processMessage([0x90,65,120], 0, { time: synth.currentTime + 0.1 })
worklet.core.handleMessage({ type: 'stopAll', channelNumber: -1, data: 1 })
const afterStop = render(0.3)
if (afterStop !== 0) throw new Error(`Builtin hard-stop audio leak: ${afterStop}`)
if (JSON.stringify(fxBefore) !== JSON.stringify(synth.reverbProcessor.getSnapshot())) throw new Error('Effect configuration changed during tail cleanup')
const allFxAfter = synth.getSnapshot()
for (const key of ['chorusProcessor', 'delayProcessor', 'insertionProcessor']) {
  if (JSON.stringify(allFxBefore[key]) !== JSON.stringify(allFxAfter[key])) throw new Error(`${key} configuration changed during cleanup`)
}
// Exercise actual Sequencer setTime/loadNewSongList handlers with a tiny SMF.
worklet.core.handleMessage({ type: 'requestNewSequencer' })
const midiBuffer = Uint8Array.from([
  0x4d,0x54,0x68,0x64,0,0,0,6,0,0,0,1,0,96,
  0x4d,0x54,0x72,0x6b,0,0,0,4,0,0xff,0x2f,0,
]).buffer
const sequence = (type, data) => worklet.core.handleMessage({ type: 'sequencerSpecific', data: { id: 0, type, data } })
for (const operation of ['loadNewSongList', 'setTime']) {
  midi([0xb0,64,127]); midi([0xb0,91,127]); midi([0x90,60,120]); render(0.3)
  sequence(operation, operation === 'loadNewSongList' ? [{ binary: midiBuffer, fileName: 'empty.mid' }] : 0)
  const peak = render(0.25)
  if (peak !== 0) throw new Error(`Builtin ${operation} audio leak: ${peak}`)
}
midi([0x90,64,110])
if (!(render(0.1) > 0.001)) throw new Error('Builtin remained muted after cleanup')
console.log(JSON.stringify({ sounding, afterStop, scenarios: ['sustain/sostenuto/multi-port', 'queued old note', 'hard stop', 'song change', 'seek', 'next note audible'] }))
console.log('BUILTIN AUDIO OK: no old voices/effect tails after song change or seek')
