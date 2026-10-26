// Shared by the boot worker and AudioWorklet; neither depends on DOM or audio state.
export function installSmuRoms(emu, roms) {
  if (emu.smu_init(1) < 0) throw new Error('S-MU2000 init failed')
  for (const rom of roms) {
    const bytes = new Uint8Array(rom.data)
    const ptr = emu.malloc(bytes.length)
    new Uint8Array(emu.memory.buffer).set(bytes, ptr)
    const result = rom.kind === 6 ? emu.smu_set_lcd_font(ptr, bytes.length)
      : emu.smu_set_rom(rom.kind, ptr, bytes.length)
    emu.free(ptr)
    if (result < 0) throw new Error(`Invalid ROM kind ${rom.kind}`)
  }
  if (emu.smu_reset() < 0) throw new Error('S-MU2000 reset failed')
}

export function captureSmuBoot(emu) {
  const length = emu.smu_boot_capture()
  if (length <= 0) throw new Error('S-MU2000 boot capture failed')
  const data = new Uint8Array(emu.memory.buffer, emu.smu_boot_data(), length).slice().buffer
  emu.smu_boot_release()
  return data
}

export function restoreSmuBoot(emu, data, exact) {
  const ptr = emu.malloc(data.byteLength)
  try {
    new Uint8Array(emu.memory.buffer).set(new Uint8Array(data), ptr)
    if (emu.smu_boot_restore(ptr, data.byteLength, exact ? 1 : 0) < 0) throw new Error('S-MU2000 boot snapshot invalid')
  } finally { emu.free(ptr) }
}

export function readSmuLcd(emu, ptr, session, sequence) {
  emu.smu_lcd_copy(ptr)
  return { type: 'lcd', session, sequence,
    dots: new Uint8Array(emu.memory.buffer, ptr, 384).slice(),
    contrast: emu.smu_lcd_contrast(), on: !!emu.smu_lcd_on() }
}
