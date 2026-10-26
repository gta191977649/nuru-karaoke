import { describe, expect, it } from 'vitest'
import { getSingingViewport } from './singingViewport.js'

describe('canvas-owned letterboxing', () => {
  it('draws top and bottom bars on a 4:3 surface', () => {
    expect(getSingingViewport(800, 600)).toMatchObject({ x: 0, y: 75, width: 800, height: 450 })
  })
  it('scales the complete layout into small canvases', () => {
    const view = getSingingViewport(800, 600, 4 / 3, 1280)
    expect(view.scaleX).toBeCloseTo(0.625)
    expect(view.scaleY).toBeCloseTo(0.625)
  })
  it('draws side bars on an ultrawide surface', () => {
    const view = getSingingViewport(2400, 900)
    expect(view.x).toBeCloseTo(400)
    expect(view.width).toBeCloseTo(1600)
    expect(view.height).toBe(900)
  })
  it('counteracts unequal CSS scales without rebuilding content layout', () => {
    const view = getSingingViewport(1280, 720, 800 / 600)
    const displayedWidth = view.width * (800 / 1280)
    const displayedHeight = view.height * (600 / 720)
    expect(displayedWidth / displayedHeight).toBeCloseTo(16 / 9)
    expect(view.y * (600 / 720)).toBeCloseTo(75)
    expect(view.scaleX).toBe(1)
  })
})
