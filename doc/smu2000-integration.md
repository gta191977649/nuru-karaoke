# S-MU2000 backend

Settings → playback → シンセサイザー offers 内藏シンセサイザー (default) and
S-MU2000. Playback must be paused before switching; switching a loaded song
restarts it and starts a new scoring session. Fast mode is the default;
精密エミュレーション disables both the native engine and native effects.
XG/GS/SC-88 MIDI is sent to MU2000 unchanged, without the SC-55 converters.
The existing built-in backend retains its mapping and effects controls.

## Resources and deployment

The local ROMs have been copied to `frontend/src/soundfont/rom/` (ignored by Git).
Django uses this directory by default; users do not upload ROMs. Required files:

- `mu2000_flash.bin` (4 MiB)
- `xv364a0.ic49`, `xv365a0.ic50`, `xw848a0.ic53`, `xw849a0.ic54` (8 MiB each)
- `hd44780u_b04.bin` (4 KiB, required for the LCD glyphs)
- `sin-table.bin` (64 KiB, optional)

`SMU2000_ROM_DIR` overrides the directory. Wave files can also be in its `dump/`
subdirectory and the sine table in `standin/`. In the backend-only Docker image,
mount the ROM directory separately and set `SMU2000_ROM_DIR=/roms`.
ROMs are served through public read-only `/api/synth/smu2000/manifest/` and
`/api/synth/smu2000/rom/<allowlisted-name>/` endpoints as requested. The manifest
validates sizes and supplies SHA-256 hashes; the client verifies downloaded bytes.
Deployments must include this backend change, not just the frontend build.

The built-in default does not request the manifest, ROMs, worklet or WASM.
Selecting S-MU2000 triggers loading. ROMs are cached in IndexedDB by manifest
version; storage failure falls back to session memory. WASM is compiled once per
page session. A saved S-MU2000 preference initializes that backend on next launch;
initialization never awaits AudioContext.resume(). Existing playback/engine selection
and the first pointer/key interaction unlock audio; there is no extra audio-start
button or preparation popup. Startup failure falls back to the built-in backend with an error in settings.

## Reproducible build

The source is pinned to `d474b279dd750dbf5ca4377dadbfa4400ea15205` from S-MU2000.
The build exports an archive into ignored `tmp/`, adds the integration C API
(rewind, LCD font, dots, on/off, contrast), and never edits the upstream checkout.
BSD license and upstream notices are retained in `frontend/third_party/smu2000/`
and copied into the browser distribution.

1. Install/activate Emscripten **6.0.9**.
2. Set `SMU2000_SOURCE` to a Git checkout containing the pinned revision
   (defaults to sibling `../S-MU2000`), `EMSDK` to the SDK directory, and
   `EMSDK_PYTHON` to Python. On this Windows workspace the ignored `tmp/emsdk`
   and `.venv/Scripts/python.exe` are used by default.
3. In `frontend`, run `npm run build:smu2000`, then `npm run build`.

`public/smu2000/` is generated and ignored. It must exist before the frontend
production build; Vite copies it to `dist/smu2000/`. ROMs are never imported by
Vite or copied into that output. The WASM build also instantiates the real module
to catch missing imports (including the LCD loader's `__syscall_readlinkat`).
When changing the processor/glue, bump `smuVersion.js` and rebuild assets to avoid
mixing cached worklet code and WASM. Refresh the page to replace the AudioContext.

## Playback, audio and LCD

A background Worker installs ROMs and runs the first firmware boot at CPU speed,
independent of the audio device state. The clean startup snapshot (about 6 MB)
is cached by ROM hash, runtime version, state format and mode. Cache writes do
not block readiness. ROM fetches are limited to three parallel files; session ROMs
are verified once, reusable WASM is compiled once, and disposable buffers transfer
Worker → main → worklet without repeated structured-clone copies.

Each worklet owns a WASM instance. Song load, Stop/replay and seek restore this
clean snapshot instead of booting firmware again, resetting native engine, FX,
MIDI queues, resampler and song clock. The build patches upstream native_fx reset
to clear the master EQ biquad history too, preventing a previous song's short tail.
Pause freezes the emulator and outputs silence, so resume remains immediate.

Events render at sample boundaries at 44.1 kHz and resample to the shared device
rate with reusable FIFO/PCM views. LCD frames carry session IDs and sequence numbers;
the backend keeps the last frame while unsubscribed and replays it immediately
on subscription. Frames from an obsolete backend are discarded.

Dragging Playback position previews locally and commits one seek on pointer/key
release. A later seek supersedes the earlier request. Seeking uses MIDI state chase:
ordered bank/program, SysEx and RPN/NRPN plus coalesced controllers/pitch are restored,
then held/sustained notes restart at the target. It does not render skipped PCM;
effects tails and the phase/attack of held notes restart at that position. This
policy also applies in precise mode; normal playback remains precise emulation.
Very large SysEx messages over 64 KiB and SMPTE MIDI division are rejected.

The active backend connects to the common AutoGainController, then a separate
fade GainNode. SF-only reverb/chorus sliders and SC-55 mapping are disabled for
MU2000; its MIDI effects remain native. Its LCD uses the actual core's
`lcd_render()` output, including Fast mode updates, rendered with the upstream
DDRAM/segment layout. Frames are sent at most 10 Hz while the synth page is visible.
The Canvas has no black frame/border. MIDI channel activity is distinct from this
emulator LCD. The first release does not emulate front-panel button interaction.
The native five-type Master EQ selector below the LCD offers FLAT/JAZZ/POP/ROCK/CONCERT
(POP is upstream POPS type 2). Default POP and EQ LOCK ON are persisted preferences.
EQ LOCK protects master-EQ SysEx writes and reapplies the selection after GM/XG/GS
reset; unlocking permits the song to change EQ. The signal uses MU2000's own EQ,
without an additional Web Audio EQ. Both UI channel controls and guide melody use
one logical-channel mask mapped to all four native part groups, including voices
that are already sounding. Mute and EQ settings survive song loads and seeks.
Key changes apply immediately to subsequent melodic notes; already held notes
keep their original pitch and matching note-offs. Drums are not transposed.

## Validation and calibration

`node scripts/smu-harness.mjs src/soundfont/rom path/to/song.mid ...` runs the
actual processor against real ROMs under Node with AudioWorklet globals stubbed.
It asserts non-silent output, changing LCD frames with monotonic IDs, frozen pause position, seek and resume
in both modes. `SAMPLE_RATE`, `SECONDS`, and `SMU_REPORT` control rate, duration,
and optional JSON metrics output. This does not replace browser/device QA.

Three library MIDIs (`9-1.mid`, `8-1.mid`, `7-1.mid`), first 20 seconds each,
were measured with the pinned WASM at 44.1 kHz. Derived reference levels were:

| Mode | Reference dBFS values | Initial estimate calibration |
| --- | --- | --- |
| Fast | -35.33, -26.48, -30.21 | -28.2 (median + 2 dB conservative bias) |
| Exact | -35.56, -30.26, -33.12 | -31.1 (median + 2 dB conservative bias) |

Active RMS uses a -50 dBFS gate. These are initial estimates; the existing live
controller continues measuring actual output. Song/instrument dependence remains.
The SC-55 reference remains -36 dBFS. At 48 kHz, a separate 60-second `7-1.mid`
run passed all harness checks: Fast average 0.39 ms / max 5.33 ms (3 overruns),
Exact average 1.29 ms / max 3.75 ms (6 overruns), budget 2.67 ms per 128 frames.
Measurements are host-dependent; occasional overruns can still cause glitches.

Unit coverage includes switch locking/rollback/restart, note transposition/drum
handling, mute/note-off matching, and public resource allowlisting/hash/versioning.

## Additional controls verification

The builtin SoundFont engine also clears voices, sustain/sostenuto/hold pedals,
scheduled MIDI and all effect histories before song load/seek/forced stop. Its
generated worklet wraps the pinned SpessaSynth processor and performs cleanup
before the existing Sequencer rebuilds target MIDI state. Effect parameters,
SoundFont, mute settings and key shift are retained. New song loading pauses the
old Sequencer before installing a new MIDI mapping. Cleanup and song loading run
in order on the worklet message port; reservation does not await a synth snapshot.
Audio resume and song/lyric downloads have deadlines, and failed queue loads
return to the idle index so playback can be retried.
`npm run dev` / `npm run build` generate this worklet automatically via the
`predev` / `prebuild` scripts; `npm run build:builtin` generates it explicitly.
`node scripts/builtin-audio-harness.mjs` exercises the actual generated processor
with the SC-55 SoundFont, including queued old notes and effects tails, and checks
zero output after song/seek transitions and nonzero output from the next note.

`node scripts/smu-controls-harness.mjs src/soundfont/rom` checks the real core's
EQ type: default POP, locked MIDI override, reset reapplication and unlocked
CONCERT. It also verifies muting and unmuting a held voice on ports A–D in both
modes by measuring output RMS (muted dry output is zero).

The `smu-harness` supports `SEEK_SECONDS=120` for late-seek timing and reports both
CPU elapsed time and the number of audio quanta needed. Timings exclude song/ROM
network downloads. Run with ten MIDI paths to check consecutive hot loads and
assert that a subsequent empty song contains no previous audio.
