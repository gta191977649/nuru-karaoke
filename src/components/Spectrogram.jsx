import { useEffect, useRef } from 'react'
import { Application, Container, Graphics, RenderTexture, Sprite } from 'pixi.js'

const VOCAL_MIN_HZ = 60
const VOCAL_MAX_HZ = 1000
const DEFAULT_MIN_HZ = VOCAL_MIN_HZ
const DEFAULT_MAX_HZ = VOCAL_MAX_HZ
const COLOR_STOPS = [
  { t: 0.0, c: [0, 0, 4] },
  { t: 0.13, c: [27, 12, 65] },
  { t: 0.25, c: [74, 12, 107] },
  { t: 0.38, c: [120, 28, 109] },
  { t: 0.5, c: [165, 44, 96] },
  { t: 0.63, c: [207, 68, 70] },
  { t: 0.75, c: [237, 105, 37] },
  { t: 0.88, c: [251, 155, 6] },
  { t: 1.0, c: [252, 255, 164] },
]
const F0_COLOR = 0xff4d4d

const buildColorMap = (steps) => {
  const total = Math.max(1, steps)
  const colors = new Array(total)
  for (let i = 0; i < total; i += 1) {
    const t = i / Math.max(1, total - 1)
    let a = COLOR_STOPS[0]
    let b = COLOR_STOPS[COLOR_STOPS.length - 1]
    for (let j = 0; j < COLOR_STOPS.length - 1; j += 1) {
      if (t >= COLOR_STOPS[j].t && t <= COLOR_STOPS[j + 1].t) {
        a = COLOR_STOPS[j]
        b = COLOR_STOPS[j + 1]
        break
      }
    }
    const span = b.t - a.t || 1
    const local = (t - a.t) / span
    const r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * local)
    const g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * local)
    const bl = Math.round(a.c[2] + (b.c[2] - a.c[2]) * local)
    colors[i] = (r << 16) | (g << 8) | bl
  }
  return colors
}

const COLOR_MAP = buildColorMap(256)

const hzToMel = (hz) => 2595 * Math.log10(1 + hz / 700)
const melToHz = (mel) => 700 * (10 ** (mel / 2595) - 1)
const clampHz = (value, fallback) => {
  const num = Number.isFinite(value) ? value : fallback
  return Math.max(VOCAL_MIN_HZ, Math.min(VOCAL_MAX_HZ, num))
}

function Spectrogram({
  analyser,
  f0Hz,
  height = 140,
  minHz = DEFAULT_MIN_HZ,
  maxHz = DEFAULT_MAX_HZ,
  className,
  style,
}) {
  const clampedMinHz = clampHz(minHz, DEFAULT_MIN_HZ)
  const clampedMaxHz = clampHz(maxHz, DEFAULT_MAX_HZ)
  const effectiveMinHz = Math.min(clampedMinHz, clampedMaxHz)
  const effectiveMaxHz = Math.max(clampedMinHz, clampedMaxHz)
  const containerRef = useRef(null)
  const analyserRef = useRef(analyser)
  const f0Ref = useRef(f0Hz)
  const tickRef = useRef(null)
  const pixiRef = useRef({
    app: null,
    bg: null,
    frameContainer: null,
    scrollSprite: null,
    columnGfx: null,
    outputSprite: null,
    currentTexture: null,
    nextTexture: null,
    scrollSpeed: 1,
    lastSize: { w: 0, h: 0 },
    data: null,
    melMap: null,
  })

  useEffect(() => {
    analyserRef.current = analyser
  }, [analyser])

  useEffect(() => {
    f0Ref.current = f0Hz
  }, [f0Hz])

  useEffect(() => {
    let active = true
    const init = async () => {
      const root = containerRef.current
      if (!root) return
      const app = new Application()
      await app.init({
        width: Math.max(1, Math.floor(root.clientWidth || 1)),
        height: Math.max(1, Math.floor(height)),
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
      const frameContainer = new Container()
      const scrollSprite = new Sprite()
      const columnGfx = new Graphics()
      frameContainer.addChild(scrollSprite, columnGfx)

      const outputSprite = new Sprite()
      app.stage.addChild(bg, outputSprite)

      pixiRef.current = {
        app,
        bg,
        frameContainer,
        scrollSprite,
        columnGfx,
        outputSprite,
        currentTexture: null,
        nextTexture: null,
        scrollSpeed: 1,
        lastSize: { w: 0, h: 0 },
        data: null,
      }

      const tick = () => {
        if (!active) return
        const state = pixiRef.current
        const { app: activeApp } = state
        const rootEl = containerRef.current
        if (!activeApp || !rootEl) return

        const w = Math.max(1, Math.floor(rootEl.clientWidth || activeApp.screen.width))
        const h = Math.max(1, Math.floor(height))
        if (state.lastSize.w !== w || state.lastSize.h !== h) {
          state.lastSize = { w, h }
          activeApp.renderer.resize(w, h)
          state.bg.clear()
          state.bg.setFillStyle({ color: 0x000000, alpha: 1 })
          state.bg.beginPath()
          state.bg.rect(0, 0, w, h)
          state.bg.fill()

          if (state.currentTexture) state.currentTexture.destroy(true)
          if (state.nextTexture) state.nextTexture.destroy(true)
          state.currentTexture = RenderTexture.create({
            width: w,
            height: h,
            resolution: activeApp.renderer.resolution,
          })
          state.nextTexture = RenderTexture.create({
            width: w,
            height: h,
            resolution: activeApp.renderer.resolution,
          })
          state.scrollSpeed = 1
          if (state.outputSprite) {
            state.outputSprite.texture = state.currentTexture
            state.outputSprite.width = w
            state.outputSprite.height = h
          }
          if (state.scrollSprite) {
            state.scrollSprite.texture = state.currentTexture
            state.scrollSprite.x = 0
            state.scrollSprite.y = 0
            state.scrollSprite.width = w
            state.scrollSprite.height = h
          }
          activeApp.renderer.render({ container: state.bg, target: state.currentTexture, clear: true })
          activeApp.renderer.render({ container: state.bg, target: state.nextTexture, clear: true })
        }

        const activeAnalyser = analyserRef.current
        if (
          !activeAnalyser ||
          !state.currentTexture ||
          !state.nextTexture ||
          !state.frameContainer ||
          !state.scrollSprite ||
          !state.columnGfx ||
          !state.outputSprite
        )
          return

        const binCount = activeAnalyser.frequencyBinCount || 1
        if (!state.data || state.data.length !== binCount) {
          state.data = new Uint8Array(binCount)
        }
        activeAnalyser.getByteFrequencyData(state.data)

        const nyquist = activeAnalyser.context.sampleRate / 2
        const rowCount = Math.max(1, Math.floor(h))
        const rowH = Math.max(1, h / rowCount)
        const melMin = hzToMel(effectiveMinHz)
        const melMax = hzToMel(effectiveMaxHz)
        const melSpan = Math.max(1e-6, melMax - melMin)
        const mapKey = `${rowCount}-${binCount}-${nyquist}-${effectiveMinHz}-${effectiveMaxHz}`
        if (state.melMap?.key !== mapKey) {
          const bins = new Array(rowCount)
          for (let i = 0; i < rowCount; i += 1) {
            const t = rowCount > 1 ? i / (rowCount - 1) : 0
            const mel = melMin + t * melSpan
            const hz = melToHz(mel)
            const clamped = Math.max(0, Math.min(nyquist, hz))
            const bin = Math.round((clamped / nyquist) * (binCount - 1))
            bins[i] = Math.max(0, Math.min(binCount - 1, bin))
          }
          state.melMap = { key: mapKey, bins }
        }

        const column = state.columnGfx
        const columnWidth = Math.max(1, state.scrollSpeed)
        const columnX = w - columnWidth
        column.clear()
        const bins = state.melMap?.bins || []
        for (let i = 0; i < bins.length; i += 1) {
          const bin = bins[i]
          const value = state.data[bin] || 0
          const color = COLOR_MAP[value]
          const y = h - (i + 1) * rowH
          column.rect(columnX, y, columnWidth + 0.5, rowH + 0.5).fill({ color })
        }

        const f0 = f0Ref.current
        if (
          Number.isFinite(f0) &&
          f0 > 0 &&
          f0 >= effectiveMinHz &&
          f0 <= effectiveMaxHz
        ) {
          const mel = hzToMel(f0)
          const norm = (mel - melMin) / melSpan
          const y = h - (Math.max(0, Math.min(1, norm)) * (h - rowH) + rowH)
          column.rect(columnX, y - 1, columnWidth + 0.5, 3).fill({ color: F0_COLOR })
        }

        state.scrollSprite.texture = state.currentTexture
        state.scrollSprite.x = -state.scrollSpeed
        state.scrollSprite.y = 0
        activeApp.renderer.render({
          container: state.frameContainer,
          target: state.nextTexture,
          clear: true,
        })
        const prev = state.currentTexture
        state.currentTexture = state.nextTexture
        state.nextTexture = prev
        state.outputSprite.texture = state.currentTexture
        state.scrollSprite.texture = state.currentTexture
      }

      tickRef.current = tick
      app.ticker.add(tick)
    }

    init()
    return () => {
      active = false
      const app = pixiRef.current.app
      const currentTexture = pixiRef.current.currentTexture
      const nextTexture = pixiRef.current.nextTexture
      const tick = tickRef.current
      if (app && tick) app.ticker.remove(tick)
      if (app) app.ticker.stop()
      if (currentTexture) currentTexture.destroy(true)
      if (nextTexture) nextTexture.destroy(true)
      if (app) app.destroy(true, true)
      if (containerRef.current) containerRef.current.innerHTML = ''
      tickRef.current = null
      pixiRef.current = {
        app: null,
        bg: null,
        frameContainer: null,
        scrollSprite: null,
        columnGfx: null,
        outputSprite: null,
        currentTexture: null,
        nextTexture: null,
        scrollSpeed: 1,
        lastSize: { w: 0, h: 0 },
        data: null,
        melMap: null,
      }
    }
  }, [height, effectiveMinHz, effectiveMaxHz])

  const mergedStyle = {
    width: '100%',
    height,
    position: 'relative',
    ...style,
  }

  return <div ref={containerRef} className={className} style={mergedStyle} />
}

export default Spectrogram
