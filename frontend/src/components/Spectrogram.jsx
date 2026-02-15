import { useEffect, useRef } from 'react'

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
const F0_COLOR = '#8bd17c'

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
    colors[i] = `rgb(${r},${g},${bl})`
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
  f0Color = '#ffffff',
  rawF0Hz,
  rawF0Color = '#00ffff',
  userMidi,
  userMidiColor = '#00ffff',
  height = 140,
  minHz = DEFAULT_MIN_HZ,
  maxHz = DEFAULT_MAX_HZ,
  className,
  style,
}) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)

  const analyserRef = useRef(analyser)
  const f0Ref = useRef(f0Hz)
  const f0ColorRef = useRef(f0Color)
  const rawF0Ref = useRef(rawF0Hz)
  const rawF0ColorRef = useRef(rawF0Color)
  const userMidiRef = useRef(userMidi)
  const userMidiColorRef = useRef(userMidiColor)
  const reqRef = useRef(0)

  // State for rendering
  const renderState = useRef({
    width: 0,
    height: 0,
    data: null,
    melMap: null,
  })

  // Props refs for access in animation loop
  const propsRef = useRef({ minHz, maxHz, height })
  useEffect(() => {
    propsRef.current = { minHz, maxHz, height }
  }, [minHz, maxHz, height])

  useEffect(() => {
    analyserRef.current = analyser
  }, [analyser])

  useEffect(() => {
    f0Ref.current = f0Hz
  }, [f0Hz])

  useEffect(() => {
    f0ColorRef.current = f0Color
  }, [f0Color])

  useEffect(() => {
    rawF0Ref.current = rawF0Hz
  }, [rawF0Hz])

  useEffect(() => {
    rawF0ColorRef.current = rawF0Color
  }, [rawF0Color])

  useEffect(() => {
    userMidiRef.current = userMidi
  }, [userMidi])

  useEffect(() => {
    userMidiColorRef.current = userMidiColor
  }, [userMidiColor])

  const midiToHz = (midi) => 440 * (2 ** ((midi - 69) / 12))

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { willReadFrequently: false, alpha: false })
    if (!canvas || !ctx) return

    let active = true

    const draw = () => {
      if (!active) return
      reqRef.current = requestAnimationFrame(draw)

      // 1. Resize handling
      const container = containerRef.current
      if (!container) return

      const clientWidth = Math.max(1, Math.floor(container.clientWidth))
      const clientHeight = Math.max(1, Math.floor(propsRef.current.height))

      if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
        // Save existing content? 
        // When resizing, we usually lose history or have to stretch it.
        // For simplicity, we just clear/reset on resize for now to avoid complexity of scaling history.
        // A better approach is to draw existing canvas to temp, resize, draw back.
        // 

        const temp = document.createElement('canvas')
        temp.width = canvas.width
        temp.height = canvas.height
        temp.getContext('2d').drawImage(canvas, 0, 0)

        canvas.width = clientWidth
        canvas.height = clientHeight

        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, clientWidth, clientHeight)

        // Restore?
        ctx.drawImage(temp, 0, 0, clientWidth, clientHeight) // Stretch or clip?
      }

      const w = canvas.width
      const h = canvas.height
      const analyser = analyserRef.current

      // Shift canvas left by 1 pixel
      // We use drawImage(canvas, ...)
      // Note: we can't draw canvas onto itself directly if regions overlap?
      // Actually standard says source is copied before draw. Browsers handle this.
      // But typically it's safer to have an offscreen buffer or drawImage with shift.
      // Optimization: Using a composite operation or just standard drawImage.
      ctx.globalCompositeOperation = 'copy'
      ctx.drawImage(canvas, -1, 0)
      ctx.globalCompositeOperation = 'source-over'

      // Draw new column at x = w - 1
      if (!analyser) return

      const binCount = analyser.frequencyBinCount || 1
      const state = renderState.current
      if (!state.data || state.data.length !== binCount) {
        state.data = new Uint8Array(binCount)
      }
      analyser.getByteFrequencyData(state.data)

      const { minHz, maxHz } = propsRef.current
      const clampedMinHz = clampHz(minHz, DEFAULT_MIN_HZ)
      const clampedMaxHz = clampHz(maxHz, DEFAULT_MAX_HZ)
      const effectiveMinHz = Math.min(clampedMinHz, clampedMaxHz)
      const effectiveMaxHz = Math.max(clampedMinHz, clampedMaxHz)

      const nyquist = analyser.context.sampleRate / 2
      const rowCount = h
      const melMin = hzToMel(effectiveMinHz)
      const melMax = hzToMel(effectiveMaxHz)
      const melSpan = Math.max(1e-6, melMax - melMin)

      const mapKey = `${h}-${binCount}-${nyquist}-${effectiveMinHz}-${effectiveMaxHz}`
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

      const bins = state.melMap.bins
      // Draw pixels for the column
      // To optimize, we can create an ImageData 1xH or just fillRects 1x1
      // standard fillRect 1x1 for H times is 140 calls, totally fine.
      const x = w - 1
      for (let y = 0; y < h; y += 1) {
        // bin index from bottom up?
        // map logic: t=0 is bottom (minHz)? 
        // i=0 corresponds to t=0 => melMin.
        // Usually spectrograms have low freq at bottom.
        // So y=height-1-i

        const i = y // 0 to h-1
        const bin = bins[i]
        const val = state.data[bin]

        ctx.fillStyle = COLOR_MAP[val]
        ctx.fillRect(x, h - 1 - y, 1, 1)
      }

      // Draw F0
      const f0 = f0Ref.current
      if (Number.isFinite(f0) && f0 > 0 && f0 >= effectiveMinHz && f0 <= effectiveMaxHz) {
        const mel = hzToMel(f0)
        const norm = (mel - melMin) / melSpan
        // norm 0..1
        // y = h - 1 - norm * (h - 1)
        const y = h - 1 - (norm * (h - 1))
        ctx.fillStyle = f0ColorRef.current
        ctx.fillRect(x, y - 1, 1, 3)
      }

      // Draw RAW F0 (cyan)
      const rawF0 = rawF0Ref.current
      if (Number.isFinite(rawF0) && rawF0 > 0 && rawF0 >= effectiveMinHz && rawF0 <= effectiveMaxHz) {
        const mel = hzToMel(rawF0)
        const norm = (mel - melMin) / melSpan
        const y = h - 1 - (norm * (h - 1))
        ctx.fillStyle = rawF0ColorRef.current
        ctx.fillRect(x, y - 1, 1, 3)
      }

      // Draw User MIDI (cyan)
      const userMidiValue = userMidiRef.current
      if (Number.isFinite(userMidiValue)) {
        const userHz = midiToHz(userMidiValue)
        if (userHz > 0 && userHz >= effectiveMinHz && userHz <= effectiveMaxHz) {
          const mel = hzToMel(userHz)
          const norm = (mel - melMin) / melSpan
          const y = h - 1 - (norm * (h - 1))
          ctx.fillStyle = userMidiColorRef.current
          ctx.fillRect(x, y - 1, 1, 3)
        }
      }
    }

    reqRef.current = requestAnimationFrame(draw)
    return () => {
      active = false
      cancelAnimationFrame(reqRef.current)
    }
  }, []) // Empty deps, use refs

  const mergedStyle = {
    width: '100%',
    height,
    position: 'relative',
    background: '#000',
    ...style,
  }

  return (
    <div ref={containerRef} className={className} style={mergedStyle}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  )
}

export default Spectrogram
