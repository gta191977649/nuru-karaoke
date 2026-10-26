// Build the pinned upstream tree without modifying the developer's checkout.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { instantiateSmu } from '../src/engine/backends/smuWasm.js'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const project = path.dirname(frontend)
const revision = 'd474b279dd750dbf5ca4377dadbfa4400ea15205'
const source = process.env.SMU2000_SOURCE || path.resolve(project, '../S-MU2000')
const scratch = path.join(project, 'tmp', `smu2000-${revision}`)
const output = path.join(frontend, 'public', 'smu2000')
fs.mkdirSync(scratch, { recursive: true })
fs.mkdirSync(output, { recursive: true })
const archive = path.join(scratch, 'source.tar')
execFileSync('git', ['-C', source, 'archive', revision, '-o', archive])
execFileSync('tar', ['-xf', archive, '-C', scratch])
// Upstream native_fx::reset omits the master EQ's biquad history. Clear it too,
// otherwise seeking/cutting a song with POP leaves a short piece of old audio.
const nativeFxHeader = path.join(scratch, 'src/dsp/fx_native.h')
const nativeFxText = fs.readFileSync(nativeFxHeader, 'utf8')
if (!nativeFxText.includes('void reset() { for (auto &s : m_slot)')) throw new Error('Unexpected upstream native FX reset layout')
fs.writeFileSync(nativeFxHeader, nativeFxText.replace('void reset() { for (auto &s : m_slot)',
  'void reset() { m_meq.reset(); for (auto &s : m_slot)'))
const glue = path.join(scratch, 'src/wasm/wasm_render.cpp')
fs.appendFileSync(glue, `
static std::vector<u8> karaoke_boot_state;
extern "C" {
EMSCRIPTEN_KEEPALIVE void smu_mute_channels(unsigned mask) {
  if (!g_mu) return;
  u64 m=mask & 65535u; g_mu->set_part_mute(m | (m<<16) | (m<<32) | (m<<48));
}
EMSCRIPTEN_KEEPALIVE void smu_fast_midi(int enabled) { if (g_mu) g_mu->set_fast_midi(enabled != 0); }
EMSCRIPTEN_KEEPALIVE int smu_midi_idle() { return g_mu && g_mu->midi_idle(); }
EMSCRIPTEN_KEEPALIVE int smu_eq_type() { return g_mu ? g_mu->nvram()[0x0cc2e] : -1; }
EMSCRIPTEN_KEEPALIVE int smu_state_version() { return mu2000::state_version(); }
EMSCRIPTEN_KEEPALIVE int smu_boot_capture() {
  if (!g_mu) return -1;
  karaoke_boot_state = g_mu->save_state();
  return int(karaoke_boot_state.size());
}
EMSCRIPTEN_KEEPALIVE const u8 *smu_boot_data() { return karaoke_boot_state.data(); }
EMSCRIPTEN_KEEPALIVE void smu_boot_release() { karaoke_boot_state.clear(); karaoke_boot_state.shrink_to_fit(); }
EMSCRIPTEN_KEEPALIVE int smu_boot_restore(const u8 *data, size_t size, int exact) {
  if (!g_mu) return -1;
  g_mu->set_native_engine(0);
  g_mu->set_native_fx(0);
  g_mu->reset();
  std::string error;
  if (!g_mu->load_state(data, size, error)) return -1;
  g_events.clear(); g_event_frames.clear(); g_next=0; g_port=-1;
  g_rendered=0; g_scheduled_events=0;
  g_mu->set_native_fx(exact ? 0 : 2);
  g_mu->set_native_engine(exact ? 0 : 1);
  return 0;
}
EMSCRIPTEN_KEEPALIVE int smu_set_lcd_font(const unsigned char *data, int size) {
  if (!g_mu || size != 4096) return -1;
  g_mu->set_lcd_font(std::make_shared<std::vector<u8>>(data, data+size));
  return 0;
}
EMSCRIPTEN_KEEPALIVE int smu_rewind() {
  if (!g_mu) return -1;
  g_mu->reset(); g_next=0; g_port=-1; g_rendered=0; g_scheduled_events=0;
  return 0;
}
EMSCRIPTEN_KEEPALIVE int smu_lcd_copy(unsigned char *out) {
  if (!g_mu) return 0;
  const auto *image = g_mu->lcd_render();
  int cols = g_mu->lcd().line_size();
  for (int row=0; row<2; ++row) for(int col=0; col<24; ++col)
    for(int y=0; y<8; ++y) out[(row*24+col)*8+y]=image[16*(row*cols+col)+y];
  return 384;
}
EMSCRIPTEN_KEEPALIVE int smu_lcd_contrast() { return g_mu ? g_mu->lcd_contrast() : 2; }
EMSCRIPTEN_KEEPALIVE int smu_lcd_on() { return g_mu && g_mu->lcd().display_on(); }
}
`)
const python = process.env.EMSDK_PYTHON || path.join(project, '.venv/Scripts/python.exe')
const emsdk = process.env.EMSDK || path.join(project, 'tmp/emsdk')
const compilerDir = path.join(emsdk, 'upstream/emscripten')
const compilerVersion = execFileSync(python, [path.join(compilerDir, 'emcc.py'), '--version'], { encoding: 'utf8' })
if (!compilerVersion.includes('6.0.9')) throw new Error('S-MU2000 requires the pinned Emscripten 6.0.9 SDK')
const sourceList = fs.readFileSync(path.join(scratch, 'web/scripts/emu.ts'), 'utf8')
  .split('export const SOURCES = [')[1].split('];')[0].match(/"[^"]+\.cpp"/g).map(JSON.parse)
const flags = ['-std=c++20', '-O3', '-fno-exceptions', '-DSMU_STANDALONE',
  '-Wno-inconsistent-missing-override', '-Isrc', '-Isrc/compat']
const objects = sourceList.map((sourceFile, index) => {
  const object = path.join(scratch, `${index}.o`)
  console.log(`CC ${sourceFile}`)
  execFileSync(python, [path.join(compilerDir, 'emcc.py'), ...flags, '-c', sourceFile, '-o', object],
    { cwd: scratch, stdio: 'inherit' })
  return object
})
const exports = ['malloc', 'free', 'smu_init', 'smu_shutdown', 'smu_set_rom', 'smu_reset',
  'smu_run_blank', 'smu_midi_in', 'smu_set_native_engine', 'smu_set_native_fx', 'smu_rewind',
  'smu_render_frames', 'smu_lcd_copy', 'smu_lcd_contrast', 'smu_lcd_on', 'smu_set_lcd_font',
  'smu_state_version', 'smu_boot_capture', 'smu_boot_data', 'smu_boot_release', 'smu_boot_restore',
  'smu_mute_channels', 'smu_fast_midi', 'smu_midi_idle', 'smu_eq_type']
execFileSync(python, [path.join(compilerDir, 'em++.py'), ...flags, ...objects,
  '-sSTANDALONE_WASM=1', '--no-entry', '-sFILESYSTEM=0', '-sINITIAL_MEMORY=128MB',
  '-sMAXIMUM_MEMORY=2GB', '-sALLOW_MEMORY_GROWTH=1',
  `-sEXPORTED_FUNCTIONS=${exports.map(name => `_${name}`).join(',')}`,
  '-o', path.join(output, 'smu.wasm')], { cwd: scratch, stdio: 'inherit' })
await build({ entryPoints: [path.join(frontend, 'src/engine/backends/smuProcessor.js')],
  outfile: path.join(output, 'processor.js'), bundle: true, format: 'esm', minify: true })
await build({ entryPoints: [path.join(frontend, 'src/engine/backends/smuBootWorker.js')],
  outfile: path.join(output, 'boot-worker.js'), bundle: true, format: 'esm', minify: true })
// Exercise the real import table; fail the build rather than shipping an ABI mismatch.
await instantiateSmu(await WebAssembly.compile(fs.readFileSync(path.join(output, 'smu.wasm'))))
for (const name of ['LICENSE', 'NOTICE.txt']) fs.copyFileSync(path.join(scratch, name), path.join(output, name))
fs.writeFileSync(path.join(output, 'version.json'), JSON.stringify({ revision, emscripten: '6.0.9' }))
console.log(`S-MU2000 ${revision} built in ${output}`)
