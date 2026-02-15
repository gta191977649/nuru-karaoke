import { useEffect, useRef } from 'react'

const LCD_SEGMENTS = 8
const SEGMENT_GAP = 1
const BAR_GAP = 4
const CHANNEL_GAP = 8

// Colors matched from CSS
// .sc-lcd__segment--active -> rgba(70, 32, 0, 0.75)
const COLOR_ACTIVE = 'rgba(70, 32, 0, 0.75)'
// .sc-lcd__segment -> rgba(110, 58, 0, 0.18)
const COLOR_INACTIVE = 'rgba(110, 58, 0, 0.18)'

// Text color: .sc-lcd__channel -> rgba(80, 45, 0, 0.8)
const COLOR_TEXT = 'rgba(80, 45, 0, 0.8)'
// Muted text: opacity 0.55 applied to base color
const COLOR_TEXT_MUTED = 'rgba(80, 45, 0, 0.44)' // 0.8 * 0.55

// Active segments when muted? usually just dimmer active color?
// CSS says entire channel has opacity 0.55 if muted.
const COLOR_MUTED_ACTIVE = 'rgba(70, 32, 0, 0.41)' // 0.75 * 0.55
const COLOR_MUTED_INACTIVE = 'rgba(110, 58, 0, 0.1)' // 0.18 * 0.55

// Layout constants - matched to typical 16ch display 
// Assume we want to fit 100% width.
// But fixed aspect ratio bars are better.

function SoundCanvasLcd({ levels, enabledChannels, height = 64, isPlaying = false, hasActivity = false, className, style }) {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)

    // Ref for props to avoid re-binding loop
    const propsRef = useRef({ levels, enabledChannels })
    useEffect(() => {
        propsRef.current = { levels, enabledChannels }
    }, [levels, enabledChannels])

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d', { alpha: true })
        if (!canvas || !ctx) return

        let active = true
        let reqId = 0

        const draw = () => {
            // 1. Resize if needed
            const container = containerRef.current
            if (container) {
                const w = Math.floor(container.clientWidth)
                const h = Math.floor(height) // Use fixed height or responsive?
                // Use device pixel ratio for crisp text
                const dpr = window.devicePixelRatio || 1

                if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
                    canvas.width = w * dpr
                    canvas.height = h * dpr
                    canvas.style.width = w + 'px'
                    canvas.style.height = h + 'px'
                    ctx.scale(dpr, dpr)
                }
            }

            const width = canvas.width / (window.devicePixelRatio || 1)
            const visibleHeight = canvas.height / (window.devicePixelRatio || 1)

            ctx.clearRect(0, 0, width, visibleHeight)

            const { levels, enabledChannels } = propsRef.current
            const numChannels = 16

            // Calculate layout
            // We have 16 channels. Each channel has a label at bottom, and bars above.
            // Width per channel
            const channelGap = 2
            const chWidth = (width - (numChannels - 1) * channelGap) / numChannels
            const barWidth = Math.max(4, chWidth - 2)
            const xStart = 0

            // Vertical layout
            const labelHeight = 12
            const barsAreaHeight = visibleHeight - labelHeight
            const segHeight = (barsAreaHeight - (LCD_SEGMENTS - 1) * SEGMENT_GAP) / LCD_SEGMENTS

            ctx.font = 'bold 10px "VCR OSD Mono", "Courier New", monospace'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'bottom'

            for (let i = 0; i < numChannels; i++) {
                const cx = xStart + i * (chWidth + channelGap) + chWidth / 2
                const x = cx - barWidth / 2

                const level = levels && levels[i] != null ? levels[i] : 0
                const isEnabled = enabledChannels ? enabledChannels[i] !== false : true

                // Color Selection
                const cActive = isEnabled ? COLOR_ACTIVE : COLOR_MUTED_ACTIVE
                const cInactive = isEnabled ? COLOR_INACTIVE : COLOR_MUTED_INACTIVE
                const cText = isEnabled ? COLOR_TEXT : COLOR_TEXT_MUTED

                // 1. Draw Label
                ctx.fillStyle = cText
                ctx.fillText(`${i + 1}`, cx, visibleHeight)

                // 2. Draw Segments
                // level is 0..1. Map to 0..8
                // activeCount = ceil(level * 8)
                const activeCount = Math.max(0, Math.min(LCD_SEGMENTS, Math.ceil(level * LCD_SEGMENTS)))

                for (let s = 0; s < LCD_SEGMENTS; s++) {
                    // s=0 is BOTTOM segment? typically LCDs fill from bottom up.
                    // Let's assume s=0 is bottom.
                    // y position:
                    // bottom segment starts at (visibleHeight - labelHeight - 4 - segHeight)
                    // s-th segment from bottom:
                    const y = (visibleHeight - labelHeight) - (s + 1) * segHeight - s * SEGMENT_GAP

                    ctx.fillStyle = s < activeCount ? cActive : cInactive
                    ctx.fillRect(x, y, barWidth, segHeight)
                }
            }

            if (active && isPlaying && hasActivity) reqId = requestAnimationFrame(draw)
        }

        draw()
        return () => {
            active = false
            cancelAnimationFrame(reqId)
        }
    }, [height, isPlaying, hasActivity])

    return (
        <div ref={containerRef} className={className} style={{ ...style, width: '100%', height }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
        </div>
    )
}

export default SoundCanvasLcd
