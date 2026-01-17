import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Col, Container, Form, Row, Tab, Tabs } from 'react-bootstrap'
import { extractReferenceMelodyFromMidiData, getTargetMidiAtTime } from './audio/midi/referenceMelody.js'
import { sharedPitchEngine, startSharedMic, stopSharedMic } from './audio/pitch/sharedPitchEngine.js'
import { DEFAULT_CONFIG } from './audioEngine.js'
import { centsError } from './audio/pitch/utils/dspUtils.js'
import { synthEngine } from './SynthEngine.js'
import { useKaraokeStore } from '../state/karaokeStore.js'
import MelodyGuideCanvas from '../components/MelodyGuideCanvas.jsx'
import ParticlePreview from '../components/particles/ParticlePreview.jsx'
import SoundCanvasLcd from '../components/SoundCanvasLcd.jsx'
import Spectrogram from '../components/Spectrogram.jsx'
import SpectrumView from '../components/SpectrumView.jsx'
import WaveformPixi from '../components/WaveformPixi.jsx'
import { DEFAULT_PARTICLE_CONFIG, cloneParticleConfig } from '../components/particles/particleSystem.js'
import { useSingingTechnique } from '../karaoke/hooks/useSingingTechnique.js'

const DEMO_MIDI_URL = new URL('../library/demo/sc55.mid', import.meta.url).toString()

const isSysExStatus = (status) => status === 0xf0 || status === 0xf7

const toHex = (value) => Number(value).toString(16).padStart(2, '0').toUpperCase()

const formatSysExMessage = (msg) => [msg.status, ...msg.data].map(toHex).join(' ')

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value))
const RAD_TO_DEG = 180 / Math.PI
const DEG_TO_RAD = Math.PI / 180
const LCD_SEGMENTS = 8
const LCD_SEGMENT_INDEXES = Array.from({ length: LCD_SEGMENTS }, (_, idx) => idx)
const LCD_HOLD_SEC = 0.12
const LCD_DECAY_SEC = 0.65

const formatHexColor = (value) => {
  const num = clampNumber(Number(value) || 0, 0, 0xffffff)
  return `#${num.toString(16).padStart(6, '0')}`
}

const parseHexColor = (value, fallback) => {
  if (typeof value !== 'string') return fallback
  let hex = value.trim()
  if (hex.startsWith('#')) hex = hex.slice(1)
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('')
  if (hex.length !== 6) return fallback
  const parsed = Number.parseInt(hex, 16)
  return Number.isNaN(parsed) ? fallback : parsed
}

const getSysExOperationName = (msg) => {
  const data = Array.isArray(msg?.data) ? msg.data.slice() : []
  if (!data.length) return 'SysEx'
  if (data[data.length - 1] === 0xf7) data.pop()

  if (data.length >= 4 && data[0] === 0x7e && data[1] === 0x7f && data[2] === 0x09) {
    if (data[3] === 0x01) return 'GM System On'
    if (data[3] === 0x02) return 'GM System Off'
    if (data[3] === 0x03) return 'GM2 System On'
  }

  const gsReset =
    data.length >= 9 &&
    data[0] === 0x41 &&
    data[2] === 0x42 &&
    data[3] === 0x12 &&
    data[4] === 0x40 &&
    data[5] === 0x00 &&
    data[6] === 0x7f &&
    data[7] === 0x00
  if (gsReset) return 'GS Reset'

  const xgReset =
    data.length >= 7 &&
    data[0] === 0x43 &&
    data[2] === 0x4c &&
    data[3] === 0x00 &&
    data[4] === 0x00 &&
    data[5] === 0x7e &&
    data[6] === 0x00
  if (xgReset) return 'XG System On'

  if (data[0] === 0x41) return 'Roland SysEx'
  if (data[0] === 0x43) return 'Yamaha SysEx'
  if (data[0] === 0x7e) return 'Universal SysEx'
  if (data[0] === 0x7f) return 'Universal Real-Time SysEx'

  return 'SysEx'
}

const extractSysExMessages = (midiData) => {
  if (!midiData?.tracks?.length) return []
  const messages = []
  midiData.tracks.forEach((track, trackIndex) => {
    const events = track?.events || []
    if (!Array.isArray(events)) return
    events.forEach((event) => {
      const status = Number(event?.statusByte)
      if (!Number.isFinite(status) || !isSysExStatus(status)) return
      const data = event?.data ? Array.from(event.data) : []
      messages.push({
        trackIndex,
        ticks: Number(event?.ticks) || 0,
        status,
        data,
      })
    })
  })
  return messages
}

function Synth({ onNavigateHome }) {
  const state = useKaraokeStore()
  const [midiUrl, setMidiUrl] = useState('')
  const [reference, setReference] = useState(null)
  const [sysExMessages, setSysExMessages] = useState([])
  const [micActive, setMicActive] = useState(false)
  const [windowSize, setWindowSize] = useState(DEFAULT_CONFIG.windowSize)
  const [hopSize, setHopSize] = useState(DEFAULT_CONFIG.hopSize)
  const [rmsGate, setRmsGate] = useState(DEFAULT_CONFIG.rmsGate)
  const [latencyCompMs, setLatencyCompMs] = useState(0)
  const [userPitchOffsetMs, setUserPitchOffsetMs] = useState(300)
  const [enableDoubleExponentialSmoothing, setEnableDoubleExponentialSmoothing] = useState(DEFAULT_CONFIG.enableDoubleExponentialSmoothing)
  const [algoId, setAlgoId] = useState(DEFAULT_CONFIG.pitchAlgoId || 'essentia-yin')
  const [enableDcRemoval, setEnableDcRemoval] = useState(DEFAULT_CONFIG.enableDcRemoval !== false)
  const [enableHpf, setEnableHpf] = useState(DEFAULT_CONFIG.enableHpf !== false)
  const [enableRmsGate, setEnableRmsGate] = useState(DEFAULT_CONFIG.enableRmsGate !== false)
  const [enableF0Validate, setEnableF0Validate] = useState(DEFAULT_CONFIG.enableF0Validate !== false)
  const [enableTemporalSmooth, setEnableTemporalSmooth] = useState(
    DEFAULT_CONFIG.enableTemporalSmooth !== false,
  )
  const [debugPipeline, setDebugPipeline] = useState(Boolean(DEFAULT_CONFIG.debugPipeline))
  const [debugPipelineStride, setDebugPipelineStride] = useState(
    Math.max(1, Number(DEFAULT_CONFIG.debugPipelineStride) || 4),
  )
  const [showMelodyGuide, setShowMelodyGuide] = useState(false)
  const [showFullPitchTrace, setShowFullPitchTrace] = useState(false)
  const [particlePreviewEmit, setParticlePreviewEmit] = useState(true)
  const [particleConfig, setParticleConfig] = useState(() =>
    cloneParticleConfig(DEFAULT_PARTICLE_CONFIG),
  )
  const [pipelineDebug, setPipelineDebug] = useState({ stages: {}, metrics: {}, sampleRate: null })
  const [f0History, setF0History] = useState({ raw: new Float32Array(0), post: new Float32Array(0) })
  const [debugAnalyser, setDebugAnalyser] = useState(null)
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
    micSampleRate: null,
  })

  const lastPitchRef = useRef(null)
  const fullPitchCanvasRef = useRef(null)
  const fullPitchHistoryRef = useRef([])
  const currentTimeRef = useRef(0)
  const transpositionRef = useRef(0)
  const rawF0HistoryRef = useRef([])
  const postF0HistoryRef = useRef([])
  const pitchEngine = sharedPitchEngine
  const detectorOptions = useMemo(() => pitchEngine.listDetectors(), [pitchEngine])
  const pipelineStages = pipelineDebug.stages || {}
  const pipelineMetrics = pipelineDebug.metrics || {}

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
    pitchEngine.configureDetector({
      windowSize,
      hopSize,
      rmsGate,
      enableDoubleExponentialSmoothing,
      enableDcRemoval,
      enableHpf,
      enableRmsGate,
      enableF0Validate,
      enableTemporalSmooth,
      debugPipeline,
      debugPipelineStride,
    })
  }, [
    pitchEngine,
    windowSize,
    hopSize,
    rmsGate,
    enableDoubleExponentialSmoothing,
    enableDcRemoval,
    enableHpf,
    enableRmsGate,
    enableF0Validate,
    enableTemporalSmooth,
    debugPipeline,
    debugPipelineStride,
  ])

  useEffect(() => {
    if (!micActive) {
      setDebugAnalyser(null)
      return
    }

    let cancelled = false
    const attach = () => {
      if (cancelled) return
      const analyser = pitchEngine.ensureDebugAnalyser?.({
        fftSize: 2048,
        smoothingTimeConstant: 0,
        enableHpf,
        hpfCutoffHz: DEFAULT_CONFIG.hpfCutoffHz,
      })
      if (!analyser) {
        console.warn('[Synth] debugAnalyser not ready, retrying...')
        window.setTimeout(attach, 200)
        return
      }
      // Validate analyser before setting
      if (analyser instanceof AnalyserNode && analyser.frequencyBinCount > 0) {
        setDebugAnalyser(analyser)
      } else {
        console.warn('[Synth] debugAnalyser invalid on attach', analyser)
        // Retry if invalid? Or just wait for next attempt
        window.setTimeout(attach, 200)
      }
    }
    attach()
    return () => {
      cancelled = true
    }
  }, [pitchEngine, micActive, enableHpf])

  useEffect(() => {
    if (!debugAnalyser || !micActive) return () => { }
    const buffer = new Uint8Array(debugAnalyser.frequencyBinCount || 1)
    let rafId = 0
    let lastLog = 0
    const tick = () => {
      rafId = window.requestAnimationFrame(tick)
      const now = performance.now()
      if (now - lastLog < 500) return
      lastLog = now
      debugAnalyser.getByteFrequencyData(buffer)
      let max = 0
      let sum = 0
      for (let i = 0; i < buffer.length; i += 1) {
        const v = buffer[i]
        if (v > max) max = v
        sum += v
      }
      const avg = buffer.length ? sum / buffer.length : 0
      console.debug('[debugAnalyser]', {
        bins: buffer.length,
        max: Math.round(max),
        avg: Math.round(avg),
      })
    }
    tick()
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId)
    }
  }, [debugAnalyser, micActive])

  useEffect(() => {
    if (!state.midiName) {
      setSysExMessages([])
      return
    }
    let active = true
    synthEngine
      .getMidiData()
      .then((midiData) => {
        if (!active) return
        setSysExMessages(midiData ? extractSysExMessages(midiData) : [])
      })
      .catch(() => {
        if (active) setSysExMessages([])
      })
    return () => {
      active = false
    }
  }, [state.midiName, state.midiUrl, state.queueIndex])

  useEffect(() => {
    pitchEngine.setDetector(algoId)
  }, [pitchEngine, algoId])

  useEffect(() => {
    const unsubscribe = pitchEngine.onDebug((msg) => {
      const rawValue = Number.isFinite(msg?.metrics?.rawF0Hz) ? msg.metrics.rawF0Hz : 0
      const postValue = Number.isFinite(msg?.metrics?.result?.f0Hz) ? msg.metrics.result.f0Hz : 0
      const rawHistory = rawF0HistoryRef.current.slice()
      rawHistory.push(rawValue)
      if (rawHistory.length > 160) rawHistory.shift()
      rawF0HistoryRef.current = rawHistory
      const postHistory = postF0HistoryRef.current.slice()
      postHistory.push(postValue)
      if (postHistory.length > 160) postHistory.shift()
      postF0HistoryRef.current = postHistory
      const normalize = (arr) =>
        new Float32Array(arr.map((v) => Math.max(-1, Math.min(1, (v / 1000) * 2 - 1))))
      setF0History({
        raw: normalize(rawHistory),
        post: normalize(postHistory),
      })
      setPipelineDebug({
        stages: msg?.stages || {},
        metrics: msg?.metrics || {},
        sampleRate: Number.isFinite(msg?.sampleRate) ? msg.sampleRate : null,
      })
    })
    return () => {
      unsubscribe()
    }
  }, [pitchEngine])

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

      setDebugInfo((prev) => ({
        ...prev,
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
      }))

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
    return () => stopSharedMic()
  }, [pitchEngine])

  useEffect(() => {
    if (!state.ready || !state.midiName) {
      setReference(null)
      return
    }
    let active = true
    synthEngine
      .getMidiData()
      .then((midiData) => {
        if (!active) return
        if (midiData) setReference(extractReferenceMelodyFromMidiData(midiData, { channel: 0 }))
        else setReference(null)
      })
      .catch(() => {
        if (active) setReference(null)
      })
    return () => {
      active = false
    }
  }, [state.ready, state.midiName, state.midiUrl, state.queueIndex])

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
  const formatChannelList = (channels) => {
    if (!Array.isArray(channels)) return '—'
    const list = []
    channels.forEach((active, idx) => {
      if (active) list.push(idx + 1)
    })
    return list.length ? list.join(', ') : '—'
  }
  const lcdLevels = useMemo(() => {
    const times = Array.isArray(state.channelActivityTime) ? state.channelActivityTime : []
    const velocities = Array.isArray(state.channelActivityVelocity) ? state.channelActivityVelocity : []
    const now = Number(state.currentTime) || 0
    return Array.from({ length: 16 }, (_, idx) => {
      const lastTime = Number(times[idx])
      const lastVelocity = clampNumber(Number(velocities[idx]) || 0, 0, 1)
      if (!Number.isFinite(lastTime) || lastTime < 0) return 0
      if (now < lastTime) return 0
      const delta = now - lastTime
      if (delta <= LCD_HOLD_SEC) return lastVelocity
      const decay = (delta - LCD_HOLD_SEC) / LCD_DECAY_SEC
      return clampNumber(lastVelocity * (1 - decay), 0, 1)
    })
  }, [state.channelActivityTime, state.channelActivityVelocity, state.currentTime])

  const { activeTechniques, techniqueHistory } = useSingingTechnique(sharedPitchEngine, currentTimeRef)

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
                      setSysExMessages(extractSysExMessages(midiData))
                    } else {
                      setReference(null)
                      setSysExMessages([])
                    }
                  }}
                  disabled={!midiUrl || !state.ready}
                  type="button"
                >
                  Load URL
                </Button>
              </Col>
              <Col xs="auto">
                <Button
                  variant="outline-secondary"
                  onClick={async () => {
                    await synthEngine.resumeAudio()
                    await synthEngine.loadMidiFromUrl(DEMO_MIDI_URL)
                    const midiData = await synthEngine.getMidiData()
                    if (midiData) {
                      setReference(extractReferenceMelodyFromMidiData(midiData, { channel: 0 }))
                      setSysExMessages(extractSysExMessages(midiData))
                    } else {
                      setReference(null)
                      setSysExMessages([])
                    }
                  }}
                  disabled={!state.ready}
                  type="button"
                >
                  TEST
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
                      setSysExMessages(extractSysExMessages(midiData))
                    } else {
                      setReference(null)
                      setSysExMessages([])
                    }
                  }}
                  disabled={!state.ready}
                />
              </Col>
            </Row>
            <div className="small text-muted mt-2">Loaded: {state.midiName || '—'}</div>
            <div className="small text-muted mt-2">SysEx ({sysExMessages.length})</div>
            {sysExMessages.length ? (
              <div className="small mt-1" style={{ maxHeight: 140, overflowY: 'auto' }}>
                {sysExMessages.map((msg, idx) => (
                  <div key={`${msg.trackIndex}-${msg.ticks}-${idx}`}>
                    T{msg.trackIndex + 1} @ {msg.ticks}: {getSysExOperationName(msg)} ·{' '}
                    {formatSysExMessage(msg)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="small text-muted mt-1">SysEx: none</div>
            )}
          </div>
        </Col>

        <Col xs={12}>
          <div className="p-3 border rounded-3">
            <div className="fw-semibold mb-2">XG -&gt; GS Drum Mapping</div>
            <Row className="g-2 align-items-center">
              <Col xs={12} md={6}>
                <Form.Check
                  type="switch"
                  id="xg-drum-map-enabled"
                  label="Enable mapping"
                  checked={Boolean(state.xgDrumMapEnabled)}
                  onChange={(e) => synthEngine.setXgDrumMapEnabled(e.currentTarget.checked)}
                />
              </Col>
              <Col xs={12} md={6}>
                <Form.Check
                  type="switch"
                  id="xg-drum-map-prefer-gs"
                  label="Prefer GS playback"
                  checked={Boolean(state.xgPreferGsPlayback)}
                  onChange={(e) => synthEngine.setXgPreferGsPlayback(e.currentTarget.checked)}
                />
              </Col>
            </Row>
            <div className="small text-muted mt-2">
              Mode: {state.xgDrumMapState?.globalMode || 'unknown'}
            </div>
            <div className="small text-muted">
              Detected by: {state.xgDrumMapState?.detectedBy || '—'}
            </div>
            <div className="small text-muted">
              XG bank pairs: {state.xgDrumMapState?.xgBankSelectPairs ?? 0}
            </div>
            <div className="small text-muted">
              Drum channels: {formatChannelList(state.xgDrumMapState?.drumChannels)}
            </div>
            <div className="small text-muted">
              Brush channels: {formatChannelList(state.xgDrumMapState?.brushChannels)}
            </div>
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

        <Col xs={12}>
          <div className="p-3 border rounded-3">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div className="fw-semibold">Sound Canvas LCD</div>
              <div className="small text-muted">Channel Activity</div>
            </div>
            <div className="sc-lcd">
              <div className="sc-lcd__meta">
                <div className="sc-lcd__metaLabel">POLY:{state.polyphonyCount ?? 0}</div>
              </div>
              <SoundCanvasLcd
                levels={lcdLevels}
                enabledChannels={state.enabledChannels}
                height={64}
              />
            </div>

          </div>
        </Col>

        <Col xs={12} md={6}>
          <div className="p-3 border rounded-3">
            <div className="fw-semibold mb-2">Effects</div>

            <Form.Label className="small">Reverb ({state.reverbGain.toFixed(2)})</Form.Label>
            <Form.Range
              min={0}
              max={5.0}
              step={0.05}
              value={state.reverbGain}
              disabled={!state.ready}
              onChange={(e) => synthEngine.setReverbGain(Number(e.currentTarget.value))}
            />

            <Form.Label className="small">Chorus ({state.chorusGain.toFixed(2)})</Form.Label>
            <Form.Range
              min={0}
              max={5.0}
              step={0.05}
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
            <Tabs defaultActiveKey="pitch-debug" className="mb-3">
              <Tab eventKey="pitch-debug" title="Pitch Debug">
                <div className="fw-semibold mb-2">Karaoke Pitch Debug</div>
                <Row className="g-2 align-items-center mb-3">
                  <Col xs="auto">
                    <Button
                      type="button"
                      disabled={!state.ready || micActive}
                      onClick={async () => {
                        try {
                          await startSharedMic()
                          const analyser = pitchEngine.ensureDebugAnalyser?.({
                            fftSize: 2048,
                            smoothingTimeConstant: 0,
                            enableHpf,
                            hpfCutoffHz: DEFAULT_CONFIG.hpfCutoffHz,
                          })
                          if (!analyser) {
                            console.warn('[Synth] debugAnalyser not ready after start')
                          }
                          // Extended validation
                          if (analyser && analyser instanceof AnalyserNode && analyser.frequencyBinCount > 0) {
                            setDebugAnalyser(analyser)
                          } else {
                            console.warn('[Synth] Got invalid debugAnalyser from startMic', analyser)
                            setDebugAnalyser(null)
                          }
                          const audioContext = pitchEngine.getAudioContext?.()
                          setDebugInfo((prev) => ({
                            ...prev,
                            micSampleRate: audioContext?.sampleRate ?? null,
                          }))
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
                        stopSharedMic()
                        setDebugInfo((prev) => ({
                          ...prev,
                          micSampleRate: null,
                        }))
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
                      <option value={512}>512</option>
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
                      label="Double Exp Smooth"
                      checked={enableDoubleExponentialSmoothing}
                      onChange={(e) => setEnableDoubleExponentialSmoothing(e.currentTarget.checked)}
                    />
                  </Col>
                </Row>

                <div className="d-flex align-items-center justify-content-between mt-3">
                  <div className="small text-muted">Melody Guide (target vs mic)</div>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => setShowMelodyGuide((prev) => !prev)}
                  >
                    {showMelodyGuide ? 'Hide' : 'Show'}
                  </Button>
                </div>
                {showMelodyGuide ? (
                  <MelodyGuideCanvas
                    className="melodyGuideCanvas"
                    reference={reference}
                    historyRef={fullPitchHistoryRef}
                    lastPitchRef={lastPitchRef}
                    currentTimeRef={currentTimeRef}
                    transpositionRef={transpositionRef}
                    rmsGate={rmsGate}
                    gateUserByTarget
                    userOffsetSec={userPitchOffsetMs / 1000}
                    width={760}
                    height={180}
                    style={{ width: '100%', height: 180, borderRadius: 8 }}
                  />
                ) : null}
                <div className="d-flex align-items-center justify-content-between mt-3">
                  <div className="small text-muted">Full Pitch Trace (target vs mic)</div>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => setShowFullPitchTrace((prev) => !prev)}
                  >
                    {showFullPitchTrace ? 'Hide' : 'Show'}
                  </Button>
                </div>
                {showFullPitchTrace ? (
                  <canvas
                    ref={fullPitchCanvasRef}
                    width={760}
                    height={300}
                    style={{ width: '100%', height: 300, borderRadius: 8, background: '#0f1115' }}
                  />
                ) : null}

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
                  <div>micSampleRate: {formatNumber(debugInfo.micSampleRate, 0)}</div>
                </div>
              </Tab>
              <Tab eventKey="pipeline-debug" title="DSP Pipeline Debug">
                <div className="fw-semibold mb-2">Signal Pipeline</div>
                <Row className="g-3">
                  <Col xs={12} md={5}>
                    <Form.Check
                      type="switch"
                      id="pipeline-debug-enabled"
                      label="Debug Stream"
                      checked={debugPipeline}
                      onChange={(e) => {
                        const next = e.currentTarget.checked
                        setDebugPipeline(next)
                        if (next && micActive) {
                          const analyser = pitchEngine.ensureDebugAnalyser?.({
                            fftSize: 2048,
                            smoothingTimeConstant: 0,
                            enableHpf,
                            hpfCutoffHz: DEFAULT_CONFIG.hpfCutoffHz,
                          })
                          if (!analyser) {
                            console.warn('[Synth] debugAnalyser not ready after toggle')
                          }
                          setDebugAnalyser(analyser || null)
                        }
                      }}
                    />
                    <Form.Label className="small mt-2">Debug Stride: {debugPipelineStride} frame(s)</Form.Label>
                    <Form.Range
                      min={1}
                      max={12}
                      step={1}
                      value={debugPipelineStride}
                      onChange={(e) => setDebugPipelineStride(Number(e.currentTarget.value))}
                    />
                    <div className="mt-3">
                      <Form.Check
                        type="switch"
                        id="pipeline-dc"
                        label="DC Removal"
                        checked={enableDcRemoval}
                        onChange={(e) => setEnableDcRemoval(e.currentTarget.checked)}
                      />
                      <Form.Check
                        type="switch"
                        id="pipeline-hpf"
                        label="HPF"
                        checked={enableHpf}
                        onChange={(e) => setEnableHpf(e.currentTarget.checked)}
                      />
                      <Form.Check
                        type="switch"
                        id="pipeline-rms"
                        label="RMS Gate"
                        checked={enableRmsGate}
                        onChange={(e) => setEnableRmsGate(e.currentTarget.checked)}
                      />
                      <Form.Check
                        type="switch"
                        id="pipeline-validate"
                        label="f0 Validate"
                        checked={enableF0Validate}
                        onChange={(e) => setEnableF0Validate(e.currentTarget.checked)}
                      />
                      <Form.Check
                        type="switch"
                        id="pipeline-smooth"
                        label="Temporal Smooth"
                        checked={enableTemporalSmooth}
                        onChange={(e) => setEnableTemporalSmooth(e.currentTarget.checked)}
                      />
                      <Form.Check
                        type="switch"
                        id="pipeline-double-smooth"
                        label="Double Exp Smooth"
                        checked={enableDoubleExponentialSmoothing}
                        onChange={(e) => setEnableDoubleExponentialSmoothing(e.currentTarget.checked)}
                      />
                    </div>
                  </Col>
                  <Col xs={12} md={7}>
                    <div className="small text-muted mb-2">Mic Input</div>
                    <WaveformPixi data={pipelineStages.input} height={70} />
                    <div className="small text-muted mt-3 mb-2">Post DC Removal filter</div>
                    <SpectrumView data={pipelineStages.dcRemoved} height={70} color="#3498db" />
                    <div className="small text-muted mt-3 mb-2">Post High Pass Filter (80HzCut)</div>
                    <SpectrumView data={pipelineStages.hpf} height={70} color="#9b59b6" />
                    <div className="small text-muted mt-3 mb-2">Post RMS Gate</div>
                    <SpectrumView data={pipelineStages.gated} height={70} color="#e67e22" />
                    <div className="small text-muted mt-3 mb-2">Raw f0 Trace</div>
                    <WaveformPixi data={f0History.raw} height={60} color="#f1c40f" />
                    <div className="small text-muted mt-3 mb-2">Post f0 Vaildate</div>
                    <WaveformPixi data={f0History.post} height={60} color="#8bd17c" />
                    <div className="small text-muted mt-3 mb-2">Spectrogram + F0</div>
                    {/* Determine current technique color for F0 trace */}
                    {(() => {
                      let activeColor = '#ffffff'
                      // Colors: Vibrato (Green), Kobushi (Light Blue), Glissando (Purple)
                      if (activeTechniques.vibrato) activeColor = '#2ecc71'
                      if (activeTechniques.kobushi) activeColor = '#4fc3f7'
                      if (activeTechniques.glissup || activeTechniques.glissdown) activeColor = '#9c27b0'

                      return (
                        debugAnalyser && debugAnalyser.frequencyBinCount > 0 ? (
                          <Spectrogram
                            analyser={debugAnalyser}
                            f0Hz={pipelineMetrics.result?.f0Hz}
                            f0Color={activeColor}
                            height={140}
                            minHz={DEFAULT_CONFIG.f0MinHz}
                            maxHz={DEFAULT_CONFIG.f0MaxHz}
                          />
                        ) : (
                          <div style={{ width: '100%', height: 140, background: '#000' }} />
                        )
                      )
                    })()}

                    <div className="small text-muted mt-3 mb-2">Sing Technique</div>
                    <Row>
                      <Col xs={4}>
                        <div className="small text-muted mb-1">Vibrato</div>
                        <WaveformPixi data={techniqueHistory.vibrato} height={40} color="#2ecc71" />
                      </Col>
                      <Col xs={4}>
                        <div className="small text-muted mb-1">Kobushi</div>
                        <WaveformPixi data={techniqueHistory.kobushi} height={40} color="#4fc3f7" />
                      </Col>
                      <Col xs={4}>
                        <div className="small text-muted mb-1">Glissando</div>
                        <WaveformPixi data={techniqueHistory.glissando} height={40} color="#9c27b0" />
                      </Col>
                    </Row>
                    <div className="d-flex gap-2 mt-3">
                      {['vibrato', 'kobushi', 'glissando'].map(tech => {
                        let active = false
                        if (tech === 'glissando') {
                          active = activeTechniques.glissup || activeTechniques.glissdown
                        } else {
                          active = activeTechniques[tech]
                        }

                        let label = tech.charAt(0).toUpperCase() + tech.slice(1)
                        if (tech === 'glissando') {
                          if (activeTechniques.glissup) label = 'Gliss Up'
                          if (activeTechniques.glissdown) label = 'Gliss Down'
                        }

                        // Define base colors
                        let baseColor = '#666'
                        if (tech === 'vibrato') baseColor = '#2ecc71'
                        if (tech === 'kobushi') baseColor = '#4fc3f7'
                        if (tech === 'glissando') baseColor = '#9c27b0'

                        return (
                          <div
                            key={tech}
                            className="px-3 py-2 rounded fw-bold d-flex align-items-center justify-content-center"
                            style={{
                              background: active ? baseColor : 'transparent',
                              color: active ? '#fff' : baseColor,
                              border: `2px solid ${baseColor}`,
                              boxShadow: active ? `0 0 10px ${baseColor}` : 'none',
                              transition: 'all 0.1s',
                              minWidth: 100,
                              fontSize: 14
                            }}
                          >
                            {label}
                          </div>
                        )
                      })}
                    </div>


                    <div className="small mt-3">
                      <div>rms: {formatNumber(pipelineMetrics.rms, 4)}</div>
                      <div>gateOpen: {pipelineMetrics.gateOpen ? 'yes' : 'no'}</div>
                      <div>rawF0Hz: {formatNumber(pipelineMetrics.rawF0Hz, 2)}</div>
                      <div>rawConfidence: {formatNumber(pipelineMetrics.rawConfidence, 3)}</div>
                      <div>f0Hz: {formatNumber(pipelineMetrics.result?.f0Hz, 2)}</div>
                      <div>confidence: {formatNumber(pipelineMetrics.result?.confidence, 3)}</div>
                      <div>midi: {formatNumber(pipelineMetrics.result?.midi, 2)}</div>
                    </div>
                  </Col>
                </Row>
              </Tab>
              <Tab eventKey="particle-debug" title="Particle Debug">
                <div className="fw-semibold mb-2">Particle Tuning</div>
                <Row className="g-3">
                  <Col xs={12} md={6}>
                    <Form.Label className="small">Emission Rate: {particleConfig.emissionRate}</Form.Label>
                    <Form.Range
                      min={0}
                      max={400}
                      step={1}
                      value={particleConfig.emissionRate}
                      onChange={(e) => {
                        const next = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        setParticleConfig((prev) => ({
                          ...prev,
                          emissionRate: next,
                        }))
                      }}
                    />
                    <Form.Label className="small mt-2">Max Particles: {particleConfig.maxParticles}</Form.Label>
                    <Form.Range
                      min={50}
                      max={1500}
                      step={10}
                      value={particleConfig.maxParticles}
                      onChange={(e) => {
                        const next = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        setParticleConfig((prev) => ({
                          ...prev,
                          maxParticles: next,
                        }))
                      }}
                    />
                    <Form.Label className="small mt-2">
                      Lifetime Min: {particleConfig.lifetime.min.toFixed(2)}s
                    </Form.Label>
                    <Form.Range
                      min={0.05}
                      max={2}
                      step={0.05}
                      value={particleConfig.lifetime.min}
                      onChange={(e) => {
                        const next = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        setParticleConfig((prev) => ({
                          ...prev,
                          lifetime: {
                            ...prev.lifetime,
                            min: Math.min(next, prev.lifetime.max),
                          },
                        }))
                      }}
                    />
                    <Form.Label className="small mt-2">
                      Lifetime Max: {particleConfig.lifetime.max.toFixed(2)}s
                    </Form.Label>
                    <Form.Range
                      min={0.1}
                      max={3}
                      step={0.05}
                      value={particleConfig.lifetime.max}
                      onChange={(e) => {
                        const next = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        setParticleConfig((prev) => ({
                          ...prev,
                          lifetime: {
                            ...prev.lifetime,
                            max: Math.max(next, prev.lifetime.min),
                          },
                        }))
                      }}
                    />
                    <Form.Label className="small mt-2">
                      Speed Min: {particleConfig.speed.min.toFixed(0)}
                    </Form.Label>
                    <Form.Range
                      min={0}
                      max={400}
                      step={5}
                      value={particleConfig.speed.min}
                      onChange={(e) => {
                        const next = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        setParticleConfig((prev) => ({
                          ...prev,
                          speed: { ...prev.speed, min: Math.min(next, prev.speed.max) },
                        }))
                      }}
                    />
                    <Form.Label className="small mt-2">
                      Speed Max: {particleConfig.speed.max.toFixed(0)}
                    </Form.Label>
                    <Form.Range
                      min={0}
                      max={600}
                      step={5}
                      value={particleConfig.speed.max}
                      onChange={(e) => {
                        const next = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        setParticleConfig((prev) => ({
                          ...prev,
                          speed: { ...prev.speed, max: Math.max(next, prev.speed.min) },
                        }))
                      }}
                    />
                    <Form.Label className="small mt-2">
                      Angle Min: {(particleConfig.angle.min * RAD_TO_DEG).toFixed(0)}°
                    </Form.Label>
                    <Form.Range
                      min={-180}
                      max={180}
                      step={1}
                      value={particleConfig.angle.min * RAD_TO_DEG}
                      onChange={(e) => {
                        const nextDeg = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        const next = nextDeg * DEG_TO_RAD
                        setParticleConfig((prev) => ({
                          ...prev,
                          angle: { ...prev.angle, min: Math.min(next, prev.angle.max) },
                        }))
                      }}
                    />
                    <Form.Label className="small mt-2">
                      Angle Max: {(particleConfig.angle.max * RAD_TO_DEG).toFixed(0)}°
                    </Form.Label>
                    <Form.Range
                      min={-180}
                      max={180}
                      step={1}
                      value={particleConfig.angle.max * RAD_TO_DEG}
                      onChange={(e) => {
                        const nextDeg = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        const next = nextDeg * DEG_TO_RAD
                        setParticleConfig((prev) => ({
                          ...prev,
                          angle: { ...prev.angle, max: Math.max(next, prev.angle.min) },
                        }))
                      }}
                    />
                    <Form.Label className="small mt-2">Spawn Radius: {particleConfig.spawnRadius}</Form.Label>
                    <Form.Range
                      min={0}
                      max={24}
                      step={1}
                      value={particleConfig.spawnRadius}
                      onChange={(e) => {
                        const next = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        setParticleConfig((prev) => ({
                          ...prev,
                          spawnRadius: next,
                        }))
                      }}
                    />
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Label className="small">
                      Scale Start: {particleConfig.scale.start.toFixed(2)}
                    </Form.Label>
                    <Form.Range
                      min={0.05}
                      max={2}
                      step={0.05}
                      value={particleConfig.scale.start}
                      onChange={(e) => {
                        const next = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        setParticleConfig((prev) => ({
                          ...prev,
                          scale: { ...prev.scale, start: Math.max(next, prev.scale.end) },
                        }))
                      }}
                    />
                    <Form.Label className="small mt-2">
                      Scale End: {particleConfig.scale.end.toFixed(2)}
                    </Form.Label>
                    <Form.Range
                      min={0.05}
                      max={1.5}
                      step={0.05}
                      value={particleConfig.scale.end}
                      onChange={(e) => {
                        const next = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        setParticleConfig((prev) => ({
                          ...prev,
                          scale: { ...prev.scale, end: Math.min(next, prev.scale.start) },
                        }))
                      }}
                    />
                    <Form.Label className="small mt-2">
                      Alpha Start: {particleConfig.alpha.start.toFixed(2)}
                    </Form.Label>
                    <Form.Range
                      min={0}
                      max={1}
                      step={0.05}
                      value={particleConfig.alpha.start}
                      onChange={(e) => {
                        const next = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        setParticleConfig((prev) => ({
                          ...prev,
                          alpha: { ...prev.alpha, start: Math.max(next, prev.alpha.end) },
                        }))
                      }}
                    />
                    <Form.Label className="small mt-2">
                      Alpha End: {particleConfig.alpha.end.toFixed(2)}
                    </Form.Label>
                    <Form.Range
                      min={0}
                      max={1}
                      step={0.05}
                      value={particleConfig.alpha.end}
                      onChange={(e) => {
                        const next = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        setParticleConfig((prev) => ({
                          ...prev,
                          alpha: { ...prev.alpha, end: Math.min(next, prev.alpha.start) },
                        }))
                      }}
                    />
                    <Form.Label className="small mt-2">
                      Rotation Speed Min: {particleConfig.rotationSpeed.min.toFixed(1)}
                    </Form.Label>
                    <Form.Range
                      min={-12}
                      max={0}
                      step={0.5}
                      value={particleConfig.rotationSpeed.min}
                      onChange={(e) => {
                        const next = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        setParticleConfig((prev) => ({
                          ...prev,
                          rotationSpeed: {
                            ...prev.rotationSpeed,
                            min: Math.min(next, prev.rotationSpeed.max),
                          },
                        }))
                      }}
                    />
                    <Form.Label className="small mt-2">
                      Rotation Speed Max: {particleConfig.rotationSpeed.max.toFixed(1)}
                    </Form.Label>
                    <Form.Range
                      min={0}
                      max={12}
                      step={0.5}
                      value={particleConfig.rotationSpeed.max}
                      onChange={(e) => {
                        const next = Number(e.currentTarget?.value ?? e.target?.value ?? 0)
                        setParticleConfig((prev) => ({
                          ...prev,
                          rotationSpeed: {
                            ...prev.rotationSpeed,
                            max: Math.max(next, prev.rotationSpeed.min),
                          },
                        }))
                      }}
                    />
                    <Row className="g-2 mt-2">
                      <Col xs={6}>
                        <Form.Label className="small">Tint Start</Form.Label>
                        <Form.Control
                          type="color"
                          value={formatHexColor(particleConfig.tint.start)}
                          onChange={(e) => {
                            const value = e.currentTarget?.value ?? e.target?.value ?? ''
                            const next = parseHexColor(value, particleConfig.tint.start)
                            setParticleConfig((prev) => ({
                              ...prev,
                              tint: { ...prev.tint, start: next },
                            }))
                          }}
                        />
                      </Col>
                      <Col xs={6}>
                        <Form.Label className="small">Tint End</Form.Label>
                        <Form.Control
                          type="color"
                          value={formatHexColor(particleConfig.tint.end)}
                          onChange={(e) => {
                            const value = e.currentTarget?.value ?? e.target?.value ?? ''
                            const next = parseHexColor(value, particleConfig.tint.end)
                            setParticleConfig((prev) => ({
                              ...prev,
                              tint: { ...prev.tint, end: next },
                            }))
                          }}
                        />
                      </Col>
                    </Row>
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={() => setParticleConfig(cloneParticleConfig(DEFAULT_PARTICLE_CONFIG))}
                      >
                        Reset Defaults
                      </Button>
                    </div>
                  </Col>
                </Row>
                <div className="d-flex align-items-center justify-content-between mt-3">
                  <div className="small text-muted">Particle Preview (auto emit)</div>
                  <Form.Check
                    type="switch"
                    id="particle-preview-toggle"
                    label="Emit"
                    checked={particlePreviewEmit}
                    onChange={(e) => setParticlePreviewEmit(e.currentTarget?.checked ?? false)}
                  />
                </div>
                <div className="mt-2">
                  <ParticlePreview
                    particleConfig={particleConfig}
                    emit={particlePreviewEmit}
                    width={760}
                    height={160}
                    style={{ width: '100%', height: 160, borderRadius: 8 }}
                  />
                </div>
                <div className="small text-muted mt-3">
                  Hit the correct note to emit particles on the melody guide (mic required).
                </div>
                <div className="mt-2" style={{ backgroundColor: 'grey' }}>
                  <MelodyGuideCanvas
                    className="melodyGuideCanvas"
                    reference={reference}
                    historyRef={fullPitchHistoryRef}
                    lastPitchRef={lastPitchRef}
                    currentTimeRef={currentTimeRef}
                    transpositionRef={transpositionRef}
                    rmsGate={rmsGate}
                    gateUserByTarget
                    userOffsetSec={userPitchOffsetMs / 1000}
                    width={760}
                    height={180}
                    particleConfig={particleConfig}
                    style={{ width: '100%', height: 180, borderRadius: 8 }}
                  />
                </div>
              </Tab>
            </Tabs>
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
    </Container >
  )
}

export default Synth
