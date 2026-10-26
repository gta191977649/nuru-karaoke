import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dependency = path.join(root, 'node_modules/spessasynth_lib')
const version = JSON.parse(fs.readFileSync(path.join(dependency, 'package.json'), 'utf8')).version
if (version !== '4.3.14') throw new Error(`Review builtin transition adapter for spessasynth_lib ${version}`)
const original = fs.readFileSync(path.join(dependency, 'dist/spessasynth_processor.min.js'), 'utf8')
const registration = /registerProcessor\(([^,;]+),([^);]+)\);/g
if ([...original.matchAll(registration)].length !== 1) throw new Error('Unexpected upstream processor registration')
const patched = original.replace(registration, 'registerProcessor($1,withBuiltinTransitions($2));')
  .replace(/\/\/# sourceMappingURL=.*$/gm, '')
const output = path.join(root, 'public/builtin-synth')
fs.mkdirSync(output, { recursive: true })
await build({ stdin: { contents: `import { withBuiltinTransitions } from './builtinTransitions.js';\n${patched}`,
  resolveDir: path.join(root, 'src/engine/backends'), sourcefile: 'builtin-processor.js' },
  outfile: path.join(output, 'processor.js'), bundle: true, format: 'esm', minify: true })
fs.copyFileSync(path.join(dependency, 'LICENSE'), path.join(output, 'LICENSE'))
console.log('Built builtin processor with audio-thread transition cleanup')
