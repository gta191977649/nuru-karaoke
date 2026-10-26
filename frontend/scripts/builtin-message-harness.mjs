import fs from 'node:fs'
import { MessageChannel } from 'node:worker_threads'
import { WorkletSynthesizer, Sequencer } from 'spessasynth_lib'

let Registered, processorPort
globalThis.sampleRate = 44100; globalThis.currentTime = 0
globalThis.window = { addEventListener() {}, removeEventListener() {} }
globalThis.AudioWorkletProcessor = class { constructor() { this.port = processorPort } }
globalThis.registerProcessor = (_name, value) => { Registered = value }
await import('../public/builtin-synth/processor.js')
const pairs = []
globalThis.AudioWorkletNode = class {
  constructor(context, _name, options) {
    this.context = context
    const pair = new MessageChannel(); pairs.push(pair)
    this.port = pair.port1; processorPort = pair.port2
    this.processor = new Registered(options)
  }
  connect() {}
  disconnect() {}
}
const bounded = (promise, label) => {
  let timer
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} stalled`)), 3000) })]).finally(() => clearTimeout(timer))
}
try {
  const synth = new WorkletSynthesizer({ currentTime: 0 })
  await bounded(synth.isReady, 'isReady')
  const bytes = fs.readFileSync('src/soundfont/sc55.sf2')
  await bounded(synth.soundBankManager.addSoundBank(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), 'main'), 'soundfont')
  const seq = new Sequencer(synth)
  seq.pause(); synth.stopAll(true)
  await bounded(synth.getSnapshot(), 'getSnapshot')
  console.log('BUILTIN MESSAGES OK: actual main-thread API ↔ generated worklet ready/load/cleanup barrier')
} finally { for (const pair of pairs) { pair.port1.close(); pair.port2.close() } }
