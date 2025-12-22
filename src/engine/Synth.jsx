import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Col, Container, Form, Row } from 'react-bootstrap'
import { extractReferenceMelodyFromMidiData, getTargetMidiAtTime } from './audio/midi/referenceMelody.js'
import { PitchEngine } from './audio/pitch/pitchEngine.js'
import { centsError } from './audio/pitch/utils/dspUtils.js'
import { synthEngine } from './SynthEngine.js'
import { useSynthEngine } from './useSynthEngine.js'
import MelodyGuideCanvas from '../components/MelodyGuideCanvas.jsx'

function Synth({ onNavigateHome }) {
  const state = useSynthEngine()
  const [midiUrl, setMidiUrl] = useState('')
  const [reference, setReference] = useState(null)
  const [micActive, setMicActive] = useState(false)
  const [windowSize, setWindowSize] = useState(2048)
  const [hopSize, setHopSize] = useState(128)
  const [rmsGate, setRmsGate] = useState(0.003)
  const [latencyCompMs, setLatencyCompMs] = useState(0)
  const [userPitchOffsetMs, setUserPitchOffsetMs] = useState(0)
  const [smoothing, setSmoothing] = useState(false)
  const [algoId, setAlgoId] = useState('pitchy')
  const [debugInfo, setDebugInfo] = useState({
    songTimeSec: 0,
    targetMidi: null,
    targetPitchClass: null,
    userMidi: null,
    userPitchClass: null,
    pitchErrorCents: null,
    f0Hz: null,
    confidence: 0,
    rms: 0,
    algoName: 'n/a',
  })

  const lastPitchRef = useRef(null)
  const fullPitchCanvasRef = useRef(null)
  const fullPitchHistoryRef = useRef([])
  const currentTimeRef = useRef(0)
  const transpositionRef = useRef(0)
  const pitchEngine = useMemo(
    () => new PitchEngine({ getAudioContext: () => synthEngine.getAudioContext() }),
    [],
  )
  const detectorOptions = useMemo(() => pitchEngine.listDetectors(), [pitchEngine])

  const getCssVar = (el, name, fallback) => {
    if (!el) return fallback
    const value = getComputedStyle(el).getPropertyValue(name)
    return value ? value.trim() : fallback
  }

  const normalizeMidiToTarget = (userMidi, targetMidi, minMidi, maxMidi) => {
    const u = Number(userMidi)
    if (!Number.isFinite(u)) return null
    const t = Number(targetMidi)
    let next = u
    if (Number.isFinite(t)) {
      const shift = Math.round((t - u) / 12)
      next = u + shift * 12
    } else {
      while (next < minMidi) next += 12
      while (next > maxMidi) next -= 12
    }
    if (!Number.isFinite(next)) return null
    return Math.max(minMidi, Math.min(maxMidi, next))
  }

  const canPlay = useMemo(() => Boolean(state.midiName) && state.ready, [state.midiName, state.ready])

  useEffect(() => {
    const unsubscribe = pitchEngine.onPitch((result) => {
      lastPitchRef.current = result
    })
    return () => {
      unsubscribe()
    }
  }, [pitchEngine])

  useEffect(() => {
    currentTimeRef.current = state.currentTime
  }, [state.currentTime])

  useEffect(() => {
    transpositionRef.current = Number(state.transposition) || 0
  }, [state.transposition])

  useEffect(() => {
    pitchEngine.configureDetector({ windowSize, hopSize, rmsGate, smoothing })
  }, [pitchEngine, windowSize, hopSize, rmsGate, smoothing])

  useEffect(() => {
    pitchEngine.setDetector(algoId)
  }, [pitchEngine, algoId])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const songTimeSec = Math.max(0, currentTimeRef.current + latencyCompMs / 1000)
      const rawTargetMidi = reference ? getTargetMidiAtTime(reference, songTimeSec) : null
      const transposedTargetMidi =
        rawTargetMidi != null ? rawTargetMidi + transpositionRef.current : null
      const last = lastPitchRef.current
      const userMidiRaw = last?.midi ?? null
      const userMidi =
        Number.isFinite(userMidiRaw) && Number.isFinite(last?.rms) && last.rms >= rmsGate
          ? Number(userMidiRaw)
          : null
      const pitchErrorCents =
        transposedTargetMidi != null && userMidi != null ? centsError(userMidi, transposedTargetMidi) : null
      const algoName =
        detectorOptions.find((option) => option.id === (last?.algoId ?? algoId))?.name || 'n/a'

      setDebugInfo({
        songTimeSec,
        targetMidi: transposedTargetMidi,
        targetPitchClass: midiToPitchClass(transposedTargetMidi),
        userMidi,
        userPitchClass: midiToPitchClass(userMidi),
        pitchErrorCents,
        f0Hz: last?.f0Hz ?? null,
        confidence: last?.confidence ?? 0,
        rms: last?.rms ?? 0,
        algoName,
      })

      const fullHistory = fullPitchHistoryRef.current
      fullHistory.push({
        t: songTimeSec,
        userMidi,
        targetMidi: transposedTargetMidi,
        rms: last?.rms ?? null,
      })
      const maxLen = 240
      if (fullHistory.length > maxLen) fullHistory.splice(0, fullHistory.length - maxLen)
    }, 150)

    return () => window.clearInterval(interval)
  }, [reference, latencyCompMs, detectorOptions, algoId])

  useEffect(() => {
    let raf = 0
    const minMidi = 36
    const maxMidi = 96
    const noteLabels = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

    const draw = () => {
      const canvas = fullPitchCanvasRef.current
      if (!canvas) {
        raf = window.requestAnimationFrame(draw)
        return
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        raf = window.requestAnimationFrame(draw)
        return
      }

      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      ctx.fillStyle = '#0f1115'
      ctx.fillRect(0, 0, width, height)

      const range = maxMidi - minMidi
      const rowHeight = height / Math.max(1, range)
      const labelEvery = Math.max(1, Math.ceil(14 / Math.max(1, rowHeight)))
      const missFill = getCssVar(canvas, '--synth-miss-note-fill', '#090909')
      const missStroke = getCssVar(canvas, '--synth-miss-note-stroke', '#ffffff')
      const missShadow = getCssVar(canvas, '--synth-miss-note-shadow', 'rgba(0,0,0,0.45)')

      ctx.lineWidth = 1
      for (let m = minMidi; m <= maxMidi; m += 1) {
        const y = height - (m - minMidi + 1) * rowHeight
        const isC = m % 12 === 0
        ctx.strokeStyle = isC ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255,255,255,0.12)'
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()

        const octave = Math.floor(m / 12) - 1
        const label = `${noteLabels[m % 12]}${octave}`
        if (m % labelEvery === 0) {
          ctx.fillStyle = isC ? 'rgba(20, 20, 20, 0.9)' : 'rgba(90, 140, 255, 0.9)'
          ctx.font = isC ? '12px system-ui' : '11px system-ui'
          ctx.fillText(label, 6, y - 2)
          const labelWidth = ctx.measureText(label).width
          ctx.fillText(label, width - labelWidth - 6, y - 2)
        }
      }

      const history = fullPitchHistoryRef.current
      const maxLen = 240
      const stepX = width / Math.max(1, maxLen - 1)

      const drawPoint = (midi, x, color, useMissStyle = false) => {
        if (midi == null) return
        const m = Number(midi)
        if (!Number.isFinite(m)) return
        const clamped = Math.max(minMidi, Math.min(maxMidi, m))
        const y = height - (clamped - minMidi + 0.5) * rowHeight
        if (useMissStyle) {
          const w = Math.max(6, stepX * 0.6)
          const h = Math.max(4, rowHeight * 0.45)
          const rx = Math.min(6, h / 2)
          ctx.save()
          ctx.fillStyle = missFill
          ctx.strokeStyle = missStroke
          ctx.lineWidth = 1
          ctx.shadowColor = missShadow
          ctx.shadowBlur = 6
          ctx.beginPath()
          ctx.roundRect(x - w / 2, y - h / 2, w, h, rx)
          ctx.fill()
          ctx.shadowBlur = 0
          ctx.stroke()
          ctx.restore()
        } else {
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(x, y, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      history.forEach((entry, idx) => {
        const x = idx * stepX
        drawPoint(entry.targetMidi, x, 'rgba(70, 210, 120, 0.6)', entry.userMidi == null)
        drawPoint(entry.userMidi, x, 'rgba(255, 255, 255, 0.9)')
      })

      const latest = history.length ? history[history.length - 1] : null
      const userMidi = latest?.userMidi
      if (Number.isFinite(Number(userMidi))) {
        const clamped = Math.max(minMidi, Math.min(maxMidi, Number(userMidi)))
        const y = height - (clamped - minMidi + 0.5) * rowHeight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()

        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
        ctx.beginPath()
        ctx.arc(6, y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(width - 6, y, 5, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = window.requestAnimationFrame(draw)
    }

    raf = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    return () => pitchEngine.stopMic()
  }, [pitchEngine])

  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const formatNumber = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : 'n/a')
  const midiToPitchClass = (midi) => {
    const m = Number(midi)
    if (!Number.isFinite(m)) return null
    return ((Math.round(m) % 12) + 12) % 12
  }
  const formatPitchClass = (midi) => {
    const pc = midiToPitchClass(midi)
    if (pc == null) return 'n/a'
    return `${noteNames[pc]} (pc ${pc})`
  }

  return (
    <Container className="py-3 synthDebug" style={{ maxWidth: 860 }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 m-0">SynthEngine</h1>
        <div className="d-flex gap-2">
          <Button variant="secondary" onClick={onNavigateHome} type="button">
            Back
          </Button>
          <Button
            variant="outline-primary"
            onClick={() => synthEngine.resumeAudio()}
            disabled={!state.ready}
            type="button"
          >
            Resume Audio
          </Button>
        </div>
      </div>

      <div className="mb-3">
        <div className="small text-muted">Status</div>
        <div>{state.status}</div>
      </div>

      <Row className="g-3">
        <Col xs={12}>
          <div className="p-3 border rounded-3">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-semibold">SoundFont</div>
                <div className="small text-muted">{state.soundFontName}</div>
              </div>
            </div>
          </div>
        </Col>

        <Col xs={12}>
          <div className="p-3 border rounded-3">
            <div className="fw-semibold mb-2">MIDI</div>
            <Row className="g-2 align-items-center">
              <Col xs={12} md>
                <Form.Control
                  placeholder="MIDI URL (e.g. /songs/demo.mid)"
                  value={midiUrl}
                  onChange={(e) => setMidiUrl(e.target.value)}
                />
              </Col>
              <Col xs="auto">
                <Button
                  onClick={async () => {
                    await synthEngine.resumeAudio()
                    await synthEngine.loadMidiFromUrl(midiUrl)
                    const midiData = await synthEngine.getMidiData()
                    if (midiData) {
                      setReference(extractReferenceMelodyFromMidiData(midiData, { channel: 0 }))
                    } else {
                      setReference(null)
                    }
                  }}
                  disabled={!midiUrl || !state.ready}
                  type="button"
                >
                  Load URL
                </Button>
              </Col>
              <Col xs={12} md="auto">
                <Form.Control
                  type="file"
                  accept=".mid,.midi"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    await synthEngine.resumeAudio()
                    await synthEngine.loadMidiFromFile(file)
                    const midiData = await synthEngine.getMidiData()
                    if (midiData) {
                      setReference(extractReferenceMelodyFromMidiData(midiData, { channel: 0 }))
                    } else {
                      setReference(null)
                    }
                  }}
                  disabled={!state.ready}
                />
              </Col>
            </Row>
            <div className="small text-muted mt-2">Loaded: {state.midiName || '—'}</div>
          </div>
        </Col>

        <Col xs={12}>
          <div className="p-3 border rounded-3">
            <div className="fw-semibold mb-2">Playback</div>
            <div className="d-flex flex-wrap gap-2 mb-2">
              <Button
                onClick={() => {
                  synthEngine.play()
                }}
                disabled={!canPlay || state.isPlaying}
                type="button"
              >
                Play
              </Button>
              <Button
                onClick={() => synthEngine.pause()}
                disabled={!canPlay || !state.isPlaying}
                variant="secondary"
                type="button"
              >
                Pause
              </Button>
              <Button
                onClick={() => {
                  synthEngine.stop()
                }}
                disabled={!canPlay}
                variant="outline-danger"
                type="button"
              >
                Stop
              </Button>
            </div>
            <Form.Range
              min={0}
              max={Math.max(0, state.duration)}
              step={0.01}
              value={Math.min(state.currentTime, Math.max(0, state.duration))}
              disabled={!canPlay || state.duration <= 0}
              onChange={(e) => synthEngine.seek(Number(e.currentTarget.value))}
            />
            <div className="small text-muted">
              {state.currentTime.toFixed(2)} / {state.duration.toFixed(2)} s
            </div>
          </div>
        </Col>

        <Col xs={12} md={6}>
          <div className="p-3 border rounded-3">
            <div className="fw-semibold mb-2">Effects</div>
            <Form.Label className="small">Reverb ({state.reverbGain.toFixed(2)})</Form.Label>
            <Form.Range
              min={0}
              max={2}
              step={0.01}
              value={state.reverbGain}
              disabled={!state.ready}
              onChange={(e) => synthEngine.setReverbGain(Number(e.currentTarget.value))}
            />
            <Form.Label className="small">Chorus ({state.chorusGain.toFixed(2)})</Form.Label>
            <Form.Range
              min={0}
              max={2}
              step={0.01}
              value={state.chorusGain}
              disabled={!state.ready}
              onChange={(e) => synthEngine.setChorusGain(Number(e.currentTarget.value))}
            />

            <div className="d-flex align-items-center justify-content-between mt-3">
              <div>
                <div className="small text-muted">Transposition</div>
                <div className="fw-semibold">
                  {state.transposition > 0 ? `+${state.transposition}` : String(state.transposition)} semitones
                </div>
              </div>
              <div className="d-flex gap-2">
                <Button
                  variant="outline-secondary"
                  type="button"
                  disabled={!state.ready}
                  onClick={() => synthEngine.shiftTransposition(-1)}
                >
                  -1
                </Button>
                <Button
                  variant="outline-secondary"
                  type="button"
                  disabled={!state.ready}
                  onClick={() => synthEngine.setTransposition(0)}
                >
                  0
                </Button>
                <Button
                  variant="outline-secondary"
                  type="button"
                  disabled={!state.ready}
                  onClick={() => synthEngine.shiftTransposition(1)}
                >
                  +1
                </Button>
              </div>
            </div>
          </div>
        </Col>

        <Col xs={12} md={6}>
          <div className="p-3 border rounded-3">
            <div className="fw-semibold mb-2">Lyrics</div>
            <Form.Control
              type="file"
              accept=".lrc,text/plain"
              disabled={!state.ready}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                await synthEngine.loadLrcFromFile(file)
              }}
            />
            <div className="small text-muted mt-2">Loaded: {state.lrcName || '—'}</div>
            <Form.Label className="small mt-2">Offset (ms): {state.lyricOffsetMs}</Form.Label>
            <Form.Range
              min={-3000}
              max={3000}
              step={10}
              value={state.lyricOffsetMs}
              disabled={!state.ready}
              onChange={(e) => synthEngine.setLyricOffsetMs(Number(e.currentTarget.value))}
            />
          </div>
        </Col>

        <Col xs={12}>
          <div className="p-3 border rounded-3">
            <div className="fw-semibold mb-2">Karaoke Pitch Debug</div>
            <Row className="g-2 align-items-center mb-3">
              <Col xs="auto">
                <Button
                  type="button"
                  disabled={!state.ready || micActive}
                  onClick={async () => {
                    try {
                      await pitchEngine.startMic()
                      setMicActive(true)
                    } catch (err) {
                      console.error(err)
                    }
                  }}
                >
                  Start Mic
                </Button>
              </Col>
              <Col xs="auto">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!micActive}
                  onClick={() => {
                    pitchEngine.stopMic()
                    setMicActive(false)
                  }}
                >
                  Stop Mic
                </Button>
              </Col>
              <Col xs={12} md>
                <Form.Select value={algoId} onChange={(e) => setAlgoId(e.currentTarget.value)}>
                  {detectorOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Form.Select>
              </Col>
            </Row>

            <Row className="g-3">
              <Col xs={12} md={6}>
                <Form.Label className="small">Window Size</Form.Label>
                <Form.Select value={windowSize} onChange={(e) => setWindowSize(Number(e.currentTarget.value))}>
                  <option value={2048}>2048</option>
                  <option value={4096}>4096</option>
                </Form.Select>

                <Form.Label className="small mt-2">Hop Size</Form.Label>
                <Form.Select value={hopSize} onChange={(e) => setHopSize(Number(e.currentTarget.value))}>
                  <option value={128}>128</option>
                  <option value={256}>256</option>
                </Form.Select>

                <Form.Label className="small mt-2">RMS Gate ({rmsGate.toFixed(3)})</Form.Label>
                <Form.Range
                  min={0}
                  max={0.05}
                  step={0.001}
                  value={rmsGate}
                  onChange={(e) => setRmsGate(Number(e.currentTarget.value))}
                />
              </Col>

              <Col xs={12} md={6}>
                <Form.Label className="small">Latency Comp (ms): {latencyCompMs}</Form.Label>
                <Form.Range
                  min={-300}
                  max={300}
                  step={1}
                  value={latencyCompMs}
                  onChange={(e) => setLatencyCompMs(Number(e.currentTarget.value))}
                />
                <Form.Label className="small mt-2">User Pitch Offset (ms): {userPitchOffsetMs}</Form.Label>
                <Form.Range
                  min={-300}
                  max={300}
                  step={1}
                  value={userPitchOffsetMs}
                  onChange={(e) => setUserPitchOffsetMs(Number(e.currentTarget.value))}
                />
                <Form.Check
                  type="switch"
                  id="pitch-smoothing"
                  className="mt-2"
                  label="Smoothing"
                  checked={smoothing}
                  onChange={(e) => setSmoothing(e.currentTarget.checked)}
                />
              </Col>
            </Row>

            <div className="small text-muted mt-3">Melody Guide (target vs mic)</div>
            <MelodyGuideCanvas
              className="melodyGuideCanvas"
              reference={reference}
              historyRef={fullPitchHistoryRef}
              currentTimeRef={currentTimeRef}
              transpositionRef={transpositionRef}
              rmsGate={rmsGate}
              gateUserByTarget
              userOffsetSec={userPitchOffsetMs / 1000}
              width={760}
              height={180}
              style={{ width: '100%', height: 180, borderRadius: 8 }}
            />
            <div className="small text-muted mt-3">Full Pitch Trace (target vs mic)</div>
            <canvas
              ref={fullPitchCanvasRef}
              width={760}
              height={300}
              style={{ width: '100%', height: 300, borderRadius: 8, background: '#0f1115' }}
            />

            <div className="small mt-3">
              <div>songTimeSec: {formatNumber(debugInfo.songTimeSec, 2)}</div>
              <div>targetMidi: {formatNumber(debugInfo.targetMidi, 2)}</div>
              <div>targetPitchClass: {formatPitchClass(debugInfo.targetMidi)}</div>
              <div>userMidi: {formatNumber(debugInfo.userMidi, 2)}</div>
              <div>userPitchClass: {formatPitchClass(debugInfo.userMidi)}</div>
              <div>pitchErrorCents: {formatNumber(debugInfo.pitchErrorCents, 1)}</div>
              <div>f0Hz: {formatNumber(debugInfo.f0Hz, 2)}</div>
              <div>confidence: {formatNumber(debugInfo.confidence, 3)}</div>
              <div>rms: {formatNumber(debugInfo.rms, 4)}</div>
              <div>algoName: {debugInfo.algoName || 'n/a'}</div>
            </div>
          </div>
        </Col>

        <Col xs={12}>
          <div className="p-3 border rounded-3">
            <div className="fw-semibold mb-2">Channels</div>
            <Row className="g-2">
              {state.enabledChannels.map((enabled, idx) => (
                <Col key={idx} xs={12} sm={6} md={4} lg={3}>
                  <Form.Check
                    type="switch"
                    id={`ch-${idx + 1}`}
                    checked={enabled}
                    disabled={!state.ready}
                    onChange={(e) => synthEngine.setChannelEnabled(idx, e.currentTarget.checked)}
                    label={`Ch ${idx + 1}: ${state.channelInstrumentNames[idx]}`}
                  />
                </Col>
              ))}
            </Row>
          </div>
        </Col>
      </Row>
    </Container>
  )
}

export default Synth
