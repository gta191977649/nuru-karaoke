import { useRef, useEffect, useState, useMemo } from 'react'

const parseHexColor = (value, fallback) => {
  if (typeof value !== 'string') return fallback
  let hex = value.trim()
  if (hex.startsWith('#')) hex = hex.slice(1)
  if (hex.startsWith('0x') || hex.startsWith('0X')) hex = hex.slice(2)
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('')
  if (hex.length !== 6) return fallback
  return `#${hex}`
}

function WaveformPixi({ data, height = 80, color = '#4ec3ff', background = '#0f1115' }) {
  const containerRef = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height: h } = entry.contentRect
        setSize({ width, height: h || height })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [height])

  const points = useMemo(() => {
    if (!data || !data.length || !size.width) return ''
    const { width, height } = size
    const mid = height / 2
    const max = height / 2
    const len = data.length
    const denom = Math.max(1, len - 1)

    // Decimate if too much data for pixels?
    // For SVG polyline, limiting points is good for performance.
    // If data.length > width, we should downsample.
    // Simple stride
    const step = Math.max(1, Math.floor(len / width))

    let str = ''
    for (let i = 0; i < len; i += step) {
      const x = (i / denom) * width
      // data is -1 to 1?
      const val = Math.max(-1, Math.min(1, data[i]))
      const y = mid - val * max
      str += `${x.toFixed(1)},${y.toFixed(1)} `
    }
    return str
  }, [data, size])

  const bgColor = parseHexColor(background, '#0f1115')
  const strokeColor = parseHexColor(color, '#4ec3ff')

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height,
        background: bgColor,
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {size.width > 0 && (
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${size.width} ${size.height}`}
          style={{ display: 'block' }}
          preserveAspectRatio="none"
        >
          <polyline
            points={points}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  )
}

export default WaveformPixi
