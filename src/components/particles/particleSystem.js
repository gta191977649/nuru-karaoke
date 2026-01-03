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
  spawnRadius: 20,
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

export { DEFAULT_PARTICLE_CONFIG, cloneParticleConfig, createParticleSystem }
