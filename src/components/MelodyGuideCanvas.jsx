import { useEffect, useRef } from 'react'
import { getTargetMidiAtTime } from '../engine/audio/midi/referenceMelody.js'

function getCssVar(el, name, fallback) {
  if (!el) return fallback
  const value = getComputedStyle(el).getPropertyValue(name)
  return value ? value.trim() : fallback
}

function getNotesBounds(notes, transposition, fallbackMin, fallbackMax) {
  if (!notes?.length) {
    return { minMidi: fallbackMin, maxMidi: fallbackMax }
  }
  let min = Infinity
  let max = -Infinity
  notes.forEach((note) => {
    const midi = Number(note.midi)
    if (!Number.isFinite(midi)) return
    const v = midi + transposition
    if (v < min) min = v
    if (v > max) max = v
  })
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { minMidi: fallbackMin, maxMidi: fallbackMax }
  }
  return { minMidi: min, maxMidi: max }
}

function mapToPitchClassInRange(midi, baseMidi, range) {
  const m = Number(midi)
  if (!Number.isFinite(m)) return null
  const pc = ((Math.round(m) % 12) + 12) % 12
  const center = baseMidi + range * 0.5
  const k = Math.round((center - pc) / 12)
  const candidate = pc + 12 * k
  const min = baseMidi
  const max = baseMidi + range
  return Math.max(min, Math.min(max, candidate))
}

function MelodyGuideCanvas({
  reference,
  historyRef,
  currentTimeRef,
  transpositionRef,
  rmsGate = 0,
  gateUserByTarget = false,
  userOffsetSec = 0,
  width = 900,
  height = 220,
  windowSec = 8,
  minMidi = 36,
  maxMidi = 96,
  smoothAlpha = 0.35,
  className,
  style,
}) {
  const canvasRef = useRef(null)

  useEffect(() => {
    let raf = 0
    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) {
        raf = window.requestAnimationFrame(draw)
        return
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        raf = window.requestAnimationFrame(draw)
        return
      }

      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      const gradient = ctx.createLinearGradient(0, 0, 0, h)
      gradient.addColorStop(0, '#1b2638')
      gradient.addColorStop(1, '#0d131c')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, w, h)

      const playheadX = w * 0.7
      const pixelsPerSec = w / windowSec
      const songTimeSec = currentTimeRef?.current ?? 0
      const transposition = transpositionRef?.current ?? 0
      const notes = reference?.notes || []
      const bounds = getNotesBounds(notes, transposition, minMidi, maxMidi)
      const range = Math.max(12, bounds.maxMidi - bounds.minMidi + 6)
      const baseMidi = Math.floor(bounds.minMidi - 3)

      const midiToY = (midi) => {
        const clamped = Math.max(baseMidi, Math.min(baseMidi + range, midi))
        const norm = (clamped - baseMidi) / range
        return h - norm * h
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 1
      const lines = 10
      for (let i = 1; i < lines; i += 1) {
        const y = (h / lines) * i
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }

      const visibleStart = songTimeSec - playheadX / pixelsPerSec
      const visibleEnd = songTimeSec + (w - playheadX) / pixelsPerSec

      const barH = 10
      const melodyGradient = ctx.createLinearGradient(0, 0, 0, barH)
      melodyGradient.addColorStop(0, 'rgba(58, 58, 58, 0.5)')
      melodyGradient.addColorStop(1, 'rgba(42, 42, 42, 0.5)')
      ctx.fillStyle = melodyGradient
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.lineWidth = 2
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
      ctx.shadowBlur = 6
      notes.forEach((note) => {
        if (note.t1Sec < visibleStart || note.t0Sec > visibleEnd) return
        const midi = note.midi + transposition
        const x0 = playheadX + (note.t0Sec - songTimeSec) * pixelsPerSec
        const x1 = playheadX + (note.t1Sec - songTimeSec) * pixelsPerSec
        const y = midiToY(midi)
        const barW = Math.max(6, x1 - x0)
        ctx.beginPath()
        ctx.roundRect(x0, y - barH / 2, barW, barH, 5)
        ctx.fill()
        ctx.stroke()
      })
      ctx.shadowBlur = 0

      const missFill = getCssVar(canvas, '--melody-miss-fill', '#0b0b0b')
      const missStroke = getCssVar(canvas, '--melody-miss-stroke', '#ffffff')
      const missShadow = getCssVar(canvas, '--melody-miss-shadow', 'rgba(0,0,0,0.45)')

      const history = historyRef?.current || []
      const missWidth = Math.max(8, pixelsPerSec * 0.12)
      const missHeight = 10
      history.forEach((point) => {
        if (point.t < visibleStart || point.t > visibleEnd) return
        const targetMidi = Number(point.targetMidi)
        const userMidi = Number(point.userMidi)
        if (!Number.isFinite(targetMidi) || Number.isFinite(userMidi)) return
        const x = playheadX + (point.t - songTimeSec) * pixelsPerSec
        const y = midiToY(targetMidi)
        ctx.save()
        ctx.fillStyle = missFill
        ctx.strokeStyle = missStroke
        ctx.lineWidth = 1
        ctx.shadowColor = missShadow
        ctx.shadowBlur = 6
        ctx.beginPath()
        ctx.roundRect(x - missWidth / 2, y - missHeight / 2, missWidth, missHeight, 5)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.stroke()
        ctx.restore()
      })

      ctx.fillStyle = 'rgba(120, 200, 255, 0.9)'
      ctx.shadowColor = 'rgba(130, 220, 255, 0.9)'
      ctx.shadowBlur = 6
      history.forEach((point) => {
        if (point.t < visibleStart || point.t > visibleEnd) return
        const midi = Number(point.userMidi)
        const pointRms = Number(point.rms)
        if (!Number.isFinite(midi) || (Number.isFinite(pointRms) && pointRms < rmsGate)) return
        if (gateUserByTarget && reference) {
          const t = Number(point.t)
          const offset = Math.max(0, Number(userOffsetSec) || 0)
          const targetMidi =
            getTargetMidiAtTime(reference, t - offset) ??
            getTargetMidiAtTime(reference, t + offset)
          if (targetMidi == null) return
        }
        const x = playheadX + (point.t - songTimeSec) * pixelsPerSec
        const mapped = mapToPitchClassInRange(midi, baseMidi, range)
        if (!Number.isFinite(mapped)) return
        const y = midiToY(mapped)
        const barH = 10
        const barW = Math.max(6, pixelsPerSec * 0.18)
        ctx.beginPath()
        ctx.roundRect(x - barW / 2, y - barH / 2, barW, barH, 5)
        ctx.fill()
      })
      ctx.shadowBlur = 0

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, h)
      ctx.stroke()

      raf = window.requestAnimationFrame(draw)
    }
    raf = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(raf)
  }, [reference, historyRef, currentTimeRef, transpositionRef, windowSec, minMidi, maxMidi])

  return <canvas ref={canvasRef} width={width} height={height} className={className} style={style} />
}

export default MelodyGuideCanvas
