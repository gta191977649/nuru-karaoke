import { useEffect, useRef } from 'react'
import { Application, Container, Graphics } from 'pixi.js'
import { BloomFilter } from 'pixi-filters'
import { getTargetMidiAtTime } from '../engine/audio/midi/referenceMelody.js'

const COLORS = {
  background: 0x000000,
  grid: 0xffffff,
  melodyFill: 0x000000,
  melodyOutFill: 0x4a4a4a,
  missFill: 0x0b0b0b,
  missStroke: 0xffffff,
  userWrong: 0x83401e,
  userGlowFill: 0xffd14a,
  userGlowStroke: 0xfff2b8,
  userMissStroke: 0xffffff,
  playhead: 0xffffff,
}

const ALPHAS = {
  background: 0.3,
  grid: 0.2,
  melodyFill: 0.5,
  melodyOutFill: 0.5,
  melodyStroke: 1,
  missFill: 0.85,
  missStroke: 0.9,
  userWrong: 0.5,
  userMissStroke: 1,
  userGlowFill: 0.95,
  userGlowStroke: 0.9,
  playheadOuter: 0.15,
  playheadMid: 0.35,
  playheadInner: 0.9,
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

function getMedianMidiInWindow(notes, startSec, endSec, transposition) {
  if (!notes?.length) return null
  const values = []
  for (const note of notes) {
    if (note.t1Sec < startSec || note.t0Sec > endSec) continue
    const midi = Number(note.midi)
    if (!Number.isFinite(midi)) continue
    values.push(midi + transposition)
  }
  if (!values.length) return null
  values.sort((a, b) => a - b)
  const mid = Math.floor(values.length / 2)
  if (values.length % 2) return values[mid]
  return (values[mid - 1] + values[mid]) / 2
}

function mod12(value) {
  const m = value % 12
  return m < 0 ? m + 12 : m
}

function mapUserMidiToTargetOctave(userMidi, targetMidi) {
  const u = Number(userMidi)
  const t = Number(targetMidi)
  if (!Number.isFinite(u) || !Number.isFinite(t)) return null
  const userKey = Math.round(u)
  const targetKey = Math.round(t)
  const userPc = mod12(userKey)
  const targetPc = mod12(targetKey)
  if (userPc === targetPc) return t
  const detune = u - userKey
  const base = t - targetPc
  return base + userPc + detune
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
  const containerRef = useRef(null)
  const pixiRef = useRef({
    app: null,
    bg: null,
    grid: null,
    notes: null,
    miss: null,
    user: null,
    userGlowContainer: null,
    userGlow: null,
    playhead: null,
    lastSize: { w: 0, h: 0 },
    lastGrid: { w: 0, h: 0, lineCount: 12 },
    lastCenterPitch: null,
    lastCenterSnap: null,
  })
  const stateRef = useRef({
    reference,
    historyRef,
    currentTimeRef,
    transpositionRef,
    rmsGate,
    gateUserByTarget,
    userOffsetSec,
    windowSec,
    minMidi,
    maxMidi,
  })

  useEffect(() => {
    stateRef.current = {
      reference,
      historyRef,
      currentTimeRef,
      transpositionRef,
      rmsGate,
      gateUserByTarget,
      userOffsetSec,
      windowSec,
      minMidi,
      maxMidi,
    }
  }, [
    reference,
    historyRef,
    currentTimeRef,
    transpositionRef,
    rmsGate,
    gateUserByTarget,
    userOffsetSec,
    windowSec,
    minMidi,
    maxMidi,
  ])

  useEffect(() => {
    let active = true
    const init = async () => {
      const root = containerRef.current
      if (!root) return
      const app = new Application()
      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        powerPreference: 'high-performance',
        preference: 'webgl',
      })
      if (!active) {
        app.destroy(true)
        return
      }

      root.appendChild(app.canvas)
      app.canvas.style.width = '100%'
      app.canvas.style.height = '100%'
      app.canvas.style.display = 'block'

      const bg = new Graphics()
      const grid = new Graphics()
      const notes = new Graphics()
      const miss = new Graphics()
      const user = new Graphics()
      const userGlowContainer = new Container()
      const userGlow = new Graphics()
      const playhead = new Graphics()

      userGlowContainer.addChild(userGlow)
      userGlowContainer.filters = [
        new BloomFilter({
          strength: 5,
          quality: 4,
          threshold: 0.2,
        }),
      ]
      app.stage.addChild(bg, grid, notes, miss, user, userGlowContainer, playhead)

      pixiRef.current = {
        app,
        bg,
        grid,
        notes,
        miss,
        user,
        userGlowContainer,
        userGlow,
        playhead,
        lastSize: { w: 0, h: 0 },
        lastGrid: { w: 0, h: 0, lineCount: 12 },
        lastCenterPitch: null,
        lastCenterSnap: null,
      }

      app.ticker.add(() => {
        const state = pixiRef.current
        const { app: activeApp } = state
        if (!activeApp) return
        const w = activeApp.screen.width
        const h = activeApp.screen.height
        if (!w || !h) return

        const snap = stateRef.current
        const songTimeSec = snap.currentTimeRef?.current ?? 0
        const transposition = snap.transpositionRef?.current ?? 0
        const notesData = snap.reference?.notes || []
        const bounds = getNotesBounds(notesData, transposition, snap.minMidi, snap.maxMidi)
        const lineCount = 12
        const lineStep = Math.max(1, lineCount - 1)
        const gridPaddingPx = Math.min(20, Math.max(6, h * 0.06))
        const staffTopPx = gridPaddingPx
        const staffBottomPx = h - gridPaddingPx
        const usableGridHeight = Math.max(1, staffBottomPx - staffTopPx)
        const lineY = (index) => staffTopPx + (1 - index / lineStep) * usableGridHeight
        const windowStart = songTimeSec
        const windowEnd = songTimeSec + snap.windowSec
        const medianMidi = getMedianMidiInWindow(notesData, windowStart, windowEnd, transposition)
        let centerPitch = Number.isFinite(medianMidi) ? medianMidi : state.lastCenterPitch
        if (!Number.isFinite(centerPitch)) {
          const fallback = (bounds.minMidi + bounds.maxMidi) / 2
          centerPitch = Number.isFinite(fallback) ? fallback : (snap.minMidi + snap.maxMidi) / 2
        }
        let centerSnap = state.lastCenterSnap
        if (!Number.isFinite(centerSnap)) {
          centerSnap = Math.round(centerPitch / 12) * 12
        }
        if (Number.isFinite(medianMidi)) {
          while (medianMidi > centerSnap + 8) centerSnap += 12
          while (medianMidi < centerSnap - 8) centerSnap -= 12
        }
        state.lastCenterPitch = centerPitch
        state.lastCenterSnap = centerSnap
        const rangeSemis = 18
        const topPitch = centerSnap + rangeSemis
        const bottomPitch = centerSnap - rangeSemis
        const pitchSpan = Math.max(1, topPitch - bottomPitch)
        const needsResize = state.lastSize.w !== w || state.lastSize.h !== h
        if (needsResize) {
          state.lastSize = { w, h }
          state.bg.clear()
          state.bg.setFillStyle({ color: COLORS.background, alpha: ALPHAS.background })
          state.bg.beginPath()
          state.bg.roundRect(0, 0, w, h, 12)
          state.bg.fill()
          if (state.userGlowContainer) {
            state.userGlowContainer.filterArea = activeApp.screen
          }
        }
        const needsGrid = needsResize || state.lastGrid.lineCount !== lineCount
        if (needsGrid) {
          state.lastGrid = { w, h, lineCount }
          state.grid.clear()
          state.grid.setStrokeStyle({ width: 1, color: COLORS.grid, alpha: ALPHAS.grid })
          state.grid.beginPath()
          for (let i = 0; i < lineCount; i += 1) {
            const y = lineY(i)
            const aligned = Math.max(0.5, Math.min(h - 0.5, Math.round(y) + 0.5))
            state.grid.moveTo(0, aligned)
            state.grid.lineTo(w, aligned)
          }
          state.grid.stroke()
        }
        const playheadX = w * 0.7
        const pixelsPerSec = w / snap.windowSec
        const visibleStart = songTimeSec - playheadX / pixelsPerSec
        const visibleEnd = songTimeSec + (w - playheadX) / pixelsPerSec

        const midiToY = (midi) => {
          const m = Number(midi)
          if (!Number.isFinite(m)) return { y: staffBottomPx, inRange: false }
          const t = (topPitch - m) / pitchSpan
          const unclamped = staffTopPx + t * usableGridHeight
          const clamped = Math.max(staffTopPx, Math.min(staffBottomPx, unclamped))
          return { y: clamped, inRange: m <= topPitch && m >= bottomPitch }
        }

        const barH = 10
        const barRadius = 5
        const drawMelodyNotes = (fillColor, fillAlpha, requireInRange) => {
          state.notes.setFillStyle({ color: fillColor, alpha: fillAlpha })
          state.notes.beginPath()
          notesData.forEach((note) => {
            if (note.t1Sec < visibleStart || note.t0Sec > visibleEnd) return
            const midi = note.midi + transposition
            const x0 = playheadX + (note.t0Sec - songTimeSec) * pixelsPerSec
            const x1 = playheadX + (note.t1Sec - songTimeSec) * pixelsPerSec
            const { y, inRange } = midiToY(midi)
            if (requireInRange !== inRange) return
            const barW = Math.max(6, x1 - x0)
            state.notes.roundRect(x0, y - barH / 2, barW, barH, barRadius)
          })
          state.notes.fill()
          state.notes.stroke()
        }
        state.notes.clear()
        state.notes.setStrokeStyle({ width: 2, color: COLORS.grid, alpha: ALPHAS.melodyStroke })
        drawMelodyNotes(COLORS.melodyFill, ALPHAS.melodyFill, true)
        drawMelodyNotes(COLORS.melodyOutFill, ALPHAS.melodyOutFill, false)

        const history = snap.historyRef?.current || []
        const missWidth = Math.max(8, pixelsPerSec * 0.12)
        const missHeight = 10

        state.miss.clear()
        state.miss.setStrokeStyle({ width: 1, color: COLORS.missStroke, alpha: ALPHAS.missStroke })
        state.miss.setFillStyle({ color: COLORS.missFill, alpha: ALPHAS.missFill })
        state.miss.beginPath()
        history.forEach((point) => {
          if (point.t < visibleStart || point.t > visibleEnd) return
          const targetMidi = Number(point.targetMidi)
          const userMidi = Number(point.userMidi)
          if (!Number.isFinite(targetMidi) || Number.isFinite(userMidi)) return
          const x = playheadX + (point.t - songTimeSec) * pixelsPerSec
          const { y } = midiToY(targetMidi)
          state.miss.roundRect(x - missWidth / 2, y - missHeight / 2, missWidth, missHeight, 5)
        })
        state.miss.fill()
        state.miss.stroke()

        state.user.clear()
        if (state.userGlow) state.userGlow.clear()
        const userBarW = Math.max(6, pixelsPerSec * 0.18)
        const userBarH = 10
        const userRadius = 5
        const glowRects = []
        const blueRects = []
        const greyRects = []
        history.forEach((point) => {
          if (point.t < visibleStart || point.t > visibleEnd) return
          if (point.userMidi == null) return
          const midi = Number(point.userMidi)
          const targetMidiPoint =
            point.targetMidi == null ? null : Number(point.targetMidi)
          const pointRms = Number(point.rms)
          if (!Number.isFinite(midi) || (Number.isFinite(pointRms) && pointRms < snap.rmsGate)) return
          if (snap.gateUserByTarget && snap.reference) {
            const t = Number(point.t)
            const offset = Math.max(0, Number(snap.userOffsetSec) || 0)
            const targetMidi =
              getTargetMidiAtTime(snap.reference, t - offset) ??
              getTargetMidiAtTime(snap.reference, t + offset)
            if (targetMidi == null) return
          }
          const hasTarget = Number.isFinite(targetMidiPoint)
          const isCorrectKey =
            hasTarget && mod12(Math.round(midi)) === mod12(Math.round(targetMidiPoint))
          const mappedMidi = hasTarget
            ? mapUserMidiToTargetOctave(midi, targetMidiPoint)
            : midi
          const { y, inRange } = midiToY(mappedMidi)
          const x = playheadX + (point.t - songTimeSec) * pixelsPerSec
          const rect = {
            x: x - userBarW / 2,
            y: y - userBarH / 2,
            w: userBarW,
            h: userBarH,
          }
          if (isCorrectKey && inRange) {
            glowRects.push(rect)
          } else if (!inRange) {
            greyRects.push(rect)
          } else {
            blueRects.push(rect)
          }
        })
        state.user.setFillStyle({ color: COLORS.userWrong, alpha: ALPHAS.userWrong })
        state.user.setStrokeStyle({
          width: 1,
          color: COLORS.userMissStroke,
          alpha: ALPHAS.userMissStroke,
        })
        state.user.beginPath()
        blueRects.forEach((rect) => {
          state.user.roundRect(rect.x, rect.y, rect.w, rect.h, userRadius)
        })
        state.user.fill()
        state.user.stroke()
        state.user.setFillStyle({ color: COLORS.userWrong, alpha: ALPHAS.userWrong })
        state.user.setStrokeStyle({
          width: 1,
          color: COLORS.userMissStroke,
          alpha: ALPHAS.userMissStroke,
        })
        state.user.beginPath()
        greyRects.forEach((rect) => {
          state.user.roundRect(rect.x, rect.y, rect.w, rect.h, userRadius)
        })
        state.user.fill()
        state.user.stroke()
        if (state.userGlow) {
          state.userGlow.setFillStyle({ color: COLORS.userGlowFill, alpha: ALPHAS.userGlowFill })
          state.userGlow.setStrokeStyle({
            width: 1,
            color: COLORS.userGlowStroke,
            alpha: ALPHAS.userGlowStroke,
          })
          state.userGlow.beginPath()
          glowRects.forEach((rect) => {
            state.userGlow.roundRect(rect.x, rect.y, rect.w, rect.h, userRadius)
          })
          state.userGlow.fill()
          state.userGlow.stroke()
        }

        state.playhead.clear()
        const alignedPlayheadX = Math.round(playheadX) + 0.5
        state.playhead.setStrokeStyle({ width: 8, color: COLORS.playhead, alpha: ALPHAS.playheadOuter })
        state.playhead.beginPath()
        state.playhead.moveTo(alignedPlayheadX, 0)
        state.playhead.lineTo(alignedPlayheadX, h)
        state.playhead.stroke()
        state.playhead.setStrokeStyle({ width: 4, color: COLORS.playhead, alpha: ALPHAS.playheadMid })
        state.playhead.beginPath()
        state.playhead.moveTo(alignedPlayheadX, 0)
        state.playhead.lineTo(alignedPlayheadX, h)
        state.playhead.stroke()
        state.playhead.setStrokeStyle({ width: 2, color: COLORS.playhead, alpha: ALPHAS.playheadInner })
        state.playhead.beginPath()
        state.playhead.moveTo(alignedPlayheadX, 0)
        state.playhead.lineTo(alignedPlayheadX, h)
        state.playhead.stroke()
      })
    }

    init()
    return () => {
      active = false
      const app = pixiRef.current.app
      if (app) app.destroy(true)
      if (containerRef.current) containerRef.current.innerHTML = ''
      pixiRef.current = {
        app: null,
        bg: null,
        grid: null,
        notes: null,
        miss: null,
        user: null,
        userGlowContainer: null,
        userGlow: null,
        playhead: null,
        lastSize: { w: 0, h: 0 },
        lastGrid: { w: 0, h: 0, lineCount: 12 },
        lastCenterPitch: null,
        lastCenterSnap: null,
      }
    }
  }, [])

  useEffect(() => {
    const app = pixiRef.current.app
    if (!app) return
    app.renderer.resize(width, height)
  }, [width, height])

  return <div ref={containerRef} className={className} style={style} />
}

export default MelodyGuideCanvas
