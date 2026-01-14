import { Particle, ParticleContainer, Texture } from 'pixi.js'

const DEFAULT_PARTICLE_CONFIG = {
  emissionRate: 200,
  maxParticles: 650,
  lifetime: {
    min: 0.45,
    max: 1.0,
  },
  speed: {
    min: 80,
    max: 260,
  },
  angle: {
    min: Math.PI,
    max: Math.PI,
  },
  rotationSpeed: {
    min: -4,
    max: 6,
  },
  spawnRadius: 30,
  scale: {
    start: 2.0,
    end: 1.25,
  },
  alpha: {
    start: 1,
    end: 0.0,
  },
  tint: {
    start: 0xffd14a,
    end: 0xfff7c7,
  },
}

const cloneParticleConfig = (config = DEFAULT_PARTICLE_CONFIG) => ({
  ...config,
  lifetime: { ...config.lifetime },
  speed: { ...config.speed },
  angle: { ...config.angle },
  rotationSpeed: { ...config.rotationSpeed },
  scale: { ...config.scale },
  alpha: { ...config.alpha },
  tint: { ...config.tint },
})

const resolveParticleConfig = (override) => {
  if (!override) return cloneParticleConfig(DEFAULT_PARTICLE_CONFIG)
  const base = cloneParticleConfig(DEFAULT_PARTICLE_CONFIG)
  return {
    ...base,
    ...override,
    lifetime: { ...base.lifetime, ...(override.lifetime || {}) },
    speed: { ...base.speed, ...(override.speed || {}) },
    angle: { ...base.angle, ...(override.angle || {}) },
    rotationSpeed: { ...base.rotationSpeed, ...(override.rotationSpeed || {}) },
    scale: { ...base.scale, ...(override.scale || {}) },
    alpha: { ...base.alpha, ...(override.alpha || {}) },
    tint: { ...base.tint, ...(override.tint || {}) },
  }
}

const lerp = (a, b, t) => a + (b - a) * t
const lerpColor = (from, to, t) => {
  const fr = (from >> 16) & 0xff
  const fg = (from >> 8) & 0xff
  const fb = from & 0xff
  const tr = (to >> 16) & 0xff
  const tg = (to >> 8) & 0xff
  const tb = to & 0xff
  const r = Math.round(lerp(fr, tr, t))
  const g = Math.round(lerp(fg, tg, t))
  const b = Math.round(lerp(fb, tb, t))
  return (r << 16) | (g << 8) | b
}

const randRange = (min, max) => min + Math.random() * (max - min)

const createParticleSystem = (initialConfig) => {
  const particleContainer = new ParticleContainer({
    dynamicProperties: {
      position: true,
      rotation: true,
      color: true,
      vertex: true,
    },
    roundPixels: false,
  })
  particleContainer.texture = Texture.WHITE

  let config = resolveParticleConfig(initialConfig)
  let lastConfigRef = initialConfig
  const particlePool = []
  const activeParticles = []
  let particleEmitAccum = 0

  const spawnParticle = (x, y) => {
    if (activeParticles.length >= config.maxParticles) return
    const particle = particlePool.pop() || new Particle({ texture: Texture.WHITE })
    const offsetAngle = randRange(0, Math.PI * 2)
    const offsetRadius = randRange(0, config.spawnRadius)
    const posX = x + Math.cos(offsetAngle) * offsetRadius
    const posY = y + Math.sin(offsetAngle) * offsetRadius
    const angle = randRange(config.angle.min, config.angle.max)
    const speed = randRange(config.speed.min, config.speed.max)
    const rotationSpeed = randRange(config.rotationSpeed.min, config.rotationSpeed.max)
    const maxLife = randRange(config.lifetime.min, config.lifetime.max)

    particle.x = posX
    particle.y = posY
    particle.anchorX = 0.5
    particle.anchorY = 0.5
    particle.scaleX = config.scale.start
    particle.scaleY = config.scale.start
    particle.rotation = randRange(0, Math.PI * 2)
    particle.tint = config.tint.start
    particle.alpha = config.alpha.start

    particleContainer.addParticle(particle)
    activeParticles.push({
      particle,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife,
      rotationSpeed,
    })
  }

  const update = (deltaSec, emit, x, y) => {
    if (emit && Number.isFinite(x) && Number.isFinite(y)) {
      particleEmitAccum += deltaSec * config.emissionRate
      const capacity = config.maxParticles - activeParticles.length
      const spawnCount = Math.min(Math.floor(particleEmitAccum), Math.max(0, capacity))
      if (spawnCount > 0) {
        particleEmitAccum -= spawnCount
        for (let i = 0; i < spawnCount; i += 1) {
          spawnParticle(x, y)
        }
      }
    } else {
      particleEmitAccum = 0
    }

    for (let i = activeParticles.length - 1; i >= 0; i -= 1) {
      const entry = activeParticles[i]
      entry.life += deltaSec
      const t = entry.life / entry.maxLife
      if (t >= 1) {
        particleContainer.removeParticle(entry.particle)
        particlePool.push(entry.particle)
        activeParticles.splice(i, 1)
        continue
      }
      entry.particle.x += entry.vx * deltaSec
      entry.particle.y += entry.vy * deltaSec
      entry.particle.rotation += entry.rotationSpeed * deltaSec
      const scale = lerp(config.scale.start, config.scale.end, t)
      entry.particle.scaleX = scale
      entry.particle.scaleY = scale
      entry.particle.alpha = lerp(config.alpha.start, config.alpha.end, t)
      entry.particle.tint = lerpColor(config.tint.start, config.tint.end, t)
    }
  }

  const setConfig = (nextConfig) => {
    if (nextConfig === lastConfigRef) return
    lastConfigRef = nextConfig
    config = resolveParticleConfig(nextConfig)
  }

  const setBounds = (bounds) => {
    particleContainer.boundsArea = bounds
  }

  const destroy = () => {
    particleContainer.particleChildren.length = 0
    activeParticles.length = 0
    particlePool.length = 0
    particleContainer.destroy()
  }

  return {
    container: particleContainer,
    setConfig,
    setBounds,
    update,
    destroy,
  }
}

// ... existing code ...

const createComboSystem = () => {
  const particleContainer = new ParticleContainer({
    dynamicProperties: {
      position: true,
      scale: true,
      rotation: true,
      color: true,
      alpha: true
    }
  })
  particleContainer.texture = Texture.WHITE

  // Pool for standard particles (trails/bursts)
  const particlePool = []
  const activeParticles = [] // Visual particles (trails/sparks)

  // Active "Heads" (logical agents moving from A to B)
  const activeHeads = []

  // Helper: Spawn a visual particle
  const spawnVisual = (x, y, color, type = 'trail') => {
    const p = particlePool.pop() || new Particle({ texture: Texture.WHITE })
    p.x = x
    p.y = y
    p.anchorX = 0.5
    p.anchorY = 0.5
    p.rotation = Math.random() * Math.PI * 2
    p.tint = color

    let life = 0.5
    let vx = 0
    let vy = 0
    let scale = 1.0
    let decay = 1.0 // alpha decay

    if (type === 'trail') {
      life = randRange(0.3, 0.6)
      scale = randRange(2.5, 5.0)
      p.alpha = 0.6
      p.scaleX = scale
      p.scaleY = scale
      // Slight drift
      vx = randRange(-20, 20)
      vy = randRange(-20, 20)
    } else if (type === 'burst') {
      life = randRange(0.4, 0.8)
      scale = randRange(4.0, 8.0)
      p.alpha = 1.0
      p.scaleX = scale
      p.scaleY = scale
      // Explosion
      const angle = randRange(0, Math.PI * 2)
      const speed = randRange(50, 200)
      vx = Math.cos(angle) * speed
      vy = Math.sin(angle) * speed
    } else if (type === 'head') {
      // The glowing head itself (drawn as a particle for simplicity?)
      // Actually head is managed separately, but we can emit a "glare" particle
      // that lives for 1 frame? No, better to just emit trails.
    }

    particleContainer.addParticle(p)
    activeParticles.push({ p, vx, vy, life, maxLife: life, scale, type })
  }

  // API: Spawn a Combo Comet
  const spawnCombo = (x, y, targetX, targetY, color) => {
    activeHeads.push({
      x, y,
      targetX, targetY,
      color,
      progress: 0,
      duration: 0.6 // Seconds to reach target
    })
  }

  const update = (deltaSec) => {
    // 1. Update Heads
    for (let i = activeHeads.length - 1; i >= 0; i--) {
      const head = activeHeads[i]
      head.progress += deltaSec / head.duration

      if (head.progress >= 1) {
        // Reached target -> Burst!
        for (let k = 0; k < 20; k++) {
          spawnVisual(head.targetX, head.targetY, head.color, 'burst')
        }
        activeHeads.splice(i, 1)
        continue
      }

      // Move logic (Ease In Out?)
      // Simple lerp:
      // const t = head.progress
      const t = head.progress * (2 - head.progress) // Ease out? 

      const curX = lerp(head.x, head.targetX, t)
      const curY = lerp(head.y, head.targetY, t)

      // Emit Trail
      // Dense trails: emit multiple per frame?
      // e.g. 2 per frame
      for (let k = 0; k < 2; k++) {
        // Jitter position slightly
        spawnVisual(curX + randRange(-5, 5), curY + randRange(-5, 5), head.color, 'trail')
      }
    }

    // 2. Update Visual Particles
    for (let i = activeParticles.length - 1; i >= 0; i--) {
      const entry = activeParticles[i]
      entry.life -= deltaSec

      if (entry.life <= 0) {
        particleContainer.removeParticle(entry.p)
        particlePool.push(entry.p)
        activeParticles.splice(i, 1)
        continue
      }

      entry.p.x += entry.vx * deltaSec
      entry.p.y += entry.vy * deltaSec

      const t = 1 - (entry.life / entry.maxLife) // 0 to 1

      // Fade out
      entry.p.alpha = 1 - t

      // Scale down
      const s = entry.scale * (1 - t * 0.5)
      entry.p.scaleX = s
      entry.p.scaleY = s
    }
  }

  const destroy = () => {
    particleContainer.destroy()
  }

  return {
    container: particleContainer,
    spawnCombo,
    update,
    destroy
  }
}

export { DEFAULT_PARTICLE_CONFIG, cloneParticleConfig, createParticleSystem, createComboSystem }
