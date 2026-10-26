// Real WASM/ROM test of the exact processor shipped to browsers. No ROMs are copied.
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { prepareSmuBoot } from '../src/engine/backends/smuBootWorker.js'
import { createHash } from 'node:crypto'
import { transform } from 'esbuild'
import { BasicMIDI } from 'spessasynth_core'
import { estimateMidiInitialGainDb } from '../src/engine/midiGainEstimator.js'

const directory = process.argv[2] || process.env.SMU2000_ROM_DIR
const midiPaths = process.argv.slice(3)
if (!directory || !midiPaths.length) throw new Error('Usage: node scripts/smu-harness.mjs ROM_DIR song.mid ...')
const messages = []
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { postMessage: message => messages.push(message) } }
}
globalThis.sampleRate = Number(process.env.SAMPLE_RATE || 44100)
globalThis.currentTime = 0
const { SmuProcessor } = await import('../src/engine/backends/smuProcessor.js')
const parserCode = await transform(fs.readFileSync(new URL('../src/engine/backends/smuSmf.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' })
const { parseSmf, resolvePorts } = await import(`data:text/javascript;base64,${Buffer.from(parserCode.code).toString('base64')}`)
const module = await WebAssembly.compile(fs.readFileSync(new URL('../public/smu2000/smu.wasm', import.meta.url)))
const names = ['mu2000_flash.bin', 'xv364a0.ic49', 'xv365a0.ic50', 'xw848a0.ic53', 'xw849a0.ic54', 'sin-table.bin', 'hd44780u_b04.bin']
const roms = names.flatMap((name, kind) => {
  const file = ['', 'dump', 'standin'].map(folder => path.join(directory, folder, name)).find(file => fs.existsSync(file))
  if (!file) { if (kind < 5) throw new Error(`Missing ${name}`); return [] }
  const bytes = fs.readFileSync(file)
  return [{ kind, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }]
})
const outputs = [[new Float32Array(128), new Float32Array(128)]]
function quantum(processor) {
  processor.process([], outputs)
  currentTime += 128 / sampleRate
  const error = messages.find(message => message.type === 'error')
  if (error) throw new Error(error.message)
}
function settle(processor, id, max = 200000) {
  for (let i = 0; i < max; i++) {
    if (messages.some(message => message.type === 'ack' && message.id === id)) return i
    quantum(processor)
  }
  throw new Error(`No acknowledgement for ${id}`)
}
const results = []
for (const exact of [false, true]) {
  const boot = await prepareSmuBoot({ module, roms, exact, session: 'harness' })
  const cachedBoot = await prepareSmuBoot({ module, roms, exact, session: 'harness', snapshot: boot.snapshot })
  if (!cachedBoot.metrics.restored || cachedBoot.metrics.bootFrames !== 0) throw new Error('Boot cache did not skip firmware')
  console.log(JSON.stringify({ exact, coldBootMs: boot.metrics.prepareMs, cachedBootMs: cachedBoot.metrics.prepareMs,
    snapshotBytes: boot.snapshot.byteLength, savedPercent: 100 * (1 - cachedBoot.metrics.prepareMs / boot.metrics.prepareMs) }))
  const processor = new SmuProcessor()
  await processor.command({ type: 'init', id: 1, module, roms, exact, snapshot: boot.snapshot, session: 'harness' })
  settle(processor, 1)
  await processor.command({ type: 'lcd', enabled: true })
  for (const file of midiPaths) {
    messages.length = 0
    const bytes = fs.readFileSync(file)
    const song = parseSmf(bytes)
    const events = resolvePorts(song.events, true, true).map(event => ({ ...event, frame: Math.round(event.time * 44100) }))
    const loadStart = performance.now()
    await processor.command({ type: 'load', id: 2, events, length: song.length }); settle(processor, 2)
    const loadMs = performance.now() - loadStart
    const startLcd = messages.filter(message => message.type === 'lcd').at(-1)
    const initialDots = Buffer.from(startLcd.dots).toString('base64')
    await processor.command({ type: 'play', id: 3 }); settle(processor, 3)
    const firstNote = song.events.find(event => (event.bytes[0] & 0xf0) === 0x90 && event.bytes[2] > 0)?.time || 0
    const seconds = Math.min(song.length + 2, Math.max(Number(process.env.SECONDS || 20), firstNote + 2))
    let power = 0, active = 0, peak = 0, over = 0, worst = 0, elapsed = 0
    const count = Math.ceil(seconds * sampleRate / 128)
    for (let i = 0; i < count; i++) {
      const start = performance.now(); quantum(processor); const ms = performance.now() - start
      elapsed += ms; worst = Math.max(worst, ms); if (ms > 128 / sampleRate * 1000) over++
      let sum = 0
      for (const channel of outputs[0]) for (const value of channel) { sum += value * value; peak = Math.max(peak, Math.abs(value)) }
      if (sum / 256 > 1e-5) { power += sum; active += 256 }
    }
    if (!(peak > 0)) throw new Error(`Silent output: ${file}`)
    const lcd = messages.filter(message => message.type === 'lcd').at(-1)
    if (!lcd?.dots.some(value => value > 0)) throw new Error('LCD is blank')
    const frames = messages.filter(message => message.type === 'lcd')
    const lcdVariants = new Set(frames.map(frame => createHash('sha256').update(frame.dots).digest('hex'))).size
    if (lcdVariants < 2) throw new Error('LCD did not change during playback')
    if (frames.some((frame, index) => frame.session !== 'harness' || (index > 0 && frame.sequence <= frames[index - 1].sequence))) throw new Error('LCD session/sequence invalid')
    const midi = BasicMIDI.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), path.basename(file))
    const estimate = estimateMidiInitialGainDb(midi)
    const inputDb = 10 * Math.log10(power / active)
    const result = { file: path.basename(file), exact, seconds,
      inputDb, referenceDb: inputDb - 20 * Math.log10(estimate.midiRms), peak,
      avgQuantumMs: elapsed / count, maxQuantumMs: worst, overruns: over,
      loadMs, lcdVariants, lcdActiveBytes: lcd.dots.filter(value => value > 0).length }
    results.push(result)
    console.log(JSON.stringify(result))
    await processor.command({ type: 'pause', id: 4 }); const paused = processor.position
    for (let i = 0; i < 20; i++) quantum(processor)
    if (processor.position !== paused) throw new Error('Pause clock advanced')
    const seekStart = performance.now()
    const seekPosition = Math.min(song.length, Number(process.env.SEEK_SECONDS || 1))
    await processor.command({ type: 'seek', id: 5, position: seekPosition, running: false }); const seekQuanta = settle(processor, 5)
    console.log(JSON.stringify({ exact, seekPosition, seekMs: performance.now() - seekStart, seekAudioClockMs: seekQuanta * 128 / sampleRate * 1000 }))
    if (processor.position !== seekPosition) throw new Error('Seek position mismatch')
    await processor.command({ type: 'play', id: 6 }); settle(processor, 6)
    quantum(processor)
    if (!(processor.position > seekPosition)) throw new Error('Resume clock stalled')
    await processor.command({ type: 'stop', id: 8 }); settle(processor, 8)
    const stoppedLcd = messages.filter(message => message.type === 'lcd').at(-1)
    if (Buffer.from(stoppedLcd.dots).toString('base64') !== initialDots) throw new Error('LCD state leaked across songs')
    await processor.command({ type: 'load', id: 9, events: [], length: 1 }); settle(processor, 9)
    await processor.command({ type: 'play', id: 10 }); settle(processor, 10)
    let emptyPeak = 0
    for (let i = 0; i < 16; i++) {
      quantum(processor)
      for (const channel of outputs[0]) for (const value of channel) emptyPeak = Math.max(emptyPeak, Math.abs(value))
    }
    if (emptyPeak > 0) console.log(JSON.stringify({ exact, emptyPeak }))
    if (emptyPeak > 1 / 32768) throw new Error('Previous song audio leaked after reset')
  }
  await processor.command({ type: 'dispose', id: 7 })
}
console.log('HARNESS OK: boot cache, hot song loads, changing LCD, no state/audio leak, pause/seek/resume, both modes')
if (process.env.SMU_REPORT) fs.writeFileSync(process.env.SMU_REPORT, JSON.stringify(results, null, 2))
