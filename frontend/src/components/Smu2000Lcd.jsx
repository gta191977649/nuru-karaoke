import { useEffect, useRef } from 'react'

// DDRAM layout and segment-bit assignments follow S-MU2000 ui/panel.cpp (BSD-3-Clause).
function drawSmuLcd(canvas, frame) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#9bca3c'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (!frame?.dots) return
  const dots = frame.dots
  const ink = `rgba(26,47,12,${Math.max(0.45, 1 - 0.08 * ((frame.contrast || 2) - 2))})`
  const color = on => on && frame.on ? ink : 'rgba(45,70,15,0.08)'
  const cell = (row, col, x, y, scale = 4) => {
    for (let py = 0; py < 8; py++) for (let px = 0; px < 5; px++) {
      ctx.fillStyle = color(dots[(row * 24 + col) * 8 + py] & (1 << (4 - px)))
      ctx.fillRect(x + px * scale, y + py * scale, scale - 0.5, scale - 0.5)
    }
  }
  const ctl = (col, row) => !!(dots[(Math.floor(row / 8) * 24 + 23) * 8 + row % 8] & (1 << (3 - col)))
  // Main face: 18 meter columns and eight characters, two adjacent rows.
  for (let row = 0; row < 2; row++) for (let col = 0; col < 17; col++) cell(row, col, 16 + col * 24, 12 + row * 32)
  ctx.font = '9px monospace'; ctx.fillStyle = ink
  for (let ch = 0; ch < 16; ch++) ctx.fillText(String(ch + 1), 16 + ch * 12, 88)
  for (let i = 0; i < 2; i++) cell(0, 17 + i, 16 + i * 15, 105, 2.5)
  for (let i = 0; i < 3; i++) cell(1, 17 + i, 55 + i * 15, 105, 2.5)
  for (let row = 0; row < 2; row++) for (let col = 20; col < 24; col++) {
    for (let py = 0; py < 8; py++) for (let px = 0; px < (col === 23 ? 1 : 5); px++) {
      ctx.fillStyle = color(dots[(row * 24 + col) * 8 + py] & (1 << (4 - px)))
      ctx.fillRect(111 + ((col - 20) * 5 + px) * 1.8, 102 + (row * 8 + py) * 1.8, 1.6, 1.6)
    }
  }
  for (const [x, bitA, bitB, label] of [[153, 4, 3, 'VOL'], [181, 1, 0, 'EXP']]) {
    for (let y = 0; y < 8; y++) {
      const byte = dots[19 * 8 + y]
      ctx.fillStyle = color((byte & (1 << bitA)) || (byte & (1 << bitB)))
      ctx.fillRect(x, 103 + y * 3.2, 20, 1.7)
    }
    ctx.fillStyle = ink; ctx.fillText(label, x, 145)
  }
  for (const [x, col, label] of [[241, 0, 'REV'], [269, 1, 'CHO'], [297, 2, 'VAR']]) {
    for (let k = 0; k < 8; k++) {
      ctx.fillStyle = color(ctl(col, 15 - k))
      ctx.fillRect(x + k * 2.5, 126 - k * 2.8, 1.8, k * 2.8 + 2)
    }
    ctx.fillStyle = ink; ctx.fillText(label, x, 145)
  }
  ctx.fillStyle = ink; ctx.fillText('PAN', 212, 145)
  for (let k = 0; k < 7; k++) {
    const angle = (-135 + k * 45) * Math.PI / 180
    ctx.strokeStyle = color(ctl(3, 15 - k)); ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(221, 115); ctx.lineTo(221 + Math.sin(angle) * 11, 115 - Math.cos(angle) * 11); ctx.stroke()
  }
  const seven = (x, bits) => {
    const rectangles = [[2,0,8,2],[10,2,2,9],[10,13,2,9],[2,22,8,2],[0,13,2,9],[0,2,2,9],[2,11,8,2]]
    rectangles.forEach(([dx, dy, w, h], index) => { ctx.fillStyle = color(bits[index]); ctx.fillRect(x + dx, 103 + dy, w, h) })
  }
  ctx.fillStyle = color(ctl(1, 0)); ctx.fillRect(328, 114, 8, 2)
  ctx.fillStyle = color(ctl(0, 0)); ctx.fillRect(331, 110, 2, 10)
  const a = ctl(0, 1)
  seven(339, [a, ctl(1,1), ctl(0,7), a, a, ctl(1,4), a])
  seven(355, [ctl(1,6), ctl(0,6), ctl(0,3), ctl(0,2), ctl(1,2), ctl(1,7), ctl(1,3)])
  ctx.fillStyle = ink; ctx.fillText('KEY', 338, 145)
  for (const [y, label, on] of [[105, 'XG', ctl(1,5)], [118, 'GS', ctl(0,4)], [131, 'PERFORM', ctl(0,5)]]) {
    ctx.fillStyle = color(on); ctx.fillText(`▶ ${label}`, 382, y)
  }
  ctx.fillStyle = ink
  ctx.fillText('PART', 16, 145); ctx.fillText('BANK/PGM#', 55, 145)
}

export default function Smu2000Lcd({ frame }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) drawSmuLcd(ref.current, frame) }, [frame])
  return <canvas ref={ref} width={450} height={158} role="img" aria-label="S-MU2000 LCD"
    style={{ width: '100%', imageRendering: 'pixelated', borderRadius: 6, display: 'block' }} />
}
