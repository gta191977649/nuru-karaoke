// Every processor owns its instance; reloading never shares upstream global g_mu.
export async function instantiateSmu(module) {
  let exports
  let ticks = 0n
  const instance = await WebAssembly.instantiate(module, {
    env: { emscripten_notify_memory_growth() {}, __syscall_readlinkat: () => -44 },
    wasi_snapshot_preview1: {
      proc_exit(code) { throw new Error(`S-MU2000 exit ${code}`) },
      clock_time_get(_clock, _precision, pointer) {
        new DataView(exports.memory.buffer).setBigUint64(pointer, ticks += 1000000n, true)
        return 0
      },
      fd_write: () => 0, fd_read: () => 0, fd_close: () => 0, fd_seek: () => 0,
      environ_sizes_get(a, b) {
        const view = new DataView(exports.memory.buffer)
        view.setUint32(a, 0, true); view.setUint32(b, 0, true)
        return 0
      },
      environ_get: () => 0,
    },
  })
  exports = instance.exports
  exports._initialize()
  return exports
}

