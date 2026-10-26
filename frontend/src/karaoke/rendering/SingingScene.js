import { Assets, Container, FillGradient, Graphics, Rectangle, Sprite } from 'pixi.js'
import { label, clear } from './singingPrimitives.js'
import { createScoreCube } from './SingingScoreCube.js'
import { createBackground } from './SingingBackground.js'
import logoUrl from '../../assets/logo_title.png'
import useKeyChangeAlertStore from '../../state/keyChangeAlertStore.js'
import { getLyricRows } from '../lyricRows.js'
import { fitLyricFontSize } from '../lyricFit.js'
import { getSingingViewport, SINGING_ASPECT_RATIO } from './singingViewport.js'
import { getSingingLayout } from './singingLayout.js'

const lyricFamily = 'BIZUDPMincho-Bold, Hiragino Mincho ProN, Yu Mincho, serif'
const techniques = [
  ['glissup', 'しゃくり', 0xff13f0],
  ['kobushi', 'こぶし', 0x00fff0],
  ['glissdown', 'フォール', 0xffbf00],
  ['vibrato', 'ビブラート', 0x2cff05],
]
const techniqueIcons = {
  glissup: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18 C5 18 10 18 12 14 C14 10 18 6 18 6 M15 6 L19 6 L19 10"/></svg>',
  kobushi: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="3" fill="white"/><path d="M12 2 C18 2 22 12 12 22 C2 12 6 2 12 2"/></svg>',
  glissdown: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6 C5 6 10 6 12 10 C14 14 18 18 18 18 M15 18 L19 18 L19 14"/></svg>',
  vibrato: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><path d="M2 12 Q5 6 8 12 T14 12 T20 12"/></svg>',
}
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const ease = (n) => n * n * (3 - 2 * n)

// Textures are generated only when the lyric pair, fonts or viewport change.
// Progress moves a GPU mask; it never redraws/rasterizes glyphs.
function buildLyricRow(segments, fontSize) {
  const base = new Container()
  const fill = new Container()
  let x = 0
  const rubySize = fontSize * 0.42
  for (const segment of segments) {
    const parts = []
    for (const [parent, active] of [[base, false], [fill, true]]) {
      const style = {
        fontFamily: lyricFamily, fontWeight: 'bolder', fontSize,
        fill: segment.falsetto ? 0x008b8b : active ? 0xe60000 : 0xffffff,
        stroke: { color: active ? 0xffffff : 0x000000, width: 8, join: 'round' },
        padding: 8,
      }
      const body = label(parent, segment.text, fontSize, style)
      const ruby = segment.ruby ? label(parent, segment.ruby, rubySize, { ...style, fontSize: rubySize }) : null
      parts.push({ body, ruby })
    }
    // Pixi width includes the stroke. CSS inline advance does not.
    const bodyWidth = Math.max(0, parts[0].body.width - 8)
    const rubyWidth = parts[0].ruby ? Math.max(0, parts[0].ruby.width - 8) : 0
    const advance = Math.max(bodyWidth, rubyWidth)
    for (const { body, ruby } of parts) {
      body.position.set(x + (advance - bodyWidth) / 2, rubySize - fontSize * 0.1)
      if (ruby) ruby.position.set(x + (advance - rubyWidth) / 2, 0)
    }
    x += advance
  }
  return { base, fill, width: x, height: fontSize * 1.2 + rubySize }
}

export function createSingingScene(app, melody, stateRef) {
  const background = new Container()
  const stage = new Container()
  const intro = new Container()
  const foreground = new Container()
  app.stage.removeChild(melody)
  const matte = new Graphics()
  const content = new Container()
  const viewportMask = new Graphics()
  app.stage.addChild(matte, content, viewportMask)
  content.addChild(background, stage, intro, foreground)
  content.mask = viewportMask
  stage.addChild(melody)
  app.stage.eventMode = 'none'
  let disposed = false, layout, invalid = true, now = 0
  let surfaceWidth = 1, surfaceHeight = 1, lastDisplayAspect = null
  let lyricKey = '', introKey = '', sectionKey = '', countsKey = '', alertKey = ''
  let alertSignature = '', alertIndicator
  let stageAlpha = 1, lyricAlpha = 1, promptAlpha = 0, alertStart = 0
  let lastIntro = null, fadeFrom = 1, fadeStart = 0
  const backgroundPlayer = createBackground(background)
  const shade = new Graphics()
  stage.addChild(shade)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const trackGradient = new FillGradient({ colorStops: [{ offset: 0, color: '#2d5a3e' }, { offset: 0.5, color: '#4a8c66' }, { offset: 1, color: '#2d5a3e' }] })
  const circleGradient = new FillGradient({ start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, colorStops: [{ offset: 0, color: '#f0f0f0' }, { offset: 1, color: '#cccccc' }] })
  const shadeGradient = new FillGradient({ start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: [{ offset: 0, color: '#00000000' }, { offset: 1, color: '#000000cc' }] })
  const lyricRoot = new Container()
  const prompt = new Container()
  const sections = new Container()
  const counts = new Container()
  const badge = new Container()
  const guideOverlay = new Container()
  guideOverlay.addChild(sections, counts)
  stage.addChild(lyricRoot, prompt, guideOverlay, badge)
  const melodyMask = new Graphics()
  stage.addChild(melodyMask)
  melody.mask = melodyMask
  guideOverlay.mask = melodyMask
  const rows = []
  const introText = new Container()
  const logo = new Sprite()
  intro.addChild(introText, logo)
  const keyAlert = new Container()
  foreground.addChild(keyAlert)
  const cube = createScoreCube(app, foreground)
  const hits = new Map()
  const countBoxes = new Map()
  const promptDots = []
  const badgeGradient = new FillGradient({ colorStops: [{ offset: 0, color: '#fb52d1' }, { offset: 1, color: '#fb36fb' }] })
  badge.addChild(new Graphics().roundRect(0, 0, 120, 34, 8).fill(badgeGradient).stroke({ color: 0xff9bff, width: 2 }))
  const badgeText = label(badge, '🎤 採点中', 16); badgeText.anchor.set(0.5); badgeText.position.set(60, 17)
  const melodyBounds = new Rectangle()
  const readLayout = (width, height) => getSingingLayout(width, height, window.innerWidth, window.innerHeight, parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)

  function rebuildLyrics(s) {
    clear(lyricRoot); clear(prompt); rows.length = 0; promptDots.length = 0
    const { lineRowsTwo } = getLyricRows(s.lrcEntries || [], s.activeLyricIndex ?? -1, s.karaokeProgress ?? 0)
    let measured = lineRowsTwo.map((row) => buildLyricRow(row.segments, layout.lyricFontSize))
    const fontSize = fitLyricFontSize({ baseFontSize: layout.lyricFontSize, safetyPx: 24, rows: measured.map((row, i) => ({ contentWidth: row.width, availableWidth: layout.lyricWidth * (i ? 0.9 : 1) })) })
    if (fontSize !== layout.lyricFontSize) {
      measured.forEach((row) => { row.base.destroy({ children: true }); row.fill.destroy({ children: true }) })
      measured = lineRowsTwo.map((row) => buildLyricRow(row.segments, fontSize))
    }
    const rowHeight = fontSize * 1.2
    // A ruby annotation expands only its own CSS line box (21px at 64px).
    const rubyHeights = lineRowsTwo.map((row) => row.segments.some((segment) => segment.ruby) ? fontSize * 21 / 64 : 0)
    const groupHeight = (rowHeight + 25) * 2 + rubyHeights.reduce((sum, h) => sum + h, 0)
    let rowY = 0
    lyricRoot.position.set(layout.side, layout.lyricCenterY - groupHeight / 2)
    measured.forEach((row, i) => {
      const root = new Container()
      const mask = new Graphics().rect(0, -8, Math.max(1, row.width), row.height + 16).fill(0xffffff)
      const x = i ? layout.lyricWidth * 0.9 - row.width : 0
      root.position.set(x, rowY + rubyHeights[i] - fontSize * 0.42)
      rowY += rowHeight + rubyHeights[i] + 25
      row.base.cacheAsTexture({ resolution: app.renderer.resolution })
      row.fill.cacheAsTexture({ resolution: app.renderer.resolution })
      const clippedFill = new Container()
      clippedFill.addChild(row.fill)
      root.addChild(row.base, clippedFill, mask)
      clippedFill.mask = mask
      lyricRoot.addChild(root)
      rows.push({ ...row, mask })
    })
    const start = label(prompt, '間奏(', layout.lyricFontSize, { fontFamily: lyricFamily, stroke: { color: 0, width: 8 }, padding: 8 })
    let x = start.width - 8
    for (let i = 0; i < 3; i++) {
      const dot = label(prompt, '・', layout.lyricFontSize, { fontFamily: lyricFamily, stroke: { color: 0, width: 8 }, padding: 8 })
      dot.x = x; x += dot.width - 8; promptDots.push(dot)
    }
    const end = label(prompt, ')', layout.lyricFontSize, { fontFamily: lyricFamily, stroke: { color: 0, width: 8 }, padding: 8 }); end.x = x
    prompt.position.set((layout.width - (x + end.width)) / 2, layout.lyricCenterY - 25 - prompt.height / 2)
  }

  function rebuildIntro(s) {
    clear(introText)
    const { title = '', artist = '' } = s.songInfo || {}
    const length = Array.from(title).reduce((n, c) => n + (/^[\x20-\x7e]$/.test(c) ? 0.55 : 1), 0)
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const size = Math.max(3, Math.min(5.5, 25 / Math.sqrt(Math.max(1, length)))) * rem
    const titleLabel = label(introText, title, Math.max(3 * rem, Math.min(window.innerWidth * 0.069, size)), {
      fontWeight: 'bolder', align: 'center', wordWrap: true, breakWords: true, wordWrapWidth: layout.introWidth,
      lineHeight: Math.max(3 * rem, Math.min(window.innerWidth * 0.069, size)) * 1.08,
      stroke: { color: 0, width: 2 }, letterSpacing: clamp(window.innerWidth * 0.0035, 0.02 * size, 0.08 * size),
      dropShadow: { color: 0, alpha: 0.55, distance: 6, angle: Math.PI / 2, blur: 0 }, padding: 8,
    })
    titleLabel.anchor.x = 0.5
    if (artist) {
      const artistLabel = label(introText, `♪${artist}`, clamp(window.innerWidth * 0.044, 2 * rem, 3.5 * rem), { align: 'center', wordWrap: true, breakWords: true, wordWrapWidth: layout.introWidth, stroke: { color: 0, width: 2 }, dropShadow: { color: 0, alpha: 0.55, distance: 6, angle: Math.PI / 2, blur: 0 }, padding: 8 })
      artistLabel.anchor.x = 0.5; artistLabel.y = titleLabel.height + 6
    }
    introText.position.set(layout.width / 2, layout.introTop)
  }

  const fontChange = () => { invalid = true }
  document.fonts?.addEventListener('loadingdone', fontChange)
  document.fonts?.load('bolder 64px BIZUDPMincho-Bold').then(() => { if (!disposed) invalid = true })
  Assets.load(logoUrl).then((texture) => {
    if (disposed) return
    logo.texture = texture
    logo.width = 280; logo.scale.y = logo.scale.x
    invalid = true
  }).catch((error) => console.error('Song logo failed', error))

  return {
    melodyBounds,
    resize(width, height) {
      surfaceWidth = width; surfaceHeight = height
      matte.clear().rect(0, 0, width, height).fill(0x000000)
      width = Math.max(1280, width)
      height = width / SINGING_ASPECT_RATIO
      layout = readLayout(width, height)
      lastDisplayAspect = null
      const m = layout.melody
      melody.position.set(m.x, m.y)
      melody.scale.set(m.width / 800, m.height / 220)
      melodyBounds.copyFrom(new Rectangle(0, 0, 800, 220))
      melodyMask.clear().roundRect(m.x, m.y, m.width, m.height, 10).fill(0xffffff)
      shade.clear().rect(0, layout.topHeight, width, height - layout.topHeight).fill(shadeGradient)
      badge.position.set(width - (window.innerWidth <= 980 ? 14 : 20) - 130, window.innerWidth <= 980 ? 12 : 18)
      logo.position.set(40, height - 40 - logo.height)
      backgroundPlayer.resize(width, height)
      invalid = true
    },
    fitViewport(displayAspect) {
      if (!layout || !Number.isFinite(displayAspect) || displayAspect <= 0 || displayAspect === lastDisplayAspect) return
      lastDisplayAspect = displayAspect
      const view = getSingingViewport(surfaceWidth, surfaceHeight, displayAspect, layout.width)
      content.position.set(view.x, view.y)
      content.scale.set(view.scaleX, view.scaleY)
      viewportMask.clear().rect(view.x, view.y, view.width, view.height).fill(0xffffff)
    },
    techniqueHit(type) { hits.set(type, now) },
    getTechniqueTarget(type) {
      const box = countBoxes.get(type)
      return box ? { x: (counts.x + box.x + box.width / 2 - melody.x) / melody.scale.x, y: (counts.y + 16 - melody.y) / melody.scale.y } : { x: 60, y: 190 }
    },
    update(deltaMS) {
      const s = stateRef.current
      if (!s || !layout) return
      now += deltaMS
      backgroundPlayer.setEnabled(Boolean(s.karaokeBackgroundVideoEnabled))
      if (lastIntro !== s.showSongInfo) {
        lastIntro = s.showSongInfo; fadeFrom = stageAlpha; fadeStart = now
      }
      const fade = ease(clamp((now - fadeStart) / 1000, 0, 1))
      stageAlpha = fadeFrom + ((s.showSongInfo ? 0 : 1) - fadeFrom) * fade
      stage.alpha = stageAlpha; intro.alpha = 1 - stageAlpha
      cube.update(s, now, stageAlpha)
      const lyricRows = getLyricRows(s.lrcEntries || [], s.activeLyricIndex ?? -1, s.karaokeProgress ?? 0).lineRowsTwo
      const nextLyricKey = JSON.stringify(lyricRows.map((row) => row.segments))
      if (invalid || nextLyricKey !== lyricKey) { rebuildLyrics(s); lyricKey = nextLyricKey }
      rows.forEach((row, i) => { row.mask.scale.x = Math.max(0.000001, clamp(lyricRows[i].progress / 100, 0, 1)) })
      const step = deltaMS / 300
      const approach = (current, target) => current + clamp(target - current, -step, step)
      lyricAlpha = approach(lyricAlpha, s.interludeDisplay?.lyricsVisible ? 1 : 0)
      promptAlpha = approach(promptAlpha, s.showInterludePrompt && s.interludeDisplay?.promptVisible ? 1 : 0)
      lyricRoot.alpha = lyricAlpha; prompt.alpha = promptAlpha
      promptDots.forEach((dot, i) => { dot.alpha = reducedMotion.matches || (Math.floor(now / 400) + 3 - i) % 3 === 0 ? 1 : 0.2 })
      const nextIntroKey = JSON.stringify(s.songInfo)
      if (invalid || nextIntroKey !== introKey) { rebuildIntro(s); introKey = nextIntroKey }
      const section = s.duration > 0 ? Math.min(6, Math.floor(s.currentTime / s.duration * 6) + 1) : 1
      if (invalid || sectionKey !== section) {
        clear(sections)
        const text = label(sections, '演奏区間', 18)
        text.position.set(0, 2)
        let x = text.width + 14
        for (let n = 1; n <= 6; n++) {
          sections.addChild(new Graphics().circle(x + 12, 12, 12).fill(n === section ? 0xffdf29 : { color: 0, alpha: 0.6 }).stroke({ color: n === section ? 0xffffff : 0x555555, width: n === section ? 2 : 1 }))
          const num = label(sections, String(n), 14, { fill: n === section ? 0 : 0x888888, fontWeight: '900' })
          num.anchor.set(0.5); num.position.set(x + 12, 12); x += 32
        }
        sections.position.set(layout.melody.x + layout.melody.width - x - 4, layout.melody.y + 8)
        sectionKey = section
      }
      const values = s.techniqueCountsRef?.current || {}
      const nextCountsKey = JSON.stringify(values)
      if (invalid || nextCountsKey !== countsKey) {
        clear(counts); countBoxes.clear()
        let x = 0
        for (const [id, name, color] of techniques) {
          const box = new Container()
          const title = label(box, name, 13)
          title.position.set(10, 8)
          const glyph = new Graphics().svg(techniqueIcons[id])
          glyph.tint = color; glyph.scale.set(15 / 24); glyph.position.set(16 + title.width, 6)
          box.addChild(glyph)
          const value = label(box, String(values[id] || 0), 18, { fontFamily: 'Arial, sans-serif', fontWeight: '900' })
          const width = Math.max(90, 10 + title.width + 6 + 15 + 10 + value.width + 14)
          value.anchor.x = 1; value.position.set(width - 10, 5)
          box.addChildAt(new Graphics().roundRect(0, 0, width, 32, 8).fill({ color: 0x101010, alpha: 0.95 }).stroke({ color, width: 2 }), 0)
          box.x = x; x += width + 12; counts.addChild(box); countBoxes.set(id, box)
        }
        counts.position.set(layout.melody.x + 12, layout.melody.y + layout.melody.height - 40)
        countsKey = nextCountsKey
      }
      for (const [id, box] of countBoxes) {
        const age = now - (hits.get(id) ?? -10000)
        box.alpha = age < 650 ? 0.75 + 0.25 * Math.cos(age / 650 * Math.PI * 4) : 1
      }
      badge.visible = s.isScoring
      badge.scale.set(1 + (1 - Math.cos(now / 1000 * Math.PI)) * 0.025)
      const alert = useKeyChangeAlertStore.getState()
      if (alert.animationId !== alertKey) { alertKey = alert.animationId; alertStart = now }
      if (alert.visible && alert.timeoutMs > 0 && now - alertStart >= alert.timeoutMs) alert.hideKeyChangeAlert()
      keyAlert.visible = alert.visible
      const nextAlertSignature = `${alert.animationId}:${alert.value}`
      if (keyAlert.visible && (invalid || nextAlertSignature !== alertSignature)) {
        alertSignature = nextAlertSignature
        clear(keyAlert)
        const title = label(keyAlert, 'キー', 28, { stroke: { color: 0x2d5a3e, width: 1.2 } }); title.y = 10
        const left = title.width + 10
        keyAlert.addChild(new Graphics().roundRect(left, 0, 390, 54, 27).fill(trackGradient).stroke({ color: 0xf0f0f0, width: 3 }))
        for (const [x, char] of [[left + 33, '♭'], [left + 357, '♯']]) {
          keyAlert.addChild(new Graphics().circle(x, 27, 18.5).fill(circleGradient).stroke({ color: 0x4a8c66, width: 3 }))
          const symbol = label(keyAlert, char, 22, { fill: 0x2d5a3e }); symbol.anchor.set(0.5); symbol.position.set(x, 27)
        }
        for (let i = 0; i < 13; i++) {
          const x = left + 75 + i * 20
          const selected = i === Math.round(alert.value) + 6 && alert.value !== 0
          const dot = new Graphics().circle(x, 27, selected ? 8.5 : 5).fill(selected ? 0xffffff : 0xfdd835)
          if (selected) dot.stroke({ color: 0xfdd835, width: 3 })
          keyAlert.addChild(dot)
          if (i === 6) {
            const origin = label(keyAlert, '原', 14, { fill: 0x2d5a3e }); origin.anchor.set(0.5); origin.position.set(x, 27)
          }
        }
        alertIndicator = new Graphics().poly([-12, -16, 12, -16, 0, 4]).fill(0xd32f2f).stroke({ color: 0xffffff, width: 2 })
        keyAlert.addChild(alertIndicator)
        keyAlert.position.set((layout.width - left - 390) / 2, 16)
      }
      if (keyAlert.visible && alertIndicator) {
        const travel = reducedMotion.matches ? 1 : ease(clamp((now - alertStart) / 520, 0, 1))
        const position = clamp(alert.previousValue, -6, 6) + (clamp(alert.value, -6, 6) - clamp(alert.previousValue, -6, 6)) * travel
        alertIndicator.x = keyAlert.children[0].width + 10 + 75 + (position + 6) * 20
      }
      invalid = false
    },
    destroy() {
      disposed = true
      document.fonts?.removeEventListener('loadingdone', fontChange)
      backgroundPlayer.destroy(); cube.destroy()
      shadeGradient.destroy(); badgeGradient.destroy(); trackGradient.destroy(); circleGradient.destroy()
    },
  }
}
