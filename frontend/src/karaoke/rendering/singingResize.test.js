import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSingingResize } from './singingResize.js'
import { getDockTransform } from './dockTransform.js'

afterEach(() => vi.useRealTimers())

describe('singing surface resizing', () => {
  function fixture() {
    const host = { clientWidth: 1280, clientHeight: 720, getBoundingClientRect: () => ({ width: 640, height: 360 }) }
    const canvas = { style: {} }
    const app = { canvas, renderer: { resize: vi.fn((w, h) => { canvas.style.width = `${w}px`; canvas.style.height = `${h}px` }) } }
    const scene = { resize: vi.fn() }
    const resize = createSingingResize(app, scene, host, { innerWidth: 1280, innerHeight: 800 })
    return { host, app, scene, resize }
  }

  it('keeps the logical buffer size and fills its host under CSS scaling', () => {
    const { app, scene, resize } = fixture()
    resize.resize()
    expect(app.renderer.resize).toHaveBeenCalledWith(1280, 720)
    expect(scene.resize).toHaveBeenCalledWith(1280, 720)
    expect(app.canvas.style).toEqual({ width: '100%', height: '100%' })
    resize.schedule()
    expect(scene.resize).toHaveBeenCalledTimes(1)
  })

  it('coalesces an animated layout resize and cancels pending work on unmount', () => {
    vi.useFakeTimers()
    const { host, scene, resize } = fixture()
    resize.resize()
    for (let i = 0; i < 20; i++) {
      host.clientWidth += 10
      resize.schedule()
      vi.advanceTimersByTime(16)
    }
    expect(scene.resize).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(100)
    expect(scene.resize).toHaveBeenLastCalledWith(1480, 720)
    host.clientHeight = 800
    resize.schedule()
    resize.destroy()
    vi.runAllTimers()
    expect(scene.resize).toHaveBeenCalledTimes(2)
  })
})

describe('preview surface bounds', () => {
  it.each([[800, 600], [800, 300]])('fills the %sx%s target including canvas black bars', (width, height) => {
    const result = getDockTransform({ left: 0, top: 0, width: 1280, height: 720 }, { left: 80, top: 130, width, height })
    expect(1280 * result.sx).toBeCloseTo(width)
    expect(720 * result.sy).toBeCloseTo(height)
    expect(result.x).toBe(80)
    expect(result.y).toBe(130)
  })
})
