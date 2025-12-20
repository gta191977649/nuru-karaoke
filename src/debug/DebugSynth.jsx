import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib'
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'
import defaultSoundFontUrl from '../soundfont/gm2.sf2'
import './DebugSynth.css'

const DEFAULT_SOUNDFONT_DISPLAY_NAME = 'soundfont/gm2.sf2'

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const whole = Math.floor(seconds)
  const mins = Math.floor(whole / 60)
  const secs = whole % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function extractChannelPatchesFromMIDI(midi) {
  if (!midi?.tracks?.length) return Array.from({ length: 16 }, () => null)

  const bankMSB = Array.from({ length: 16 }, () => 0)
  const bankLSB = Array.from({ length: 16 }, () => 0)
  const patches = Array.from({ length: 16 }, () => null)

  /** @type {{ticks:number,status:number,data:Uint8Array}[]} */
  const events = []
  for (const track of midi.tracks) {
    if (!track?.events?.length) continue
    for (const e of track.events) {
      if (!e) continue
      const status = Number(e.statusByte)
      if (!Number.isFinite(status) || status < 0x80) continue
      events.push({ ticks: Number(e.ticks) || 0, status, data: e.data })
    }
  }

  events.sort((a, b) => a.ticks - b.ticks)

  for (const event of events) {
    const type = event.status & 0xf0
    const channel = event.status & 0x0f
    if (channel < 0 || channel > 15) continue

    if (type === 0xb0) {
      const controllerNumber = event.data?.[0]
      const value = event.data?.[1]
      if (controllerNumber === 0) bankMSB[channel] = value ?? 0
      if (controllerNumber === 32) bankLSB[channel] = value ?? 0
      continue
    }

    if (type === 0xc0) {
      if (patches[channel]) continue
      const program = event.data?.[0] ?? 0
      patches[channel] = {
        program,
        bankMSB: bankMSB[channel],
        bankLSB: bankLSB[channel],
        isGMGSDrum: channel === 9,
      }
    }
  }

  return patches
}

function resolvePatchName(presetList, patch, channelIndex) {
  if (!patch) return channelIndex === 9 ? 'Drums' : '—'
  if (patch.isGMGSDrum || channelIndex === 9) return 'Drums'
  const match = presetList?.find(
    (p) => p.program === patch.program && p.bankMSB === patch.bankMSB && p.bankLSB === patch.bankLSB,
  )
  return match?.name || `Program ${patch.program + 1}`
}

function parseLrcTimestamp(token) {
  // [mm:ss.xx] or [mm:ss.xxx] or [mm:ss]
  const match = token.match(/^\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]$/)
  if (!match) return null
  const minutes = Number(match[1])
  const seconds = Number(match[2])
  const fraction = match[3] ?? '0'
  const millis =
    fraction.length === 3 ? Number(fraction) : fraction.length === 2 ? Number(fraction) * 10 : Number(fraction) * 100
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(millis)) return null
  return minutes * 60 + seconds + millis / 1000
}

function parseLrc(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n')
  /** @type {{time:number,text:string}[]} */
  const entries = []
  let offsetSeconds = 0

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line) continue

    const offsetMatch = line.match(/^\[offset:([+-]?\d+)\]$/i)
    if (offsetMatch) {
      const ms = Number(offsetMatch[1])
      if (Number.isFinite(ms)) offsetSeconds = ms / 1000
      continue
    }

    // metadata like [ar:...], [ti:...], ignore for now
    if (/^\[[a-z]{2,}:[^\]]*\]$/i.test(line) && !/^\[\d/.test(line)) continue

    const timeTokens = line.match(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g)
    if (!timeTokens?.length) continue

    const lyricText = line.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '').trim()
    for (const t of timeTokens) {
      const time = parseLrcTimestamp(t)
      if (time == null) continue
      entries.push({ time: Math.max(0, time + offsetSeconds), text: lyricText })
    }
  }

  entries.sort((a, b) => a.time - b.time)
  // de-dupe exact same timestamps by keeping the last (common in some LRCs)
  const deduped = []
  for (const entry of entries) {
    const last = deduped[deduped.length - 1]
    if (last && last.time === entry.time) {
      deduped[deduped.length - 1] = entry
    } else {
      deduped.push(entry)
    }
  }
  return deduped
}

function findActiveLyricIndex(entries, timeSeconds) {
  if (!entries?.length) return -1
  if (!Number.isFinite(timeSeconds)) return -1
  let lo = 0
  let hi = entries.length - 1
  if (timeSeconds < entries[0].time) return -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const t = entries[mid].time
    if (t === timeSeconds) return mid
    if (t < timeSeconds) lo = mid + 1
    else hi = mid - 1
  }
  return Math.max(0, lo - 1)
}

function DebugSynth() {
  const contextRef = useRef(null)
  const synthRef = useRef(null)
  const sequencerRef = useRef(null)
  const hasTriedAutoLoadDefaultSoundFontRef = useRef(false)
  const enabledChannelsRef = useRef(Array.from({ length: 16 }, () => true))

  const [soundFontFileName, setSoundFontFileName] = useState('')
  const [midiFileName, setMidiFileName] = useState('')
  const [status, setStatus] = useState('Load a SoundFont and a MIDI file to begin.')
  const [isBusy, setIsBusy] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isSeeking, setIsSeeking] = useState(false)
  const [seekTime, setSeekTime] = useState(0)
  const [reverbGain, setReverbGain] = useState(0.6)
  const [chorusGain, setChorusGain] = useState(0.6)
  const [enabledChannels, setEnabledChannels] = useState(() => Array.from({ length: 16 }, () => true))
  const [channelPatches, setChannelPatches] = useState(() => Array.from({ length: 16 }, () => null))
  const [channelInstrumentNames, setChannelInstrumentNames] = useState(() =>
    Array.from({ length: 16 }, (_, i) => (i === 9 ? 'Drums' : '—')),
  )
  const [lrcFileName, setLrcFileName] = useState('')
  const [lrcEntries, setLrcEntries] = useState([])
  const [activeLyricIndex, setActiveLyricIndex] = useState(-1)
  const [lyricOffsetMs, setLyricOffsetMs] = useState(0)

  const canPlay = useMemo(
    () => Boolean(soundFontFileName) && Boolean(midiFileName) && !isBusy,
    [soundFontFileName, midiFileName, isBusy],
  )

  const ensureAudioGraph = useCallback(async () => {
    if (contextRef.current && synthRef.current) return

    const context = new AudioContext()
    await context.audioWorklet.addModule(processorUrl)

    const synth = new WorkletSynthesizer(context, {
      initializeChorusProcessor: true,
      initializeReverbProcessor: true,
    })
    synth.connect(context.destination)

    contextRef.current = context
    synthRef.current = synth

    try {
      setReverbGain(Number(synth.getMasterParameter('reverbGain')) || 0)
      setChorusGain(Number(synth.getMasterParameter('chorusGain')) || 0)
    } catch {
      // ignore
    }

    enabledChannelsRef.current.forEach((isEnabled, index) => {
      synth.muteChannel(index, !isEnabled)
    })
  }, [])

  const ensureSequencer = useCallback(async () => {
    await ensureAudioGraph()
    if (sequencerRef.current) return

    const seq = new Sequencer(synthRef.current)
    seq.loopCount = -1
    sequencerRef.current = seq
  }, [ensureAudioGraph])

  const stop = useCallback(() => {
    const seq = sequencerRef.current
    const synth = synthRef.current

    if (seq) {
      seq.pause()
      seq.currentTime = 0
    }
    if (synth) {
      synth.stopAll(true)
      synth.resetControllers()
    }
    setIsPlaying(false)
    setIsSeeking(false)
    setSeekTime(0)
    setCurrentTime(0)
  }, [])

  const setEffectGain = useCallback((effect, value) => {
    const synth = synthRef.current
    if (!synth) return
    if (effect === 'reverb') synth.setMasterParameter('reverbGain', value)
    if (effect === 'chorus') synth.setMasterParameter('chorusGain', value)
  }, [])

  const setChannelEnabled = useCallback((channelIndex, isEnabled) => {
    enabledChannelsRef.current[channelIndex] = isEnabled
    const synth = synthRef.current
    if (!synth) return
    synth.muteChannel(channelIndex, !isEnabled)
  }, [])

  const resetSynth = useCallback(async () => {
    setIsBusy(true)
    try {
      await ensureAudioGraph()
      const synth = synthRef.current

      if (synth) {
        // GM System On (SysEx): F0 7E 7F 09 01 F7
        // API expects message excluding F0, but including the trailing F7.
        synth.systemExclusive([0x7e, 0x7f, 0x09, 0x01, 0xf7])

        // Keep playback running; just reset synth state and re-apply local overrides.
        synth.resetControllers()
        synth.keyModifierManager.clearModifiers()
        setEffectGain('reverb', reverbGain)
        setEffectGain('chorus', chorusGain)
        enabledChannelsRef.current.forEach((isEnabled, index) => {
          synth.muteChannel(index, !isEnabled)
        })
      }
      setStatus('Sent GM reset to synth.')
    } catch (err) {
      setStatus(`Failed to reset synth: ${String(err?.message || err)}`)
    } finally {
      setIsBusy(false)
    }
  }, [chorusGain, ensureAudioGraph, reverbGain, setEffectGain])

  useEffect(() => {
    enabledChannelsRef.current = enabledChannels.slice()
  }, [enabledChannels])

  const applySoundFontBuffer = useCallback(
    async (buffer, displayName) => {
      setIsBusy(true)
      try {
        await ensureAudioGraph()
        const synth = synthRef.current

        try {
          await synth.soundBankManager.deleteSoundBank('main')
        } catch {
          // ignore (may not exist yet)
        }

        await synth.soundBankManager.addSoundBank(buffer, 'main')
        setSoundFontFileName(displayName)
        setStatus(`SoundFont loaded: ${displayName}`)
      } catch (err) {
        stop()
        setSoundFontFileName('')
        setStatus(`Failed to load SoundFont: ${String(err?.message || err)}`)
      } finally {
        setIsBusy(false)
      }
    },
    [ensureAudioGraph, stop],
  )

  const loadSoundFont = useCallback(
    async (file) => {
      try {
        const buffer = await file.arrayBuffer()
        await applySoundFontBuffer(buffer, file.name)
      } catch {
        // applySoundFontBuffer handles status
      }
    },
    [applySoundFontBuffer],
  )

  const loadMidi = useCallback(
    async (file) => {
      setIsBusy(true)
      try {
        await ensureSequencer()
        const synth = synthRef.current
        const seq = sequencerRef.current

        const buffer = await file.arrayBuffer()

        stop()
        seq.loadNewSongList([{ binary: buffer, fileName: file.name }])
        setDuration(seq.duration || 0)
        setCurrentTime(0)

        setMidiFileName(file.name)
        setStatus(`MIDI loaded: ${file.name}`)

        try {
          const midi = await seq.getMIDI()
          const patches = extractChannelPatchesFromMIDI(midi)
          setChannelPatches(patches)
          setChannelInstrumentNames(
            patches.map((patch, idx) => resolvePatchName(synth?.presetList, patch, idx)),
          )
        } catch {
          // ignore
        }
      } catch (err) {
        stop()
        setMidiFileName('')
        setStatus(`Failed to load MIDI: ${String(err?.message || err)}`)
      } finally {
        setIsBusy(false)
      }
    },
    [ensureSequencer, stop],
  )

  const loadLrc = useCallback(async (file) => {
    setIsBusy(true)
    try {
      const text = await file.text()
      const parsed = parseLrc(text)
      setLrcEntries(parsed)
      setLrcFileName(file.name)
      setActiveLyricIndex(-1)
      setStatus(parsed.length ? `LRC loaded: ${file.name}` : `LRC loaded (no timestamps found): ${file.name}`)
    } catch (err) {
      setLrcEntries([])
      setLrcFileName('')
      setActiveLyricIndex(-1)
      setStatus(`Failed to load LRC: ${String(err?.message || err)}`)
    } finally {
      setIsBusy(false)
    }
  }, [])

  const play = useCallback(async () => {
    if (!soundFontFileName) {
      setStatus('Load a SoundFont first.')
      return
    }
    if (!midiFileName) {
      setStatus('Load a MIDI file first.')
      return
    }

    setIsBusy(true)
    try {
      await ensureSequencer()
      await contextRef.current.resume()
      sequencerRef.current.play()
      setIsPlaying(true)
      setStatus('Playing...')
    } catch (err) {
      stop()
      setStatus(`Failed to play: ${String(err?.message || err)}`)
    } finally {
      setIsBusy(false)
    }
  }, [ensureSequencer, midiFileName, soundFontFileName, stop])

  useEffect(() => {
    if (hasTriedAutoLoadDefaultSoundFontRef.current) return
    hasTriedAutoLoadDefaultSoundFontRef.current = true

    ;(async () => {
      setStatus('Loading default SoundFont...')
      try {
        const response = await fetch(defaultSoundFontUrl)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const buffer = await response.arrayBuffer()
        await applySoundFontBuffer(buffer, DEFAULT_SOUNDFONT_DISPLAY_NAME)
      } catch (err) {
        setStatus(
          `Default SoundFont not loaded (${String(err?.message || err)}). Select one manually.`,
        )
      }
    })()
  }, [applySoundFontBuffer])

  useEffect(() => {
    const synth = synthRef.current
    if (!synth) return
    setChannelInstrumentNames(channelPatches.map((patch, idx) => resolvePatchName(synth.presetList, patch, idx)))
  }, [channelPatches, soundFontFileName])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const seq = sequencerRef.current
      if (seq) {
        const nextDuration = seq.duration || 0
        setDuration((prev) => (prev !== nextDuration ? nextDuration : prev))

        if (!isSeeking) {
          const t = seq.currentHighResolutionTime ?? seq.currentTime ?? 0
          setCurrentTime(t)
        }
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [isSeeking])

  useEffect(() => {
    const t = isSeeking ? seekTime : currentTime
    const offsetSeconds = lyricOffsetMs / 1000
    setActiveLyricIndex(findActiveLyricIndex(lrcEntries, t - offsetSeconds))
  }, [currentTime, isSeeking, lrcEntries, lyricOffsetMs, seekTime])

  useEffect(() => {
    return () => {
      stop()
      const context = contextRef.current
      contextRef.current = null
      synthRef.current = null
      sequencerRef.current = null
      if (context) context.close()
    }
  }, [stop])

  return (
    <div className="debugSynth">
      <h1>SpessaSynth Debug</h1>
      <p className="debugSynth__status">{status}</p>

      <div className="debugSynth__panel">
        <label className="debugSynth__field">
          <span>SoundFont (.sf2/.sf3/.dls)</span>
          <input
            type="file"
            accept=".sf2,.sf3,.dls"
            disabled={isBusy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              loadSoundFont(file)
            }}
          />
        </label>

        <label className="debugSynth__field">
          <span>MIDI (.mid/.midi)</span>
          <input
            type="file"
            accept=".mid,.midi"
            disabled={isBusy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              loadMidi(file)
            }}
          />
        </label>

        <label className="debugSynth__field">
          <span>LRC lyrics (.lrc)</span>
          <input
            type="file"
            accept=".lrc,text/plain"
            disabled={isBusy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              loadLrc(file)
            }}
          />
          {lrcFileName ? <span className="debugSynth__fileHint">Loaded: {lrcFileName}</span> : null}
        </label>

        {lrcEntries.length ? (
          <div className="debugSynth__lyrics" aria-label="Lyrics">
            <div className="debugSynth__lyricsControls">
              <label className="debugSynth__lyricsOffset">
                <span>Lyric offset (ms)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  step={10}
                  value={lyricOffsetMs}
                  disabled={isBusy}
                  onChange={(e) => setLyricOffsetMs(Number(e.currentTarget.value) || 0)}
                />
              </label>
              <input
                className="debugSynth__lyricsOffsetSlider"
                type="range"
                min={-3000}
                max={3000}
                step={10}
                value={lyricOffsetMs}
                disabled={isBusy}
                onChange={(e) => setLyricOffsetMs(Number(e.currentTarget.value) || 0)}
                aria-label="Lyric offset slider"
              />
            </div>
            <div className="debugSynth__lyricsViewport">
              {(() => {
                const i = activeLyricIndex
                const prev2 = i - 2
                const prev1 = i - 1
                const next1 = i + 1
                const next2 = i + 2
                const offsetSeconds = lyricOffsetMs / 1000
                const t = (isSeeking ? seekTime : currentTime) - offsetSeconds
                const lineStart = i >= 0 ? lrcEntries[i].time : 0
                const lineEnd =
                  i >= 0
                    ? (lrcEntries[i + 1]?.time ?? Math.max(lineStart + 1, duration || lineStart + 1))
                    : 1
                const denom = Math.max(0.001, lineEnd - lineStart)
                const progress = i >= 0 ? Math.min(1, Math.max(0, (t - lineStart) / denom)) : 0
                return (
                  <>
                    <div className="debugSynth__lyricLine debugSynth__lyricLine--dim">
                      {prev2 >= 0 ? lrcEntries[prev2].text || '…' : ''}
                    </div>
                    <div className="debugSynth__lyricLine debugSynth__lyricLine--dim">
                      {prev1 >= 0 ? lrcEntries[prev1].text || '…' : ''}
                    </div>
                    <div className="debugSynth__lyricLine debugSynth__lyricLine--active">
                      {i >= 0 ? (
                        <span className="debugSynth__karaoke" style={{ '--karaoke-progress': String(progress) }}>
                          <span className="debugSynth__karaokeBase">{lrcEntries[i].text || '…'}</span>
                          <span className="debugSynth__karaokeFill" aria-hidden="true">
                            {lrcEntries[i].text || '…'}
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </div>
                    <div className="debugSynth__lyricLine debugSynth__lyricLine--dim">
                      {next1 < lrcEntries.length ? lrcEntries[next1].text || '…' : ''}
                    </div>
                    <div className="debugSynth__lyricLine debugSynth__lyricLine--dim">
                      {next2 < lrcEntries.length ? lrcEntries[next2].text || '…' : ''}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        ) : null}

        <div className="debugSynth__effects">
          <div className="debugSynth__effectsTitle">Effects</div>

          <label className="debugSynth__effect">
            <span>Reverb</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={reverbGain}
              disabled={isBusy}
              onChange={async (e) => {
                const value = Number(e.currentTarget.value)
                setReverbGain(value)
                await ensureAudioGraph()
                setEffectGain('reverb', value)
              }}
            />
            <span className="debugSynth__effectValue">{reverbGain.toFixed(2)}</span>
          </label>

          <label className="debugSynth__effect">
            <span>Chorus</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={chorusGain}
              disabled={isBusy}
              onChange={async (e) => {
                const value = Number(e.currentTarget.value)
                setChorusGain(value)
                await ensureAudioGraph()
                setEffectGain('chorus', value)
              }}
            />
            <span className="debugSynth__effectValue">{chorusGain.toFixed(2)}</span>
          </label>
        </div>

        <div className="debugSynth__channels">
          <div className="debugSynth__channelsHeader">
            <div className="debugSynth__channelsTitle">Channel mute</div>
            <div className="debugSynth__channelsActions">
              <button
                type="button"
                disabled={isBusy}
                onClick={async () => {
                  await ensureAudioGraph()
                  const next = Array.from({ length: 16 }, () => false)
                  setEnabledChannels(next)
                  next.forEach((v, i) => setChannelEnabled(i, v))
                }}
              >
                Mute all
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={async () => {
                  await ensureAudioGraph()
                  const next = Array.from({ length: 16 }, () => true)
                  setEnabledChannels(next)
                  next.forEach((v, i) => setChannelEnabled(i, v))
                }}
              >
                Unmute all
              </button>
            </div>
          </div>

          <div className="debugSynth__channelsGrid" role="group" aria-label="MIDI channel mute toggles">
            {enabledChannels.map((isEnabled, index) => (
              <label key={index} className="debugSynth__channelToggle">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  disabled={isBusy}
                  onChange={async (e) => {
                    const nextEnabled = e.currentTarget.checked
                    setEnabledChannels((prev) => {
                      const next = prev.slice()
                      next[index] = nextEnabled
                      return next
                    })
                    await ensureAudioGraph()
                    setChannelEnabled(index, nextEnabled)
                  }}
                />
                <span className="debugSynth__channelLabel">
                  <span className="debugSynth__channelNumber">Ch {index + 1}</span>
                  <span className="debugSynth__channelInstrument">{channelInstrumentNames[index]}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="debugSynth__progress">
          <div className="debugSynth__time">
            <span>{formatTime(isSeeking ? seekTime : currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <input
            className="debugSynth__slider"
            type="range"
            min={0}
            max={Math.max(0, duration)}
            step={0.01}
            value={Math.min(isSeeking ? seekTime : currentTime, Math.max(0, duration))}
            disabled={!midiFileName || isBusy || duration <= 0}
            onPointerDown={(e) => {
              setIsSeeking(true)
              setSeekTime(Number(e.currentTarget.value))
            }}
            onPointerUp={(e) => {
              const seq = sequencerRef.current
              const value = Number(e.currentTarget.value)
              if (seq) seq.currentTime = value
              setSeekTime(value)
              setIsSeeking(false)
            }}
            onInput={(e) => {
              const value = Number(e.currentTarget.value)
              setSeekTime(value)
              setCurrentTime(value)
              const seq = sequencerRef.current
              if (seq) seq.currentTime = value
            }}
            onChange={(e) => {
              const value = Number(e.currentTarget.value)
              setSeekTime(value)
            }}
          />
        </div>

        <div className="debugSynth__buttons">
          <button onClick={play} disabled={!canPlay || isPlaying}>
            Play
          </button>
          <button onClick={stop} disabled={!midiFileName && !isPlaying}>
            Stop
          </button>
          <button onClick={resetSynth} disabled={isBusy}>
            Reset
          </button>
        </div>

        <p className="debugSynth__hint">
          Tip: browsers require a user gesture before audio can start. If audio is silent, click Play
          again.
        </p>
      </div>

      <a className="debugSynth__back" href="/">
        Back to app
      </a>
    </div>
  )
}

export default DebugSynth
