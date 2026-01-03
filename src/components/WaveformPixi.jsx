import { useCallback, useEffect, useRef } from 'react'
import { Application, Graphics } from 'pixi.js'

const parseHexColor = (value, fallback) => {
  if (typeof value !== 'string') return fallback
  let hex = value.trim()
  if (hex.startsWith('#')) hex = hex.slice(1)
  if (hex.startsWith('0x') || hex.startsWith('0X')) hex = hex.slice(2)
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('')
  if (hex.length !== 6) return fallback
  const parsed = Number.parseInt(hex, 16)
  return Number.isNaN(parsed) ? fallback : parsed
}

function WaveformPixi({ data, height = 80, color = '#4ec3ff', background = '#0f1115' }) {
  const containerRef = useRef(null)
  const propsRef = useRef({ data, height, color, background })
  const pixiRef = useRef({
    app: null,
    gfx: null,
    lastSize: { w: 0, h: 0 },
  })

  const drawWaveform = useCallback(() => {
    const root = containerRef.current
    const state = pixiRef.current
    const { data: nextData, height: nextHeight, color: nextColor, background: nextBackground } =
      propsRef.current
    if (!root || !state.app || !state.gfx) return

    const w = Math.max(1, Math.floor(root.clientWidth || 1))
    const h = Math.max(1, Math.floor(root.clientHeight || nextHeight))
    if (state.lastSize.w !== w || state.lastSize.h !== h) {
      state.lastSize = { w, h }
      state.app.renderer.resize(w, h)
    }

    const bgColor = parseHexColor(nextBackground, 0x0f1115)
    const lineColor = parseHexColor(nextColor, 0x4ec3ff)

    state.gfx.clear()
    state.gfx.setFillStyle({ color: bgColor, alpha: 1 })
    state.gfx.beginPath()
    state.gfx.rect(0, 0, w, h)
    state.gfx.fill()

    if (nextData && nextData.length) {
      state.gfx.setStrokeStyle({ width: 1.5, color: lineColor, alpha: 1 })
      state.gfx.beginPath()
      const mid = h / 2
      const max = h / 2
      const len = nextData.length
      const denom = Math.max(1, len - 1)
      for (let i = 0; i < len; i += 1) {
        const x = (i / denom) * w
        const y = mid - Math.max(-1, Math.min(1, nextData[i])) * max
        if (i === 0) state.gfx.moveTo(x, y)
        else state.gfx.lineTo(x, y)
      }
      state.gfx.stroke()
    }

    state.app.renderer.render(state.app.stage)
  }, [])

  useEffect(() => {
    let active = true
    const init = async () => {
      const root = containerRef.current
      if (!root) return
      const app = new Application()
      const initHeight = Math.max(1, Math.floor(root.clientHeight || propsRef.current.height || 1))
      await app.init({
        width: Math.max(1, Math.floor(root.clientWidth || 1)),
        height: initHeight,
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

      const gfx = new Graphics()
      app.stage.addChild(gfx)

      pixiRef.current = {
        app,
        gfx,
        lastSize: { w: 0, h: 0 },
      }

      drawWaveform()
    }

    init()
    return () => {
      active = false
      const app = pixiRef.current.app
      if (app) app.destroy(true, true)
      if (containerRef.current) containerRef.current.innerHTML = ''
      pixiRef.current = {
        app: null,
        gfx: null,
        lastSize: { w: 0, h: 0 },
      }
    }
  }, [drawWaveform])

  useEffect(() => {
    propsRef.current = { data, height, color, background }
    drawWaveform()
  }, [data, height, color, background, drawWaveform])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}

function buildSpectrogramColors(steps) {
  const stops = [
    { t: 0.0, c: [10, 12, 26] },
    { t: 0.25, c: [16, 72, 156] },
    { t: 0.55, c: [34, 182, 146] },
    { t: 0.78, c: [230, 200, 64] },
    { t: 1.0, c: [255, 82, 58] },
  ]
  const total = Math.max(1, steps)
  const colors = new Array(total)
  for (let i = 0; i < total; i += 1) {
    const t = i / Math.max(1, total - 1)
    let a = stops[0]
    let b = stops[stops.length - 1]
    for (let j = 0; j < stops.length - 1; j += 1) {
      if (t >= stops[j].t && t <= stops[j + 1].t) {
        a = stops[j]
        b = stops[j + 1]
        break
      }
    }
    const span = b.t - a.t || 1
    const local = (t - a.t) / span
    const r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * local)
    const g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * local)
    const bl = Math.round(a.c[2] + (b.c[2] - a.c[2]) * local)
    colors[i] = `rgb(${r}, ${g}, ${bl})`
  }
  return colors
}

function MelSpectrogramCanvas({
  analyser,
  f0Hz,
  height = 140,
  minHz = DEFAULT_CONFIG.f0MinHz,
  maxHz = DEFAULT_CONFIG.f0MaxHz,
}) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const spectroRef = useRef(null)
  const f0Ref = useRef(f0Hz)

  useEffect(() => {
    f0Ref.current = f0Hz
  }, [f0Hz])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !analyser) return undefined

    if (!spectroRef.current) {
      const spectro = Spectrogram(canvas, {
        canvas: {
          width: () => canvas.clientWidth || 1,
          height: () => canvas.clientHeight || height,
        },
        audio: { enable: false },
        colors: buildSpectrogramColors,
      })
      spectro._draw = function drawLeftToRight(array, canvasContext) {
        if (this._paused) return false
        if (!canvasContext?._tempContext) return false

        const targetCanvas = canvasContext.canvas
        const width = targetCanvas.width
        const drawHeight = targetCanvas.height
        const tempCanvasContext = canvasContext._tempContext
        const tempCanvas = tempCanvasContext.canvas

        tempCanvasContext.drawImage(targetCanvas, 0, 0, width, drawHeight)

        for (let i = 0; i < array.length; i += 1) {
          const value = array[i]
          canvasContext.fillStyle = this._getColor(value)
          if (this._audioEnded) {
            canvasContext.fillStyle = this._getColor(0)
          }
          canvasContext.fillRect(0, drawHeight - i, 1, 1)
        }

        canvasContext.translate(1, 0)
        canvasContext.drawImage(tempCanvas, 0, 0, width, drawHeight, 0, 0, width, drawHeight)
        canvasContext.drawImage(tempCanvas, 0, 0, width, drawHeight, 0, 0, width, drawHeight)
        canvasContext.setTransform(1, 0, 0, 1, 0, 0)

        this._baseCanvasContext.drawImage(targetCanvas, 0, 0, width, drawHeight)
        return true
      }
      spectroRef.current = spectro
    }

    spectroRef.current.connectSource(analyser, analyser.context)
    spectroRef.current.start()

    return () => {
      try {
        spectroRef.current?.clear?.()
      } catch (err) {
        console.warn('[Spectrogram] clear failed', err)
      }
      spectroRef.current = null
    }
  }, [analyser])

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || !analyser) return undefined

    let raf = 0
    const ctx = overlay.getContext('2d')
    if (!ctx) return undefined

    const draw = () => {
      raf = window.requestAnimationFrame(draw)

      const width = overlay.clientWidth || 1
      const drawHeight = overlay.clientHeight || height
      const dpr = window.devicePixelRatio || 1
      if (overlay.width !== Math.floor(width * dpr) || overlay.height !== Math.floor(drawHeight * dpr)) {
        overlay.width = Math.floor(width * dpr)
        overlay.height = Math.floor(drawHeight * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, width, drawHeight)
      }

      ctx.drawImage(overlay, 1, 0)
      ctx.clearRect(0, 0, 1, drawHeight)

      const f0 = f0Ref.current
      if (!Number.isFinite(f0) || f0 <= 0) return
      if (f0 < minHz || f0 > maxHz) return

      const nyquist = analyser.context.sampleRate / 2
      const binCount = analyser.frequencyBinCount || 1
      const clamped = Math.max(0, Math.min(nyquist, f0))
      const bin = Math.round((clamped / nyquist) * (binCount - 1))
      const y = drawHeight - 1 - Math.round((bin / Math.max(1, binCount - 1)) * (drawHeight - 1))
      ctx.fillStyle = '#ff4d4d'
      ctx.fillRect(0, Math.max(0, y - 1), 1, 3)
    }

    draw()
    return () => window.cancelAnimationFrame(raf)
  }, [analyser, height, minHz, maxHz])

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <canvas ref={canvasRef} style={{ width: '100%', height, display: 'block' }} />
      <canvas
        ref={overlayRef}
        style={{ width: '100%', height, position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}
export default WaveformPixi
