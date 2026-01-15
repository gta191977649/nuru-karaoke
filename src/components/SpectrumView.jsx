import React, { useRef, useEffect, useState, useMemo } from 'react'


// --- Simple Optimized FFT Implementation for Visualization ---

// Cache for FFT tables
const FFT_CACHE = {}

function getFFTData(size) {
    if (FFT_CACHE[size]) return FFT_CACHE[size]

    const m = Math.log2(size)
    if (Math.floor(m) !== m) throw new Error("FFT size must be power of 2")

    // Precompute bit reversal table
    const bitRev = new Int32Array(size)
    for (let i = 0; i < size; i++) {
        let rev = 0
        let n = i
        for (let j = 0; j < m; j++) {
            rev = (rev << 1) | (n & 1)
            n >>= 1
        }
        bitRev[i] = rev
    }

    // Precompute twiddle factors (sin/cos tables)
    // We only need size/2 complex roots
    const cosTable = new Float32Array(size / 2)
    const sinTable = new Float32Array(size / 2)
    for (let i = 0; i < size / 2; i++) {
        const angle = -2 * Math.PI * i / size
        cosTable[i] = Math.cos(angle)
        sinTable[i] = Math.sin(angle)
    }

    const data = { bitRev, cosTable, sinTable, size }
    FFT_CACHE[size] = data
    return data
}

function performFFT(inputData, outputMag) {
    const size = inputData.length
    // Ensure power of 2
    if ((size & (size - 1)) !== 0) return // or pad? assuming handled by caller

    const { bitRev, cosTable, sinTable } = getFFTData(size)

    // Real/Imag buffers
    // We can reuse a static buffer if we are careful about concurrency, 
    // but simpler to allocate or use a pool. 
    // For visualization, allocating two Float32Arrays of size ~1024 is cheap enough per frame.
    const real = new Float32Array(size)
    const imag = new Float32Array(size)

    // Bit reversal permutation
    for (let i = 0; i < size; i++) {
        real[i] = inputData[bitRev[i]]
        imag[i] = 0
    }

    // Butterfly operations
    for (let k = 1; k < size; k <<= 1) { // k is half stage size
        const step = size / (k * 2) // stride in tables
        for (let i = 0; i < size; i += (k * 2)) {
            for (let j = 0; j < k; j++) {
                // Twiddle factor
                // const angle = -Math.PI * j / k; 
                // Index into table: j * (size / (2*k))  == j * step ?
                // The table is for N=size. 
                // W_N^k = exp(-2pi * j / N * coeff) ?
                // Actually standard Cooley-Tukey:
                // W = exp(-j * PI / k * i)
                // My table is size/2. 
                // index = j * (size / (2*k))
                const idx = j * step
                const c = cosTable[idx]
                const s = sinTable[idx]

                const tr = c * real[i + j + k] - s * imag[i + j + k]
                const ti = c * imag[i + j + k] + s * real[i + j + k]

                real[i + j + k] = real[i + j] - tr
                imag[i + j + k] = imag[i + j] - ti
                real[i + j] = real[i + j] + tr
                imag[i + j] = imag[i + j] + ti
            }
        }
    }

    // Compute magnitude
    // We only need first N/2 + 1 bins
    const half = size / 2
    for (let i = 0; i <= half; i++) {
        const r = real[i]
        const im = imag[i]
        outputMag[i] = 20 * Math.log10(Math.sqrt(r * r + im * im) + 1e-6) // dB
    }
}

// ----------------------------------------

export default function SpectrumView({
    data,
    height = 80,
    color = '#4ec3ff',
    background = '#0f1115'
}) {
    const containerRef = useRef(null)
    const canvasRef = useRef(null)
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

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas || !data || !size.width) return

        const procSize = 1024
        if (data.length === 0) return

        const input = new Float32Array(procSize)
        // Take latest samples
        const offset = Math.max(0, data.length - procSize)
        const len = Math.min(data.length, procSize)

        // Apply Hann window
        if (len > 1) {
            for (let i = 0; i < len; i++) {
                const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (len - 1)))
                input[i] = data[offset + i] * w
            }
        } else if (len === 1) {
            input[0] = data[offset]
        }

        const mag = new Float32Array(procSize / 2 + 1)
        try {
            performFFT(input, mag)
        } catch (e) {
            console.error(e)
            return
        }

        const ctx = canvas.getContext('2d')
        const w = size.width
        const h = size.height

        canvas.width = w
        canvas.height = h

        ctx.fillStyle = background
        ctx.fillRect(0, 0, w, h)

        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.beginPath()

        const count = mag.length

        // Find peak for auto-scaling visualization
        let peak = -100
        for (let i = 0; i < count; i++) {
            if (mag[i] > peak) peak = mag[i]
        }

        // Typically audio FFT peak is around 40-60dB for normalized signal
        // We want a fixed or dynamic range.
        // Let's use a fixed floor relative to peak for dynamic visualization
        // or just fixed absolute scaling.
        // Fixed absolute: Max ~60dB. Min ~-40dB.
        const maxDb = 60
        const minDb = -40
        const range = maxDb - minDb

        let move = true
        for (let i = 0; i < count; i++) {
            const x = (i / count) * w
            const val = mag[i]

            // Map val to y
            // We assume val is roughly -infinity to +60
            // We map [minDb, maxDb] to [h, 0]

            let norm = (val - minDb) / range
            norm = Math.max(0, Math.min(1, norm))

            const y = h - (norm * h)

            if (move) {
                ctx.moveTo(x, y)
                move = false
            } else {
                ctx.lineTo(x, y)
            }
        }
        ctx.stroke()

    }, [data, size, color, background])

    return (
        <div ref={containerRef} style={{ width: '100%', height, background, overflow: 'hidden' }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
        </div>
    )
}
