import { useEffect, useRef } from 'react'
import { Application, Graphics } from 'pixi.js'
import { createParticleSystem } from './particleSystem.js'

function ParticlePreview({
  particleConfig,
  emit = true,
  width = 760,
  height = 160,
  background = 0x0f1115,
  className,
  style,
}) {
  const containerRef = useRef(null)
  const stateRef = useRef({
    app: null,
    bg: null,
    particleSystem: null,
    lastSize: { w: 0, h: 0 },
    emit,
    config: particleConfig,
  })

  useEffect(() => {
    stateRef.current.emit = emit
  }, [emit])

  useEffect(() => {
    stateRef.current.config = particleConfig
    stateRef.current.particleSystem?.setConfig(particleConfig)
  }, [particleConfig])

  useEffect(() => {
    let active = true
    const init = async () => {
      const root = containerRef.current
      if (!root) return
      const app = new Application()
      await app.init({
        width,
        height,
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
      const particleSystem = createParticleSystem(stateRef.current.config)
      app.stage.addChild(bg, particleSystem.container)

      stateRef.current = {
        app,
        bg,
        particleSystem,
        lastSize: { w: 0, h: 0 },
        emit: stateRef.current.emit,
        config: stateRef.current.config,
      }

      app.ticker.add(() => {
        const state = stateRef.current
        const activeApp = state.app
        if (!activeApp) return
        const w = Math.max(1, Math.floor(activeApp.screen.width))
        const h = Math.max(1, Math.floor(activeApp.screen.height))
        if (state.lastSize.w !== w || state.lastSize.h !== h) {
          state.lastSize = { w, h }
          state.bg.clear()
          state.bg.setFillStyle({ color: background, alpha: 1 })
          state.bg.beginPath()
          state.bg.rect(0, 0, w, h)
          state.bg.fill()
          state.particleSystem?.setBounds(activeApp.screen)
        }

        const t = activeApp.ticker.lastTime / 1000
        const x = w * 0.5 + Math.sin(t * 1.6) * w * 0.08
        const y = h * 0.5 + Math.cos(t * 1.2) * h * 0.12
        state.particleSystem?.update(activeApp.ticker.deltaMS / 1000, state.emit, x, y)
      })
    }

    init()
    return () => {
      active = false
      const app = stateRef.current.app
      const particleSystem = stateRef.current.particleSystem
      if (particleSystem) particleSystem.destroy()
      if (app) app.destroy(true)
      if (containerRef.current) containerRef.current.innerHTML = ''
      stateRef.current = {
        app: null,
        bg: null,
        particleSystem: null,
        lastSize: { w: 0, h: 0 },
        emit: stateRef.current.emit,
        config: stateRef.current.config,
      }
    }
  }, [width, height, background])

  useEffect(() => {
    const app = stateRef.current.app
    if (!app) return
    app.renderer.resize(width, height)
  }, [width, height])

  return <div ref={containerRef} className={className} style={style} />
}

export default ParticlePreview
