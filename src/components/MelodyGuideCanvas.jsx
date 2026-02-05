import { useEffect, useRef, forwardRef, useState } from 'react'
import { Application, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js'
import { BloomFilter } from 'pixi-filters'
import { getTargetNoteAtTick, mergeAdjacentNotesByPitch } from '../engine/audio/midi/referenceMelody.js'
import { DEFAULT_CONFIG } from '../engine/audioEngine.js'
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
  userGlowStroke: 1,
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
  f0: 1, // Added f0 train width
  playheadOuter: 8,
  playheadMid: 4,
  playheadInner: 2,
}

const PLAYHEAD_DOT_RADIUS = 6
const TECHNIQUE_ICON_OFFSET_PX = 20
const SOLFEGE_LABEL_OFFSET_PX = 3
const SOLFEGE_FONT_FAMILY = 'MS PGothic'
const SOLFEGE_FONT_SIZE = 12
const RESULT_DELAY_SEC = 0.2
const USER_GLOW_FILL_SPEED = 1.5 // speed for correct note fill animation
const NOTE_MERGE_CONFIG = {
  // Semitone tolerance for considering the user's pitch "in range" of the target.
  pitchToleranceSemis: Number(DEFAULT_CONFIG.pitchToleranceSemis) || 1.5,
  // Minimum fraction of target note duration the user must cover to treat it as full-length.
  coverageRatio: 0.5,
  // Silence gap (seconds) to consider a note ended when RMS drops below the gate.
  gapThresholdSec: 0.1,
}

// Visual in-tune tolerance for trail + particles
const VISUAL_TOLERANCE_SEMIS = 1.0
// Beat stability threshold in semitones (std dev of userMidi samples within the beat).
// Measured as standard deviation in MIDI semitones; lower = stricter, higher = looser.
// Typical range: 0.2 (very strict) to 0.8 (very loose). Not normalized to 0–1.
const STABILITY_STD_SEMIS = 1

const SOLFEGE_NAMES = ['ﾄﾞ', 'ﾄﾞ#', 'ﾚ', 'ﾚ#', 'ﾐ', 'ﾌｧ', 'ﾌｧ#', 'ｿ', 'ｿ#', 'ﾗ', 'ﾗ#', 'ｼ']
const SOLFEGE_TEXT_STYLE = new TextStyle({
  fontFamily: SOLFEGE_FONT_FAMILY,
  fontSize: SOLFEGE_FONT_SIZE,
  fill: 0xffffff,
  stroke: 0x000000,
  strokeThickness: 4,
})

function getSolfegeLabel(midi) {
  const m = Number(midi)
  if (!Number.isFinite(m)) return null
  const pc = mod12(Math.round(m))
  return SOLFEGE_NAMES[pc] || null
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

function mod12Distance(a, b) {
  const x = Number(a)
  const y = Number(b)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return ((x % 12) - (y % 12) + 18) % 12 - 6
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
  forceUserOnScoring = false,
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
  onTechniqueCountsChange,
  showSolfeges = true,
  debug = true,
}) {
  const containerRef = useRef(null)

  // Refs for animation targets
  const shakuriRef = useRef(null)
  const kobushiRef = useRef(null)
  const fallRef = useRef(null)
  const vibratoRef = useRef(null)

  /* Internal state for validated counts */
  const [validCounts, setValidCounts] = useState({
    glissup: 0,
    kobushi: 0,
    glissdown: 0,
    vibrato: 0
  })
  // Just standard usage:
  // const [validCounts, setValidCounts] = useState({...})

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
      vibrato: 0
    },
    techniqueSprites: [], // For tracking active sprites
    techniqueTextureCache: new Map(),
    solfegeLabels: null,
    solfegeLabelPool: []
  })
  const stateRef = useRef({
    reference,
    historyRef,
    lastPitchRef,
    currentTimeRef,
    transpositionRef,
    rmsGate,
    gateUserByTarget,
    forceUserOnScoring,
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
    showSolfeges,
    debug
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
      forceUserOnScoring,
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
      techniqueEventsRef,
      showSolfeges,
      debug
    }
  }, [
    reference,
    historyRef,
    lastPitchRef,
    currentTimeRef,
    transpositionRef,
    rmsGate,
    gateUserByTarget,
    forceUserOnScoring,
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
    techniqueEventsRef,
    onTechniqueCountsChange,
    showSolfeges,
    debug
  ])

  useEffect(() => {
    // Reset internal tracking on song change
    if (pixiRef.current) {
      if (pixiRef.current.processedNotesRef) pixiRef.current.processedNotesRef.clear()
      pixiRef.current.lastTechniqueEventIndex = 0
      pixiRef.current.lastCounts = { shakuri: 0, kobushi: 0, fall: 0, vibrato: 0 }
    }
    setValidCounts({ glissup: 0, kobushi: 0, glissdown: 0, vibrato: 0 })
  }, [reference])

  useEffect(() => {
    if (onTechniqueCountsChange) {
      onTechniqueCountsChange(validCounts)
    }
  }, [validCounts, onTechniqueCountsChange])

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
      const solfegeLabels = new Container()
      const techniqueSpritePool = [] // Pool of sprites
      const particleSystem = createParticleSystem(particleConfig)
      const comboSystem = createComboSystem()
      const playhead = new Graphics()
      const debugTrace = new Graphics()

      // Generate Textures from SVG strings
      const techniqueTextures = {}
      Object.values(TECHNIQUE_CONFIG).forEach(conf => {
        if (conf.svg) {
          // Create a temporary Graphics object to parse SVG
          const tempGfx = new Graphics().svg(conf.svg)
          // Generate texture
          const texture = app.renderer.generateTexture(tempGfx)
          techniqueTextures[conf.id] = texture
        }
      })
      // Stash textures in ref for access (or just closure since we are inside init)
      // actually we can just keep them here since ticker closes over this scope.

      userGlowContainer.addChild(particleSystem.container, comboSystem.container, userGlow, trail)
      userGlowContainer.filters = [
        new BloomFilter({
          strength: 4,
          quality: 2,
          threshold: 0.2,
        }),
      ]
      app.stage.addChild(bg, grid, notes, miss, solfegeLabels, user, userGlowContainer, playhead, techniqueIcons, debugTrace)

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
        solfegeLabels,
        solfegeLabelPool: [],
        particleSystem,
        comboSystem,
        playhead,
        debugTrace,
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
        techniqueEventsRef,
        lastTechniqueEventIndex: 0,
        techniqueSprites: [],
        processedNotesRef: new Set()
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
          const events = state.techniqueEventsRef?.current || []
          const lastIndex = state.lastTechniqueEventIndex || 0

          // Start Position: Playhead
          const startX = activeApp.screen.width * 0.7
          const startY = Number.isFinite(state.playheadDotY) ? state.playheadDotY : h / 2
          const targetY = h - 30

          // Iterate through new events
          for (let i = lastIndex; i < events.length; i++) {
            const event = events[i]
            // Validate pitch correctness at the time of the event
            const songTime = event.t
            let isValid = false


            if (snap.reference) {
              // Technique validation rule 1: Strict note duration (tick-aligned)
              const ticksPerBeat = Number(snap.reference?.timeDivision) || 480
              const tick = snap.reference?.getTickAtTime ? snap.reference.getTickAtTime(songTime) : songTime
              const bpsNow = snap.reference?.getBeatsPerSecond ? snap.reference.getBeatsPerSecond(songTime) : 2
              const ticksPerSec = (Number.isFinite(bpsNow) ? bpsNow : 2) * ticksPerBeat
              const edgeToleranceTick = 0
              const maxGapTick = 0 * ticksPerSec
              const targetNote = getTargetNoteAtTick(snap.reference, tick, { maxGapTick, edgeToleranceTick })

              if (targetNote) {
                const targetMidi = targetNote.midi
                // Technique validation rule 3: One technique per note
                // We use t0 as a unique ID for the note instance
                const noteId = targetNote.t0Sec
                if (state.processedNotesRef && state.processedNotesRef.has(noteId)) {
                  // Already have a technique for this note
                  continue
                }

                const transposition = snap.transpositionRef?.current ?? 0
                const transposedTarget = targetMidi + transposition

                // Find user pitch history near this time
                const history = snap.historyRef?.current || []
                let bestPoint = null
                let minDiff = Infinity

                for (let j = history.length - 1; j >= 0; j--) {
                  const diff = Math.abs(history[j].t - songTime)
                  if (diff < minDiff) {
                    minDiff = diff
                    bestPoint = history[j]
                  }
                  if (diff > 0.2) break
                }

                if (bestPoint && minDiff < 0.1) {
                  const userMidi = Number(bestPoint.userMidi)
                  if (Number.isFinite(userMidi)) {
                    const mappedMidi = mapUserMidiToTargetOctave(userMidi, transposedTarget)
                    if (Number.isFinite(mappedMidi)) {
                      // Technique validation rule 2: Tune check (mod-12 distance)
                      const distance = mod12Distance(Math.round(userMidi), Math.round(transposedTarget))
                      if (Number.isFinite(distance) && Math.abs(distance) <= NOTE_MERGE_CONFIG.pitchToleranceSemis) {
                        // VALID: Trigger immediately
                        isValid = true

                        // Mark this note as processed to avoid duplicates
                        if (state.processedNotesRef) {
                          state.processedNotesRef.add(noteId)
                        }
                      }
                    }
                  }
                }
              }
            }

            if (isValid) {
              const type = event.type
              event.isValid = false
              event.isPending = true
              if (snap.reference?.getTickAtTime) {
                const ticksPerBeat = Number(snap.reference?.timeDivision) || 480
                const beatIdx = Math.floor(snap.reference.getTickAtTime(songTime) / ticksPerBeat)
                event._beatIdx = beatIdx
              }
              event._type = type
            }
          }
          state.lastTechniqueEventIndex = events.length
        }


        const songTimeSec = snap.currentTimeRef?.current ?? 0
        const breakToleranceSec = Number(DEFAULT_CONFIG.breakToleranceMs) / 1000
        const edgeToleranceSec = Math.min(0.08, Math.max(0, breakToleranceSec / 2))
        const transposition = snap.transpositionRef?.current ?? 0
        const notesData = snap.reference?.notes || []
        const bps = snap.reference?.getBeatsPerSecond ? snap.reference.getBeatsPerSecond(songTimeSec) : 2
        const maxGapBeat = breakToleranceSec * (Number.isFinite(bps) ? bps : 2)
        const scoringNotes = notesData.length
          ? mergeAdjacentNotesByPitch(notesData, { maxGapBeat, pitchToleranceSemis: 0, useBeat: true })
          : []
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

        if (state.solfegeLabels) {
          const labelPool = state.solfegeLabelPool || []
          let labelCount = 0
          if (snap.showSolfeges) {
            let lastMidiKey = null
            let lastNote = null
            for (const note of notesData) {
              const midiKey = Number(note.midi)
              if (!Number.isFinite(midiKey)) {
                lastMidiKey = null
                lastNote = null
                continue
              }
              if (lastNote && note.t0Sec - lastNote.t1Sec > breakToleranceSec) {
                lastMidiKey = null
              }
              const isDistinct = lastMidiKey == null || midiKey !== lastMidiKey
              lastMidiKey = midiKey
              lastNote = note
              if (!isDistinct) continue
              if (note.t1Sec < visibleStart || note.t0Sec > visibleEnd) continue
              const labelText = getSolfegeLabel(midiKey + transposition)
              if (!labelText) continue
              const x0 = playheadX + (note.t0Sec - songTimeSec) * pixelsPerSec
              const { y } = midiToY(midiKey + transposition)
              let label = labelPool[labelCount]
              if (!label) {
                label = new Text({ text: labelText, style: SOLFEGE_TEXT_STYLE })
                label.anchor.set(0, 1)
                state.solfegeLabels.addChild(label)
                labelPool.push(label)
              }
              label.text = labelText
              label.x = x0
              label.y = y - barH / 2 - SOLFEGE_LABEL_OFFSET_PX
              label.visible = true
              labelCount += 1
            }
          }
          for (let i = labelCount; i < labelPool.length; i += 1) {
            labelPool[i].visible = false
          }
          state.solfegeLabelPool = labelPool
        }

        const history = snap.historyRef?.current || []
        const historyStep = history.length > 1
          ? Math.max(
            0.02,
            Math.min(0.2, (history[history.length - 1].t - history[0].t) / (history.length - 1)),
          )
          : 0.08
        const nextTime = (idx) =>
          idx + 1 < history.length ? history[idx + 1].t : history[idx].t + historyStep

        const scoringReference = snap.reference ? { ...snap.reference, notes: scoringNotes } : null
        const getTargetNoteAt = (t, opts = {}) => {
          if (!scoringReference) return null
          const ticksPerBeat = Number(scoringReference?.timeDivision) || 480
          const tick = scoringReference.getTickAtTime ? scoringReference.getTickAtTime(t) : t
          const bpsNow = scoringReference.getBeatsPerSecond ? scoringReference.getBeatsPerSecond(t) : 2
          const ticksPerSec = (Number.isFinite(bpsNow) ? bpsNow : 2) * ticksPerBeat
          const maxGapTick = breakToleranceSec * ticksPerSec
          const edgeToleranceTick = edgeToleranceSec * ticksPerSec
          return getTargetNoteAtTick(scoringReference, tick, {
            maxGapTick,
            edgeToleranceTick,
            ...opts,
          })
        }
        const getTargetMidiAt = (t, opts = {}) => {
          const note = getTargetNoteAt(t, opts)
          return note ? note.midi : null
        }
        const getTargetMidiForUserTime = (t) => {
          if (!snap.reference) return null
          if (snap.gateUserByTarget) {
            const offset = Math.max(0, Number(snap.userOffsetSec) || 0)
            return getTargetMidiAt(t - offset) ?? getTargetMidiAt(t + offset)
          }
          return getTargetMidiAt(t)
        }

        const beatStates = []
        if (snap.reference && typeof snap.reference.getTickAtTime === 'function') {
          const ticksPerBeat = Number(snap.reference.timeDivision) || 480
          const ticksToSeconds = typeof snap.reference.ticksToSeconds === 'function'
            ? (tick) => snap.reference.ticksToSeconds(tick)
            : (tick) =>
                typeof snap.reference.beatsToSeconds === 'function'
                  ? snap.reference.beatsToSeconds(tick / ticksPerBeat)
                  : 0

          const startTick = snap.reference.getTickAtTime(visibleStart)
          const endTick = snap.reference.getTickAtTime(visibleEnd)
          const beatStart = Math.floor(startTick / ticksPerBeat)
          let beatEnd = Math.ceil(endTick / ticksPerBeat)
          // Safety clamp to prevent infinite or massive loops if timing calculation goes wrong
          if (beatEnd - beatStart > 500) {
            beatEnd = beatStart + 500
          }

          for (let b = beatStart; b < beatEnd; b += 1) {
            const t0Tick = b * ticksPerBeat
            const t1Tick = (b + 1) * ticksPerBeat
            const t0 = ticksToSeconds(t0Tick)
            const t1 = ticksToSeconds(t1Tick)
            if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue
            if (t1 < visibleStart || t0 > visibleEnd) continue
            if (songTimeSec < t1) continue

            const totalBeats = (t1Tick - t0Tick) / ticksPerBeat
            let correctBeats = 0
            const beatMidiValues = []
            const configTol = Number(DEFAULT_CONFIG.f0TimeToleranceSec)
            const f0ToleranceSec = Number.isFinite(configTol)
              ? Math.max(0, configTol)
              : Math.min(0.08, Math.max(0.03, edgeToleranceSec))

            for (let i = 0; i < history.length; i += 1) {
              const point = history[i]
              if (point.t < t0 || point.t >= t1) continue
              const next = nextTime(i)
              const sliceStart = Math.max(point.t, t0)
              const sliceEnd = Math.min(next, t1)
              if (sliceEnd <= sliceStart) continue
              const userMidi = Number.isFinite(point.userMidi) ? Number(point.userMidi) : null
              if (!Number.isFinite(userMidi)) continue
              const pointRms = Number.isFinite(point.rms) ? Number(point.rms) : null
              if (Number.isFinite(pointRms) && pointRms < snap.rmsGate) continue

              // Match yellow F0 trail filter: require target + in-tune within VISUAL_TOLERANCE_SEMIS
              const targetMidiForPoint = getTargetMidiForUserTime(point.t)
              const isTargetDefined = Number.isFinite(targetMidiForPoint)
              if (isTargetDefined) {
                const mapped = mapUserMidiToTargetOctave(userMidi, targetMidiForPoint + transposition)
                const diff = Math.abs(mapped - (targetMidiForPoint + transposition))
                if (diff <= VISUAL_TOLERANCE_SEMIS) {
                  beatMidiValues.push(userMidi)
                }
              }

              const sliceStartTick = snap.reference.getTickAtTime(sliceStart - f0ToleranceSec)
              const sliceEndTick = snap.reference.getTickAtTime(sliceEnd + f0ToleranceSec)
              const dtBeat = Math.max(0, (sliceEndTick - sliceStartTick) / ticksPerBeat)
              if (!Number.isFinite(dtBeat) || dtBeat <= 0) continue

              const midT = (sliceStart + sliceEnd) * 0.5
              const rawTarget =
                getTargetMidiAt(midT) ??
                getTargetMidiAt(midT - f0ToleranceSec) ??
                getTargetMidiAt(midT + f0ToleranceSec)
              const targetMidiPoint = Number.isFinite(rawTarget) ? rawTarget + transposition : null
              if (!Number.isFinite(targetMidiPoint)) continue

              const userQuant = Math.round(userMidi)
              const targetQuant = Math.round(targetMidiPoint)
              const distance = mod12Distance(userQuant, targetQuant)
              if (Number.isFinite(distance) && Math.abs(distance) <= NOTE_MERGE_CONFIG.pitchToleranceSemis) {
                correctBeats += dtBeat
              }
            }

            const ratio = totalBeats > 0 ? correctBeats / totalBeats : 0
            let isStable = true
            if (beatMidiValues.length >= 2) {
              const mean = beatMidiValues.reduce((sum, v) => sum + v, 0) / beatMidiValues.length
              const variance = beatMidiValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / beatMidiValues.length
              const std = Math.sqrt(variance)
              isStable = std <= STABILITY_STD_SEMIS
            }
            beatStates.push({
              t0,
              t1,
              beatIdx: b,
              correct: ratio >= NOTE_MERGE_CONFIG.coverageRatio && isStable,
              showAt: t1 + RESULT_DELAY_SEC,
            })
          }
        }
        // Resolve pending technique events after beat completes.
        if (state.techniqueEventsRef?.current && beatStates.length) {
          const startX = activeApp.screen.width * 0.7
          const startY = Number.isFinite(state.playheadDotY) ? state.playheadDotY : h / 2
          const targetY = h - 30
          for (const evt of state.techniqueEventsRef.current) {
            if (!evt.isPending) continue
            const beatIdx = Number.isFinite(evt._beatIdx) ? evt._beatIdx : null
            if (beatIdx == null) continue
            const beatState = beatStates.find((b) => b.beatIdx === beatIdx)
            if (!beatState || songTimeSec < beatState.showAt) continue
            if (beatState.correct) {
              evt.isValid = true
              const type = evt._type || evt.type
              setValidCounts(prev => ({
                ...prev,
                [type]: (prev[type] || 0) + 1
              }))
              if (type === 'glissup') {
                state.comboSystem.spawnCombo(startX, startY, 60, targetY, TECHNIQUE_CONFIG.glissup.color)
                setTimeout(() => triggerComboHit(shakuriRef, toCssColor(TECHNIQUE_CONFIG.glissup.color)), 600)
              } else if (type === 'kobushi') {
                state.comboSystem.spawnCombo(startX, startY, 170, targetY, TECHNIQUE_CONFIG.kobushi.color)
                setTimeout(() => triggerComboHit(kobushiRef, toCssColor(TECHNIQUE_CONFIG.kobushi.color)), 600)
              } else if (type === 'glissdown') {
                state.comboSystem.spawnCombo(startX, startY, 280, targetY, TECHNIQUE_CONFIG.glissdown.color)
                setTimeout(() => triggerComboHit(fallRef, toCssColor(TECHNIQUE_CONFIG.glissdown.color)), 600)
              } else if (type === 'vibrato') {
                state.comboSystem.spawnCombo(startX, startY, 390, targetY, TECHNIQUE_CONFIG.vibrato.color)
                setTimeout(() => triggerComboHit(vibratoRef, toCssColor(TECHNIQUE_CONFIG.vibrato.color)), 600)
              }
            } else {
              evt.isValid = false
            }
            evt.isPending = false
          }
        }

        const userBarH = 10
        const userRadius = 5

        state.miss.clear()
        state.user.clear()
        if (state.userGlow) state.userGlow.clear()
        state.userGlow?.setFillStyle({ color: COLORS.userGlowFill, alpha: ALPHAS.userGlowFill })
        state.userGlow?.beginPath()

        if (beatStates.length && notesData.length) {
          for (const note of notesData) {
            if (note.t1Sec < visibleStart || note.t0Sec > visibleEnd) continue
            const noteT0 = Math.max(note.t0Sec, visibleStart)
            const noteT1 = Math.min(note.t1Sec, visibleEnd)
            if (noteT1 <= noteT0) continue
            const midi = note.midi + transposition
            const { y } = midiToY(midi)
            const noteBeats = []
            for (const beatSeg of beatStates) {
              if (beatSeg.t1 <= note.t0Sec) continue
              if (beatSeg.t0 >= note.t1Sec) break
              const segStart = Math.max(note.t0Sec, beatSeg.t0)
              const segEnd = Math.min(note.t1Sec, beatSeg.t1)
              if (segEnd <= segStart) continue
              noteBeats.push({
                t0: segStart,
                t1: segEnd,
                correct: beatSeg.correct,
                showAt: beatSeg.showAt,
              })
            }
            if (!noteBeats.length || !state.userGlow) continue

            // Gather correct beats
            const spansToDraw = []
            noteBeats.forEach(seg => {
              if (seg.correct && songTimeSec >= seg.showAt) {
                spansToDraw.push({ t0: seg.t0, t1: seg.t1, showAt: seg.showAt })
              }
            })

            if (!spansToDraw.length) continue

            // 1. Merge contiguous spans AND track the latest segment info for animation
            spansToDraw.sort((a, b) => a.t0 - b.t0)
            const merged = []
            if (spansToDraw.length) {
              // We track 'maxT1Seg' which is the segment that defines the right-most edge of the merged block.
              // This segment's 'showAt' time dictates the animation start for the extension.
              let curr = {
                t0: spansToDraw[0].t0,
                t1: spansToDraw[0].t1,
                latestSeg: spansToDraw[0]
              }

              for (let i = 1; i < spansToDraw.length; i++) {
                const next = spansToDraw[i]
                if (next.t0 <= curr.t1 + 0.001) {
                  curr.t1 = Math.max(curr.t1, next.t1)
                  // If this segment extends the block, it's the new "latest"
                  if (next.t1 > curr.latestSeg.t1) {
                    curr.latestSeg = next
                  }
                } else {
                  merged.push(curr)
                  // New block
                  curr = {
                    t0: next.t0,
                    t1: next.t1,
                    latestSeg: next
                  }
                }
              }
              merged.push(curr)
            }

            // 3. Draw merged spans with "Latest Beat Anchor" wipe
            merged.forEach(m => {
              // Calculate wipe cursor based on the latest added segment in this block.
              // Visual Idea: The block is solid up to 'latestSeg.t0' (roughly).
              // We animate the fill from 'latestSeg.t0' to 'latestSeg.t1' starting at 'latestSeg.showAt'.
              // OR more simply: The wipe cursor starts at 'latestSeg.t0' at time 'latestSeg.showAt'.
              const anchorBeat = m.latestSeg

              // When does the animation for this specific beat start?
              // It starts exactly when the beat is revealed: anchorBeat.showAt (beatEnd + 0.2s)
              // The wiper starts at the beginning of that beat: anchorBeat.t0
              const timeSinceReveal = Math.max(0, songTimeSec - anchorBeat.showAt)
              const wipeDist = timeSinceReveal * USER_GLOW_FILL_SPEED // Speed > 1.0 means it catches up

              // The cursor position in absolute song time
              let wipeCursor = anchorBeat.t0 + wipeDist

              // IMPORTANT: If this merged block consists of many beats traverse,
              // we technically want the *previous* parts to be fully solid.
              // Since 'anchorBeat.t0' is the start of the *latest* addition,
              // ensuring the wiper starts there guarantees the previous parts ( < t0 ) are considered "passed".
              const finalWipeCursor = Math.max(wipeCursor, anchorBeat.t0)

              // The segment is valid to draw up to m.t1.
              const drawT0 = m.t0
              if (finalWipeCursor <= drawT0) return

              const drawT1 = Math.min(m.t1, finalWipeCursor)

              if (drawT1 > drawT0) {
                const d0 = Math.max(drawT0, visibleStart)
                const d1 = Math.min(drawT1, visibleEnd)
                if (d1 > d0) {
                  const x0 = playheadX + (d0 - songTimeSec) * pixelsPerSec
                  const x1 = playheadX + (d1 - songTimeSec) * pixelsPerSec
                  const barW = Math.max(1, x1 - x0)
                  if (barW > 0) {
                    state.userGlow.roundRect(x0, y - userBarH / 2, barW, userBarH, userRadius)
                  }
                }
              }
            })
          }
        }
        state.userGlow?.fill()

        // F0 Trail
        if (state.trail) state.trail.clear()
        state.trail.setStrokeStyle({
          width: 3,
          color: COLORS.userGlowStroke,
          alpha: 1,
          cap: 'round',
          join: 'round',
        })
        state.trail.beginPath()
        let penDown = false
        const trailHistory = history
        for (let i = 0; i < trailHistory.length; i++) {
          const pt = trailHistory[i]
          if (pt.t < visibleStart || pt.t > visibleEnd) {
            penDown = false
            continue
          }
          const rms = Number.isFinite(pt.rms) ? Number(pt.rms) : 0
          if (rms < snap.rmsGate) {
            penDown = false
            continue
          }
          const midi = Number(pt.userMidi)
          if (!Number.isFinite(midi)) {
            penDown = false
            continue
          }
          // Visual tolerance check?
          const targetMidi = getTargetMidiForUserTime(pt.t)
          const isTargetDefined = Number.isFinite(targetMidi)
          let inTune = false
          if (isTargetDefined) {
            const mapped = mapUserMidiToTargetOctave(midi, targetMidi + transposition)
            const diff = Math.abs(mapped - (targetMidi + transposition))
            if (diff <= VISUAL_TOLERANCE_SEMIS) {
              inTune = true
            }
          }
          // Only draw if "in tune" enough for glow effect
          if (!inTune) {
            penDown = false
            continue
          }

          const { y } = midiToY(mapUserMidiToTargetOctave(midi, targetMidi + transposition))
          const x = playheadX + (pt.t - songTimeSec) * pixelsPerSec
          if (!penDown) {
            state.trail.moveTo(x, y)
            penDown = true
          } else {
            state.trail.lineTo(x, y)
          }
        }
        state.trail.stroke()

        // user miss trail intentionally disabled
        // state.userGlow?.fill() // Moved up

        // --- DEBUG PITCH TRACE ---
        if (state.debugTrace) {
          state.debugTrace.clear()
          if (snap.debug) {
            const debugColor = 0x00FFFF // Cyan
            state.debugTrace.setStrokeStyle({ width: 2, color: debugColor, alpha: 0.8 })
            state.debugTrace.beginPath()

            let started = false

            // Tempo change markers
            if (snap.reference?.tempoChanges?.length && typeof snap.reference.ticksToSeconds === 'function') {
              state.debugTrace.setStrokeStyle({ width: 2, color: 0xFFC400, alpha: 0.6 })
              state.debugTrace.beginPath()
              snap.reference.tempoChanges.forEach((change) => {
                const tick = Number(change?.ticks)
                if (!Number.isFinite(tick)) return
                const t = snap.reference.ticksToSeconds(tick)
                if (!Number.isFinite(t)) return
                if (t < visibleStart || t > visibleEnd) return
                const x = playheadX + (t - songTimeSec) * pixelsPerSec
                state.debugTrace.moveTo(x, 0)
                state.debugTrace.lineTo(x, h)
              })
              state.debugTrace.stroke()
            }

            // Draw Beat Alignment Regions
            beatStates.forEach(beat => {
              const x0 = playheadX + (beat.t0 - songTimeSec) * pixelsPerSec
              const x1 = playheadX + (beat.t1 - songTimeSec) * pixelsPerSec
              const w = x1 - x0
              if (w > 0) {
                // Greenish for correct, reddish for incorrect? Or just neutral
                // Let's use a subtle white box to show the "window"
                state.debugTrace.roundRect(x0, 10, w, h - 20, 0)
                state.debugTrace.setStrokeStyle({ width: 1, color: 0xFFFFFF, alpha: 0.2 })
                state.debugTrace.stroke()
                // Fill based on correctness?
                if (beat.correct) {
                  state.debugTrace.setFillStyle({ color: 0x00FF00, alpha: 0.1 })
                } else {
                  state.debugTrace.setFillStyle({ color: 0xFF0000, alpha: 0.05 })
                }
                state.debugTrace.fill()
              }
            })

            state.debugTrace.setStrokeStyle({ width: 2, color: debugColor, alpha: 0.8 })
            state.debugTrace.beginPath()
            history.forEach((point) => {
              if (point.t < visibleStart || point.t > visibleEnd) return
              const userMidi = Number.isFinite(point.userMidi) ? Number(point.userMidi) : null


              // Draw even if low RMS, or maybe gate it slightly? 
              // User asked for "raw f0 indicate", usually raw means even if noisy, but let's key off > 0 midi
              if (userMidi === null || userMidi <= 0) {
                started = false
                return
              }

              const x = playheadX + (point.t - songTimeSec) * pixelsPerSec
              const { y } = midiToY(userMidi)

              // Clamp Y visually so it doesn't go off canvas wildly
              const drawY = Math.max(0, Math.min(h, y))

              if (!started) {
                state.debugTrace.moveTo(x, drawY)
                started = true
              } else {
                state.debugTrace.lineTo(x, drawY)
              }
            })
            state.debugTrace.stroke()

            // Draw label
            /*
            state.debugTrace.fillStyle = '#00FFFF'
            state.debugTrace.font = '12px monospace'
            state.debugTrace.fillText('RAW F0', 10, 20)
            */
          }
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
            targetMidi = getTargetMidiForUserTime(songTimeSec)
          }
          const allowNoTarget = snap.forceUserOnScoring === true
          if (!(snap.gateUserByTarget && snap.reference && targetMidi == null && !allowNoTarget)) {
            const transposedTarget = targetMidi != null ? targetMidi + transposition : null
            const mappedMidi = Number.isFinite(transposedTarget)
              ? mapUserMidiToTargetOctave(userMidi, transposedTarget)
              : userMidi
            const { y, inRange } = midiToY(mappedMidi)
            playheadDotY = y
            // Expose y for combo system
            state.playheadDotY = y

            const distance = Number.isFinite(transposedTarget)
              ? mod12Distance(Math.round(userMidi), Math.round(transposedTarget))
              : null
            const inTune =
              Number.isFinite(distance) &&
              Math.abs(distance) <= VISUAL_TOLERANCE_SEMIS
            emitParticles = inTune && inRange
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
            const userMidi = Number(p1.userMidi)
            const rms = Number.isFinite(p1.rms) ? Number(p1.rms) : 0
            if (rms < (Number(snap.rmsGate) || 0)) continue
            const targetMidi = getTargetMidiForUserTime(p1.t)
            if (!Number.isFinite(userMidi) || !Number.isFinite(targetMidi)) continue
            const transposedTarget = targetMidi + transposition
            const mappedMidi = mapUserMidiToTargetOctave(userMidi, transposedTarget)
            if (!Number.isFinite(mappedMidi)) continue
            const distance = mod12Distance(Math.round(userMidi), Math.round(transposedTarget))
            const inTune = Number.isFinite(distance) && Math.abs(distance) <= VISUAL_TOLERANCE_SEMIS
            if (!inTune) continue

            // We also need screen coordinates
            // p1.y might not be computed yet if we didn't map it.
            // We need to re-map or store mapped values.
            // Let's re-map quickly.
            const getPointY = (p) => {
              const tm = getTargetMidiForUserTime(p.t)
              if (tm == null) return null // No target, can't map correct
              const userMidi = Number(p.userMidi)
              if (!Number.isFinite(userMidi)) return null
              const mapped = mapUserMidiToTargetOctave(userMidi, tm + transposition)
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
              width: 3,
              color: COLORS.userGlowFill,
              alpha: alpha,
              cap: 'round',
              join: 'round'
            })

            state.trail.moveTo(x1, y1)
            state.trail.lineTo(x2, y2)
            state.trail.stroke()
          }
        }

        // Technique Icons Rendering (SVG -> Texture -> Sprite)
        const events = snap.techniqueEventsRef?.current || []
        const visibleEvents = events.filter(e => e.t >= visibleStart && e.t <= visibleEnd)

        const pool = state.techniqueSpritePool || []
        if (!state.techniqueSpritePool) state.techniqueSpritePool = pool
        const textureCache = state.techniqueTextureCache || new Map()
        if (!state.techniqueTextureCache) state.techniqueTextureCache = textureCache

        const getTechniqueTexture = (type) => {
          if (textureCache.has(type)) return textureCache.get(type)
          const cfg = TECHNIQUE_CONFIG[type]
          if (!cfg || !cfg.svg) return null
          const gfx = new Graphics().svg(cfg.svg)
          const texture = activeApp.renderer.generateTexture(gfx)
          gfx.destroy(true)
          textureCache.set(type, texture)
          return texture
        }

        let poolIdx = 0
        visibleEvents.forEach(evt => {
          if (!evt.isValid) return
          const config = TECHNIQUE_CONFIG[evt.type]
          if (!config) return

          // Find corresponding note to align Y (strict overlap first, then closest distance)
          let note = notesData.find(n => evt.t >= n.t0Sec - 0.2 && evt.t <= n.t1Sec + 0.2)
          if (!note) {
            const threshold = 1.0
            const candidates = notesData.filter(n =>
              evt.t >= n.t0Sec - threshold && evt.t <= n.t1Sec + threshold
            )
            if (candidates.length > 0) {
              candidates.sort((a, b) => {
                const distA = Math.min(Math.abs(evt.t - a.t0Sec), Math.abs(evt.t - a.t1Sec))
                const distB = Math.min(Math.abs(evt.t - b.t0Sec), Math.abs(evt.t - b.t1Sec))
                return distA - distB
              })
              note = candidates[0]
            }
          }
          if (!note) return

          const texture = getTechniqueTexture(evt.type)
          if (!texture) return

          let sprite = pool[poolIdx]
          if (!sprite) {
            sprite = new Sprite(texture)
            sprite.anchor.set(0.5, 1)
            sprite.scale.set(0.65)
            state.techniqueIcons.addChild(sprite)
            pool.push(sprite)
          }

          if (sprite.texture !== texture) {
            sprite.texture = texture
          }
          sprite.tint = config.color

          const midi = note.midi + transposition
          const { y: noteY } = midiToY(midi)
          const y = noteY - TECHNIQUE_ICON_OFFSET_PX
          const x = playheadX + (evt.t - songTimeSec) * pixelsPerSec

          sprite.x = x
          sprite.y = y
          sprite.visible = true

          poolIdx++
        })

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
        glissandoUpCount={validCounts.glissup}
        kobushiCount={validCounts.kobushi}
        glissandoDownCount={validCounts.glissdown}
        vibratoCount={validCounts.vibrato}
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
      fontSize: 18,
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
    glissup: glissandoUpCount,
    kobushi: kobushiCount,
    glissdown: glissandoDownCount,
    vibrato: vibratoCount
  }
  const refs = {
    glissup: shakuriRef,
    kobushi: kobushiRef,
    glissdown: fallRef,
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

const CountBox = forwardRef(({ label, count, borderColor, icon, labelColor }, ref) => {
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
