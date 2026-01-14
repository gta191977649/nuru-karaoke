import { useEffect, useRef, forwardRef } from 'react'
import { Application, Container, Graphics, Sprite, Texture, Assets } from 'pixi.js'
import { BloomFilter } from 'pixi-filters'
import { getTargetMidiAtTime } from '../engine/audio/midi/referenceMelody.js'
import { DEFAULT_PARTICLE_CONFIG, createParticleSystem, createComboSystem } from './particles/particleSystem.js'

const TECHNIQUE_CONFIG = {
  glissup: {
    id: 'glissup',
    label: 'しゃくり',
    color: 0xFF13F0, // Purple
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18 C5 18 10 18 12 14 C14 10 18 6 18 6" /><path d="M15 6 L19 6 L19 10" /></svg>',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '100%', height: '100%' }}>
        <path d="M5 18 C5 18 10 18 12 14 C14 10 18 6 18 6" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M15 6 L19 6 L19 10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  kobushi: {
    id: 'kobushi',
    label: 'こぶし',
    color: 0x00FFF0, // Light Blue
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="3" fill="white" stroke="none" /><path d="M12 2 C 18 2 22 12 12 22 C 2 12 6 2 12 2" /></svg>',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '100%', height: '100%' }}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2 C 18 2 22 12 12 22 C 2 12 6 2 12 2" stroke="currentColor" strokeWidth="2" fill="none" />
      </svg>
    )
  },
  glissdown: {
    id: 'glissdown',
    label: 'フォール',
    color: 0xFFBF00, // Orange
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6 C5 6 10 6 12 10 C14 14 18 18 18 18" /><path d="M15 18 L19 18 L19 14" /></svg>',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '100%', height: '100%' }}>
        <path d="M5 6 C5 6 10 6 12 10 C14 14 18 18 18 18" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M15 18 L19 18 L19 14" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  vibrato: {
    id: 'vibrato',
    label: 'ビブラート',
    color: 0x2CFF05, // Green
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><path d="M2 12 Q 5 6 8 12 T 14 12 T 20 12" /></svg>',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '100%', height: '100%' }}>
        <path d="M2 12 Q 5 6 8 12 T 14 12 T 20 12" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    )
  }
}

const COLORS = {
  background: 0x000000,
  grid: 0xffffff,
  melodyFill: 0x000000,
  melodyOutFill: 0x4a4a4a,
  missFill: 0x0b0b0b,
  missStroke: 0xffffff,
  userMiss: 0x83401e,
  userGlowFill: 0xffd14a,
  userGlowStroke: 0xfff2b8,
  userMissStroke: 0xffffff,
  playhead: 0xffffff,
  technique: 0xffffff, // Default tint
}

const ALPHAS = {
  background: 0.0,
  grid: 0.2,
  melodyFill: 0.5,
  melodyOutFill: 0.5,
  melodyStroke: 1,
  missFill: 0.85,
  missStroke: 0.9,
  userMiss: 0.5,
  userMissStroke: 0.1,
  userGlowFill: 0.95,
  userGlowStroke: 0.9,
  playheadOuter: 0.15,
  playheadMid: 0.35,
  playheadInner: 0.9,
}

const STROKE_WIDTH = {
  grid: 1,
  melody: 2,
  miss: 1,
  user: 1,
  userGlow: 1,
  playheadOuter: 8,
  playheadMid: 4,
  playheadInner: 2,
}

const PLAYHEAD_DOT_RADIUS = 5
const FILL_DELAY_SEC = 0.65
const NOTE_MERGE_CONFIG = {
  // Semitone tolerance for considering the user's pitch "in range" of the target.
  pitchToleranceSemis: 2,
  // Minimum fraction of target note duration the user must cover to treat it as full-length.
  coverageRatio: 0.75,
  // Silence gap (seconds) to consider a note ended when RMS drops below the gate.
  gapThresholdSec: 0.5,
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
  lastPitchRef,
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
  smoothAlpha = 0.1,
  particleConfig = DEFAULT_PARTICLE_CONFIG,
  glissandoUpCount = 0,
  kobushiCount = 0,
  glissandoDownCount = 0,
  vibratoCount = 0,
  techniqueEventsRef,
  currentSection = 1,
  totalSections = 6,
  className,
  style,
}) {
  const containerRef = useRef(null)

  // Refs for animation targets
  const shakuriRef = useRef(null)
  const kobushiRef = useRef(null)
  const fallRef = useRef(null)
  const vibratoRef = useRef(null)

  const pixiRef = useRef({
    app: null,
    bg: null,
    grid: null,
    notes: null,
    miss: null,
    user: null,
    userGlowContainer: null,
    userGlow: null,
    particleSystem: null,
    comboSystem: null,
    playhead: null,
    lastSize: { w: 0, h: 0 },
    lastGrid: { w: 0, h: 0, lineCount: 12 },
    lastCenterPitch: null,
    lastCenterSnap: null,
    centerSnap: null,
    lastCounts: {
      shakuri: 0,
      kobushi: 0,
      fall: 0,
      fall: 0,
      vibrato: 0
    },
    techniqueSprites: [] // For tracking active sprites
  })
  const stateRef = useRef({
    reference,
    historyRef,
    lastPitchRef,
    currentTimeRef,
    transpositionRef,
    rmsGate,
    gateUserByTarget,
    userOffsetSec,
    windowSec,
    minMidi,
    maxMidi,
    smoothAlpha,
    particleConfig,
    glissandoUpCount,
    kobushiCount,
    glissandoDownCount,
    vibratoCount
  })

  const triggerComboHit = (ref, color) => {
    if (!ref.current) return
    ref.current.animate([
      { transform: 'scale(1)', filter: 'brightness(1)', backgroundColor: 'transparent' },
      { transform: 'scale(1.3)', filter: 'brightness(2)', backgroundColor: color, offset: 0.1 },
      { transform: 'scale(1)', filter: 'brightness(1)', backgroundColor: 'transparent' }
    ], {
      duration: 800,
      easing: 'ease-out'
    })
  }

  useEffect(() => {
    stateRef.current = {
      reference,
      historyRef,
      lastPitchRef,
      currentTimeRef,
      transpositionRef,
      rmsGate,
      gateUserByTarget,
      userOffsetSec,
      windowSec,
      minMidi,
      maxMidi,
      smoothAlpha,
      particleConfig,
      glissandoUpCount,
      kobushiCount,
      glissandoDownCount,
      vibratoCount,
      techniqueEventsRef
    }
  }, [
    reference,
    historyRef,
    lastPitchRef,
    currentTimeRef,
    transpositionRef,
    rmsGate,
    gateUserByTarget,
    userOffsetSec,
    windowSec,
    minMidi,
    maxMidi,
    smoothAlpha,
    particleConfig,
    glissandoUpCount,
    kobushiCount,
    glissandoDownCount,
    vibratoCount,
    techniqueEventsRef
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
      const trail = new Graphics() // F0 Trail
      const techniqueIcons = new Container() // Technique Icons
      const techniqueSpritePool = [] // Pool of sprites
      const particleSystem = createParticleSystem(particleConfig)
      const comboSystem = createComboSystem()
      const playhead = new Graphics()

      userGlowContainer.addChild(particleSystem.container, comboSystem.container, userGlow, trail)
      userGlowContainer.filters = [
        new BloomFilter({
          strength: 8,
          quality: 4,
          threshold: 0.2,
        }),
      ]
      app.stage.addChild(bg, grid, notes, miss, user, userGlowContainer, playhead, techniqueIcons)

      pixiRef.current = {
        app,
        bg,
        grid,
        notes,
        miss,
        user,
        userGlowContainer,
        userGlow,
        trail,
        techniqueIcons,
        techniqueSpritePool,
        particleSystem,
        comboSystem,
        playhead,
        lastSize: { w: 0, h: 0 },
        lastGrid: { w: 0, h: 0, lineCount: 12 },
        lastCenterPitch: null,
        lastCenterSnap: null,
        centerSnap: null,
        lastCounts: {
          shakuri: glissandoUpCount,
          kobushi: kobushiCount,
          fall: glissandoDownCount,
          vibrato: vibratoCount
        },
        techniqueSprites: []
      }

      app.ticker.add(() => {
        const state = pixiRef.current
        const { app: activeApp } = state
        if (!activeApp) return
        const w = activeApp.screen.width
        const h = activeApp.screen.height
        if (!w || !h) return
        const deltaSec = activeApp.ticker.deltaMS / 1000

        const snap = stateRef.current

        // Update Combo System logic
        if (state.comboSystem) {
          state.comboSystem.update(deltaSec)

          // Check for new techniques
          const curShakuri = snap.glissandoUpCount || 0
          const curKobushi = snap.kobushiCount || 0
          const curFall = snap.glissandoDownCount || 0
          const curVibrato = snap.vibratoCount || 0

          const last = state.lastCounts

          // Detect changes (trigger on increase)
          // Start Position: Playhead
          const startX = activeApp.screen.width * 0.7
          const startY = Number.isFinite(state.playheadDotY) ? state.playheadDotY : h / 2

          // Targets (Relative to canvas size)
          // Approx based on layout:
          // Shakuri: ~60px
          // Kobushi: ~170px
          // Fall: ~280px
          // Vibrato: ~390px
          const targetY = h - 30

          if (curShakuri > last.shakuri) {
            state.comboSystem.spawnCombo(startX, startY, 60, targetY, TECHNIQUE_CONFIG.glissup.color)
            setTimeout(() => triggerComboHit(shakuriRef, toCssColor(TECHNIQUE_CONFIG.glissup.color)), 600)
            last.shakuri = curShakuri
          }
          if (curKobushi > last.kobushi) {
            state.comboSystem.spawnCombo(startX, startY, 170, targetY, TECHNIQUE_CONFIG.kobushi.color)
            setTimeout(() => triggerComboHit(kobushiRef, toCssColor(TECHNIQUE_CONFIG.kobushi.color)), 600)
            last.kobushi = curKobushi
          }
          if (curFall > last.fall) {
            state.comboSystem.spawnCombo(startX, startY, 280, targetY, TECHNIQUE_CONFIG.glissdown.color)
            setTimeout(() => triggerComboHit(fallRef, toCssColor(TECHNIQUE_CONFIG.glissdown.color)), 600)
            last.fall = curFall
          }
          if (curVibrato > last.vibrato) {
            state.comboSystem.spawnCombo(startX, startY, 390, targetY, TECHNIQUE_CONFIG.vibrato.color)
            setTimeout(() => triggerComboHit(vibratoRef, toCssColor(TECHNIQUE_CONFIG.vibrato.color)), 600)
            last.vibrato = curVibrato
          }
        }

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
        let centerSnapTarget = state.lastCenterSnap
        if (!Number.isFinite(centerSnapTarget)) {
          centerSnapTarget = Math.round(centerPitch / 12) * 12
        }
        if (Number.isFinite(medianMidi)) {
          while (medianMidi > centerSnapTarget + 8) centerSnapTarget += 12
          while (medianMidi < centerSnapTarget - 8) centerSnapTarget -= 12
        }
        state.lastCenterPitch = centerPitch
        state.lastCenterSnap = centerSnapTarget
        const smoothAlpha = Math.max(0, Math.min(1, Number(snap.smoothAlpha) || 0))
        if (!Number.isFinite(state.centerSnap) || smoothAlpha <= 0) {
          state.centerSnap = centerSnapTarget
        } else {
          state.centerSnap += (centerSnapTarget - state.centerSnap) * smoothAlpha
          if (Math.abs(state.centerSnap - centerSnapTarget) < 1e-3) {
            state.centerSnap = centerSnapTarget
          }
        }
        const centerSnap = state.centerSnap
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
          state.bg.rect(0, 0, w, h)
          state.bg.fill()
          if (state.userGlowContainer) {
            state.userGlowContainer.filterArea = activeApp.screen
          }
          state.particleSystem?.setBounds(activeApp.screen)
        }
        const needsGrid = needsResize || state.lastGrid.lineCount !== lineCount
        if (needsGrid) {
          state.lastGrid = { w, h, lineCount }
          state.grid.clear()
          state.grid.setStrokeStyle({
            width: STROKE_WIDTH.grid,
            color: COLORS.grid,
            alpha: ALPHAS.grid,
          })
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
        state.notes.setStrokeStyle({
          width: STROKE_WIDTH.melody,
          color: COLORS.grid, // Keeping grid color for stroke?
          alpha: ALPHAS.melodyStroke,
        })

        drawMelodyNotes(COLORS.melodyFill, ALPHAS.melodyFill, true)
        drawMelodyNotes(COLORS.melodyOutFill, ALPHAS.melodyOutFill, false)

        const history = snap.historyRef?.current || []
        const gapThreshold = NOTE_MERGE_CONFIG.gapThresholdSec
        const historyStep = history.length > 1
          ? Math.max(
            0.02,
            Math.min(0.2, (history[history.length - 1].t - history[0].t) / (history.length - 1)),
          )
          : 0.08
        const nextTime = (idx) =>
          idx + 1 < history.length ? history[idx + 1].t : history[idx].t + historyStep

        const forcedNotes = []
        if (notesData.length && history.length) {
          notesData.forEach((note) => {
            if (note.t1Sec < visibleStart || note.t0Sec > visibleEnd) return
            const noteStart = note.t0Sec
            const noteEnd = note.t1Sec
            const duration = noteEnd - noteStart
            if (duration <= 0) return
            const targetMidi = note.midi + transposition
            let covered = 0
            for (let i = 0; i < history.length; i += 1) {
              const point = history[i]
              if (point.t < noteStart || point.t > noteEnd) continue
              const userMidi = Number.isFinite(point.userMidi) ? Number(point.userMidi) : null
              if (!Number.isFinite(userMidi)) continue
              const pointRms = Number.isFinite(point.rms) ? Number(point.rms) : null
              if (Number.isFinite(pointRms) && pointRms < snap.rmsGate) continue
              if (snap.gateUserByTarget && snap.reference) {
                const t = Number(point.t)
                const offset = Math.max(0, Number(snap.userOffsetSec) || 0)
                const targetMidiGate =
                  getTargetMidiAtTime(snap.reference, t - offset) ??
                  getTargetMidiAtTime(snap.reference, t + offset)
                if (targetMidiGate == null) continue
              }
              const mappedMidi = mapUserMidiToTargetOctave(userMidi, targetMidi)
              if (!Number.isFinite(mappedMidi)) continue
              if (Math.abs(mappedMidi - targetMidi) > NOTE_MERGE_CONFIG.pitchToleranceSemis) continue
              const segStart = Math.max(noteStart, point.t)
              const segEnd = Math.min(noteEnd, nextTime(i))
              const dt = segEnd - segStart
              if (dt > 0) covered += dt
            }
            if (covered / duration >= NOTE_MERGE_CONFIG.coverageRatio) {
              const { y, inRange } = midiToY(targetMidi)
              forcedNotes.push({ t0: noteStart, t1: noteEnd, y, inRange, targetMidi })
            }
          })
        }

        const isForcedTime = (t) =>
          forcedNotes.some((note) => t >= note.t0 && t <= note.t1)

        const buildSegments = (classifier) => {
          const segments = []
          let current = null
          for (let i = 0; i < history.length; i += 1) {
            const point = history[i]
            const info = classifier(point)
            if (!info) {
              if (current) {
                segments.push(current)
                current = null
              }
              continue
            }
            const t = point.t
            const dt = Math.max(0, nextTime(i) - t)
            const sampleEnd = t + Math.min(dt, gapThreshold)
            if (
              !current ||
              current.key !== info.key ||
              t - current.lastT > gapThreshold
            ) {
              if (current) segments.push(current)
              current = {
                t0: t,
                t1: sampleEnd,
                y: info.y,
                key: info.key,
                type: info.type,
                lastT: t,
              }
            } else {
              current.t1 = Math.max(current.t1, sampleEnd)
              current.lastT = t
            }
          }
          if (current) segments.push(current)
          return segments
        }

        const segments = buildSegments((point) => {
          if (point.t < visibleStart || point.t > visibleEnd) return null
          const targetMidiPoint = Number.isFinite(point.targetMidi) ? Number(point.targetMidi) : null
          const userMidi = Number.isFinite(point.userMidi) ? Number(point.userMidi) : null
          if (!Number.isFinite(userMidi)) return null
          const pointRms = Number.isFinite(point.rms) ? Number(point.rms) : null
          if (Number.isFinite(pointRms) && pointRms < snap.rmsGate) return null
          if (snap.gateUserByTarget && snap.reference) {
            const t = Number(point.t)
            const offset = Math.max(0, Number(snap.userOffsetSec) || 0)
            const targetMidiGate =
              getTargetMidiAtTime(snap.reference, t - offset) ??
              getTargetMidiAtTime(snap.reference, t + offset)
            if (targetMidiGate == null) return null
          }
          if (!Number.isFinite(targetMidiPoint)) return null
          const mappedMidi = mapUserMidiToTargetOctave(userMidi, targetMidiPoint)
          if (!Number.isFinite(mappedMidi)) return null
          const { y, inRange } = midiToY(mappedMidi)
          const inTolerance = Math.abs(mappedMidi - targetMidiPoint) <= NOTE_MERGE_CONFIG.pitchToleranceSemis
          const forcedTime = isForcedTime(point.t)
          if (inRange && inTolerance) {
            if (forcedTime) return null
            return { type: 'correct', key: `correct-${Math.round(targetMidiPoint)}`, y }
          }
          return {
            type: 'incorrect',
            key: `incorrect-${Math.round(userMidi)}-${Math.round(targetMidiPoint)}`,
            y,
          }
        })

        const forcedCorrect = []
        forcedNotes.forEach((note) => {
          const entry = {
            t0: note.t0,
            t1: note.t1,
            y: note.y,
          }
          if (note.inRange) forcedCorrect.push(entry)
        })

        const correctSegments = segments.filter((seg) => seg.type === 'correct').concat(forcedCorrect)
        const incorrectSegments = segments.filter((seg) => seg.type === 'incorrect')
        const userBarW = Math.max(6, pixelsPerSec * 0.18)
        const userBarH = 10
        const userRadius = 5

        state.miss.clear()
        state.user.clear()
        if (state.userGlow) state.userGlow.clear()
        state.user.setFillStyle({ color: COLORS.userMiss, alpha: ALPHAS.userMiss })
        state.user.setStrokeStyle({
          width: STROKE_WIDTH.user,
          color: COLORS.userMissStroke,
          alpha: ALPHAS.userMissStroke,
        })
        state.user.beginPath()
        incorrectSegments.forEach((seg) => {
          const x0 = playheadX + (seg.t0 - songTimeSec) * pixelsPerSec
          const x1 = playheadX + (seg.t1 - songTimeSec) * pixelsPerSec
          const barW = Math.max(userBarW, x1 - x0)
          if (barW <= 0) return
          state.user.roundRect(x0, seg.y - userBarH / 2, barW, userBarH, userRadius)
        })
        state.user.fill()
        state.user.stroke()
        if (state.userGlow) {
          state.userGlow.setFillStyle({ color: COLORS.userGlowFill, alpha: ALPHAS.userGlowFill })
          state.userGlow.setStrokeStyle({
            width: STROKE_WIDTH.userGlow,
            color: COLORS.userGlowStroke,
            alpha: ALPHAS.userGlowStroke,
          })
          state.userGlow.beginPath()
          correctSegments.forEach((seg) => {
            const renderEndTime = songTimeSec - FILL_DELAY_SEC
            if (seg.t0 > renderEndTime) return

            const effectiveT1 = Math.min(seg.t1, renderEndTime)
            if (effectiveT1 <= seg.t0) return

            const x0 = playheadX + (seg.t0 - songTimeSec) * pixelsPerSec
            const x1 = playheadX + (effectiveT1 - songTimeSec) * pixelsPerSec
            const barW = Math.max(userBarW, x1 - x0)
            if (barW <= 0) return
            state.userGlow.roundRect(x0, seg.y - userBarH / 2, barW, userBarH, userRadius)
          })
          state.userGlow.fill()
          state.userGlow.stroke()
        }

        let playheadDotY = null
        let emitParticles = false
        const lastPitch = snap.lastPitchRef?.current
        let userMidi = Number.isFinite(lastPitch?.midi) ? Number(lastPitch.midi) : null
        let userRms = Number.isFinite(lastPitch?.rms) ? Number(lastPitch.rms) : null
        if (!Number.isFinite(userMidi)) {
          const history = snap.historyRef?.current || []
          const lastPoint = history.length ? history[history.length - 1] : null
          if (Number.isFinite(lastPoint?.userMidi)) {
            userMidi = Number(lastPoint.userMidi)
            userRms = Number.isFinite(lastPoint?.rms) ? Number(lastPoint.rms) : userRms
          }
        }
        const passesGate =
          Number.isFinite(userMidi) &&
          (!Number.isFinite(userRms) || userRms >= (Number(snap.rmsGate) || 0))
        if (passesGate) {
          let targetMidi = null
          if (snap.reference) {
            if (snap.gateUserByTarget) {
              const offset = Math.max(0, Number(snap.userOffsetSec) || 0)
              targetMidi =
                getTargetMidiAtTime(snap.reference, songTimeSec - offset) ??
                getTargetMidiAtTime(snap.reference, songTimeSec + offset)
            } else {
              targetMidi = getTargetMidiAtTime(snap.reference, songTimeSec)
            }
          }
          if (!(snap.gateUserByTarget && snap.reference && targetMidi == null)) {
            const transposedTarget = targetMidi != null ? targetMidi + transposition : null
            const mappedMidi = Number.isFinite(transposedTarget)
              ? mapUserMidiToTargetOctave(userMidi, transposedTarget)
              : userMidi
            const { y, inRange } = midiToY(mappedMidi)
            playheadDotY = y
            // Expose y for combo system
            state.playheadDotY = y

            const isCorrectKey =
              Number.isFinite(transposedTarget) &&
              mod12(Math.round(userMidi)) === mod12(Math.round(transposedTarget))
            emitParticles = isCorrectKey && inRange
          }
        }

        // F0 Trail Rendering
        state.trail.clear()
        const trailDuration = 2.0
        const trailPoints = history.filter(h => h.t > songTimeSec - trailDuration && h.t <= songTimeSec)

        if (trailPoints.length > 1) {
          for (let i = 0; i < trailPoints.length - 1; i++) {
            const p1 = trailPoints[i]
            const p2 = trailPoints[i + 1]

            // Check if this segment is "correct". 
            // We verify if the time t covers any correct segment.
            // Since correctSegments are time-ranges, we check overlap.
            const isCorrect1 = correctSegments.some(seg => p1.t >= seg.t0 && p1.t <= seg.t1)

            // Optimize: If not correct, maybe skip? User wants "correct notes" drawn in yellow.
            // If we want a continuous line specifically for correct parts:
            if (!isCorrect1) continue

            // We also need screen coordinates
            // p1.y might not be computed yet if we didn't map it.
            // We need to re-map or store mapped values.
            // Let's re-map quickly.
            const getPointY = (p) => {
              let tm = null
              if (snap.reference) {
                if (snap.gateUserByTarget) {
                  const offset = Math.max(0, Number(snap.userOffsetSec) || 0)
                  tm = getTargetMidiAtTime(snap.reference, p.t - offset) ?? getTargetMidiAtTime(snap.reference, p.t + offset)
                } else {
                  tm = getTargetMidiAtTime(snap.reference, p.t)
                }
              }
              if (tm == null) return null // No target, can't map correct
              const userMidi = Number(p.userMidi)
              if (!Number.isFinite(userMidi)) return null
              const mapped = mapUserMidiToTargetOctave(userMidi, tm)
              const { y } = midiToY(mapped) // uses closure variables !
              return y
            }

            const y1 = getPointY(p1)
            const y2 = getPointY(p2)

            if (y1 === null || y2 === null) continue

            const x1 = playheadX + (p1.t - songTimeSec) * pixelsPerSec
            const x2 = playheadX + (p2.t - songTimeSec) * pixelsPerSec

            // Alpha fade
            const age = songTimeSec - p1.t
            const alpha = Math.max(0, 1 - age / trailDuration)

            state.trail.setStrokeStyle({
              width: 4, // Slightly thicker than melody
              color: COLORS.userGlowFill, // Yellow from config
              alpha: alpha,
              cap: 'round',
              join: 'round'
            })

            state.trail.moveTo(x1, y1)
            state.trail.lineTo(x2, y2)
            state.trail.stroke()
          }
        }

        // Technique Icons Rendering (Sprites)
        const events = snap.techniqueEventsRef?.current || []
        const visibleEvents = events.filter(e => e.t >= visibleStart && e.t <= visibleEnd)

        // Using sprite pool to avoid GC
        const pool = state.techniqueSpritePool || []
        // Ensure pool is stored
        if (!state.techniqueSpritePool) state.techniqueSpritePool = pool

        let poolIdx = 0
        const processedNotes = new Set()

        visibleEvents.forEach(evt => {
          const config = TECHNIQUE_CONFIG[evt.type]
          if (!config) return

          // Find corresponding note to align Y
          // Robust search: strict overlap first, then closest distance
          let note = notesData.find(n => evt.t >= n.t0Sec - 0.2 && evt.t <= n.t1Sec + 0.2)

          if (!note) {
            const threshold = 1.0
            const candidates = notesData.filter(n =>
              evt.t >= n.t0Sec - threshold && evt.t <= n.t1Sec + threshold
            )
            if (candidates.length > 0) {
              // Sort by closeness to event time
              candidates.sort((a, b) => {
                const distA = Math.min(Math.abs(evt.t - a.t0Sec), Math.abs(evt.t - a.t1Sec))
                const distB = Math.min(Math.abs(evt.t - b.t0Sec), Math.abs(evt.t - b.t1Sec))
                return distA - distB
              })
              note = candidates[0]
            }
          }

          // If still no note, strictly do not render (per user request to obtain Y from melody)
          if (!note) return

          const midi = note.midi + transposition
          const { y: noteY } = midiToY(midi)
          const y = noteY - 5 // User preferred offset

          const x = playheadX + (evt.t - songTimeSec) * pixelsPerSec

          let graphic = pool[poolIdx]
          if (!graphic) {
            graphic = new Graphics()
            // Set Pivot to bottom center (32 width / 2 = 16, 32 height)
            graphic.pivot.set(16, 32)
            graphic.scale.set(0.65)
            state.techniqueIcons.addChild(graphic)
            pool.push(graphic)
          }

          if (graphic.lastType !== evt.type) {
            graphic.clear()
            graphic.svg(config.svg)
            graphic.lastType = evt.type
          }

          graphic.tint = config.color
          graphic.x = x
          graphic.y = y
          graphic.visible = true

          poolIdx++
        })

        // Hide unused sprites
        for (let i = poolIdx; i < pool.length; i++) {
          pool[i].visible = false
        }

        state.playhead.clear()
        const alignedPlayheadX = Math.round(playheadX) + 0.5
        state.playhead.setStrokeStyle({
          width: STROKE_WIDTH.playheadOuter,
          color: COLORS.playhead,
          alpha: ALPHAS.playheadOuter,
        })
        state.playhead.beginPath()
        state.playhead.moveTo(alignedPlayheadX, 0)
        state.playhead.lineTo(alignedPlayheadX, h)
        state.playhead.stroke()
        state.playhead.setStrokeStyle({
          width: STROKE_WIDTH.playheadMid,
          color: COLORS.playhead,
          alpha: ALPHAS.playheadMid,
        })
        state.playhead.beginPath()
        state.playhead.moveTo(alignedPlayheadX, 0)
        state.playhead.lineTo(alignedPlayheadX, h)
        state.playhead.stroke()
        state.playhead.setStrokeStyle({
          width: STROKE_WIDTH.playheadInner,
          color: COLORS.playhead,
          alpha: ALPHAS.playheadInner,
        })
        state.playhead.beginPath()
        state.playhead.moveTo(alignedPlayheadX, 0)
        state.playhead.lineTo(alignedPlayheadX, h)
        state.playhead.stroke()
        if (Number.isFinite(playheadDotY)) {
          state.playhead.setFillStyle({ color: COLORS.playhead, alpha: ALPHAS.playheadInner })
          state.playhead.beginPath()
          state.playhead.circle(alignedPlayheadX, playheadDotY, PLAYHEAD_DOT_RADIUS)
          state.playhead.fill()
        }

        if (state.particleSystem) {
          state.particleSystem.setConfig(snap.particleConfig)
          state.particleSystem.update(deltaSec, emitParticles, alignedPlayheadX, playheadDotY)
        }
      })
    }

    init()
    return () => {
      active = false
      const app = pixiRef.current.app
      const particleSystem = pixiRef.current.particleSystem
      const comboSystem = pixiRef.current.comboSystem
      if (particleSystem) particleSystem.destroy()
      if (comboSystem) comboSystem.destroy()
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
        particleSystem: null,
        comboSystem: null,
        playhead: null,
        lastSize: { w: 0, h: 0 },
        lastGrid: { w: 0, h: 0, lineCount: 12 },
        lastCenterPitch: null,
        lastCenterSnap: null,
        centerSnap: null,
        lastCounts: {
          shakuri: 0, kobushi: 0, fall: 0, vibrato: 0
        }
      }
    }
  }, [])

  useEffect(() => {
    const app = pixiRef.current.app
    if (!app) return
    app.renderer.resize(width, height)
  }, [width, height])

  return (
    <div className={className} style={{ ...style, position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <KaraokeOverlay
        glissandoUpCount={glissandoUpCount}
        kobushiCount={kobushiCount}
        glissandoDownCount={glissandoDownCount}
        vibratoCount={vibratoCount}
        currentSection={currentSection}
        totalSections={totalSections}
        shakuriRef={shakuriRef}
        kobushiRef={kobushiRef}
        fallRef={fallRef}
        vibratoRef={vibratoRef}
      />
    </div>
  )
}

// Styling Configuration
const OVERLAY_STYLE = {
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '8px 12px',
    boxSizing: 'border-box',
    fontFamily: '"Hiragino Kaku Gothic ProN", "Meiryo", sans-serif',
  },
  perfInterval: {
    container: { alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 8 },
    label: {
      color: '#fff',
      fontSize: 14,
      fontWeight: 'bold',
      textShadow: '0 1px 2px rgba(0,0,0,0.8)',
      marginRight: 6,
    },
    circle: {
      width: 24,
      height: 24,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      fontWeight: '900',
    },
    activeCircle: {
      background: 'linear-gradient(180deg, #ffeb3b 0%, #fbc02d 100%)',
      border: '2px solid #fff',
      color: '#000',
      boxShadow: '0 0 8px rgba(255, 235, 59, 0.6)',
    },
    inactiveCircle: {
      background: 'rgba(0,0,0,0.6)',
      border: '1px solid #555',
      color: '#888',
      boxShadow: 'none',
    },
  },
  countBox: {
    container: {
      display: 'flex',
      gap: 12,
      alignItems: 'flex-end',
    },
    box: {
      background: 'linear-gradient(180deg, rgba(30,30,30,0.9) 0%, rgba(10,10,10,0.95) 100%)',
      borderRadius: 8,
      padding: '4px 10px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      height: 32,
      minWidth: 90,
    },
    label: { fontSize: 13, fontWeight: 'bold' },
    count: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '900',
      marginLeft: 'auto',
      fontFamily: 'Arial, sans-serif',
      lineHeight: 1,
    },
    iconSize: { width: 15, height: 15 },
  },
}

// Helper to convert Pixi hex to CSS hex
const toCssColor = (hex) => '#' + hex.toString(16).padStart(6, '0')

function KaraokeOverlay({
  glissandoUpCount = 0,
  kobushiCount = 0,
  glissandoDownCount = 0,
  vibratoCount = 0,
  currentSection = 0,
  totalSections = 6,
  shakuriRef,
  kobushiRef,
  fallRef,
  vibratoRef,
}) {
  const counts = {
    shakuri: glissandoUpCount,
    kobushi: kobushiCount,
    fall: glissandoDownCount,
    vibrato: vibratoCount
  }
  const refs = {
    shakuri: shakuriRef,
    kobushi: kobushiRef,
    fall: fallRef,
    vibrato: vibratoRef
  }

  return (
    <div style={OVERLAY_STYLE.container}>
      <div style={OVERLAY_STYLE.perfInterval.container}>
        <span style={OVERLAY_STYLE.perfInterval.label}>演奏区間</span>
        {Array.from({ length: totalSections }).map((_, i) => {
          const num = i + 1
          const isActive = num === currentSection
          const style = {
            ...OVERLAY_STYLE.perfInterval.circle,
            ...(isActive ? OVERLAY_STYLE.perfInterval.activeCircle : OVERLAY_STYLE.perfInterval.inactiveCircle),
          }
          return (
            <div key={num} style={style}>
              {num}
            </div>
          )
        })}
      </div>

      <div style={OVERLAY_STYLE.countBox.container}>
        {Object.values(TECHNIQUE_CONFIG).map((conf) => (
          <CountBox
            key={conf.id}
            ref={refs[conf.id]}
            label={conf.label}
            count={counts[conf.id]}
            color={toCssColor(conf.color)}
            borderColor={toCssColor(conf.color)}
            icon={<div style={{ ...OVERLAY_STYLE.countBox.iconSize, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '-2px' }}>{conf.icon}</div>}
          />
        ))}
      </div>
    </div>
  )
}

const CountBox = forwardRef(({ label, count, color, borderColor, icon, labelColor }, ref) => {
  return (
    <div
      ref={ref}
      style={{
        ...OVERLAY_STYLE.countBox.box,
        border: `2px solid ${borderColor}`,
        boxShadow: `0 0 5px ${borderColor}40, inset 0 1px 0 rgba(255,255,255,0.2)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ ...OVERLAY_STYLE.countBox.label, color: labelColor || '#eee' }}>{label}</span>
        <span style={{ color: borderColor, display: 'flex', alignItems: 'center' }}>{icon}</span>
      </div>
      <div style={OVERLAY_STYLE.countBox.count}>{count}</div>
    </div>
  )
})
CountBox.displayName = 'CountBox'

export default MelodyGuideCanvas
