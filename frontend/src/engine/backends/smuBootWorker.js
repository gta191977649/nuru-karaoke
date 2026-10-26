import { instantiateSmu } from './smuWasm.js'
import { installSmuRoms, captureSmuBoot, restoreSmuBoot, readSmuLcd } from './smuCore.js'

// Exported for the real-WASM harness. Boot runs at CPU speed, even with audio suspended.
export async function prepareSmuBoot({ module, roms, exact, snapshot, session }, post = () => {}) {
  const started = performance.now()
  const emu = await instantiateSmu(module)
  let lcdPtr = 0
  let frames = 0
  let restored = false
  try {
    installSmuRoms(emu, roms)
    if (snapshot) {
      try { restoreSmuBoot(emu, snapshot, exact); restored = true }
      catch { snapshot = null; emu.smu_rewind() }
    }
    if (!restored) {
      emu.smu_set_native_fx(exact ? 0 : 2)
      let lastPost = 0
      while (true) {
        const ready = emu.smu_run_blank(4096)
        frames += 4096
        if (ready) break
        if (frames >= 44100 * 30) throw new Error('Firmware boot timeout')
        if (performance.now() - lastPost >= 100) {
          lastPost = performance.now()
          post({ type: 'boot', fraction: frames / (44100 * 30) })
          // Yield to cancellation/messages without waiting for audio callbacks.
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }
      snapshot = captureSmuBoot(emu)
      emu.smu_set_native_engine(exact ? 0 : 1)
    }
    lcdPtr = emu.malloc(384)
    const lcd = readSmuLcd(emu, lcdPtr, session, 0)
    return { snapshot, roms, lcd, stateVersion: emu.smu_state_version(),
      metrics: { bootFrames: frames, restored, prepareMs: performance.now() - started } }
  } finally {
    if (lcdPtr) emu.free(lcdPtr)
    emu.smu_shutdown()
  }
}

if (typeof self !== 'undefined' && typeof self.document === 'undefined') {
  self.onmessage = async ({ data }) => {
    try {
      const result = await prepareSmuBoot(data, message => self.postMessage(message))
      self.postMessage({ type: 'ready', ...result }, [result.snapshot,
        ...result.roms.map(rom => rom.data), result.lcd.dots.buffer])
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message || error) }) }
  }
}
