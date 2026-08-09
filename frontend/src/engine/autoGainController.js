const AUTO_GAIN_DEFAULTS = Object.freeze({
  targetDb: -18,
  silenceGateDb: -50,
  minGainDb: -6,
  maxGainDb: 20,
  levelTimeConstantSec: 1.5,
  boostTimeConstantSec: 4,
  cutTimeConstantSec: 0.2,
  updateIntervalSec: 0.1,
  metricsIntervalSec: 0.5,
})

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const dbToGain = (db) => 10 ** (Number(db) / 20)

function calculateAutoGainTargetDb(inputDb, config = AUTO_GAIN_DEFAULTS) {
  const level = Number(inputDb)
  if (!Number.isFinite(level) || level <= config.silenceGateDb) return null
  return clamp(config.targetDb - level, config.minGainDb, config.maxGainDb)
}

function smoothAutoGainDb(currentDb, targetDb, deltaSec, config = AUTO_GAIN_DEFAULTS) {
  const current = Number.isFinite(currentDb) ? currentDb : 0
  if (!Number.isFinite(targetDb)) return current
  const dt = Math.max(0, Number(deltaSec) || 0)
  const timeConstant = targetDb < current
    ? config.cutTimeConstantSec
    : config.boostTimeConstantSec
  if (timeConstant <= 0) return targetDb
  const alpha = 1 - Math.exp(-dt / timeConstant)
  return current + (targetDb - current) * alpha
}

class AutoGainController {
  constructor(context, options = {}) {
    this.context = context
    this.config = { ...AUTO_GAIN_DEFAULTS, ...(options.config || {}) }
    this.onMetrics = typeof options.onMetrics === 'function' ? options.onMetrics : null

    this.input = context.createGain()
    this.output = context.createGain()
    this.dryGain = context.createGain()
    this.wetGain = context.createGain()
    this.autoGain = context.createGain()
    this.analyser = context.createAnalyser()
    this.compressor = context.createDynamicsCompressor()
    this.ceilingGain = context.createGain()

    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0
    this.samples = new Float32Array(this.analyser.fftSize)

    const now = context.currentTime
    this.compressor.threshold.setValueAtTime(-3, now)
    this.compressor.knee.setValueAtTime(0, now)
    this.compressor.ratio.setValueAtTime(20, now)
    this.compressor.attack.setValueAtTime(0.003, now)
    this.compressor.release.setValueAtTime(0.25, now)
    this.ceilingGain.gain.setValueAtTime(dbToGain(-1), now)
    this.dryGain.gain.setValueAtTime(1, now)
    this.wetGain.gain.setValueAtTime(0, now)

    this.input.connect(this.dryGain)
    this.dryGain.connect(this.output)
    this.input.connect(this.analyser)
    this.input.connect(this.autoGain)
    this.autoGain.connect(this.compressor)
    this.compressor.connect(this.ceilingGain)
    this.ceilingGain.connect(this.wetGain)
    this.wetGain.connect(this.output)

    this.enabled = false
    this.raf = 0
    this.lastTickSec = 0
    this.lastMetricsSec = 0
    this.smoothedPower = null
    this.initialGainDb = 0
    this.currentGainDb = 0
    this.inputLevelDb = -100
    this.tick = this.tick.bind(this)
  }

  connect(destination) {
    return this.output.connect(destination)
  }

  disconnect(destination) {
    this.output.disconnect(destination)
  }

  setEnabled(enabled) {
    const next = Boolean(enabled)
    if (this.enabled === next) return
    this.enabled = next

    const now = this.context.currentTime
    const fadeEnd = now + 0.03
    for (const param of [this.dryGain.gain, this.wetGain.gain]) {
      param.cancelScheduledValues(now)
      param.setValueAtTime(param.value, now)
    }
    this.dryGain.gain.linearRampToValueAtTime(next ? 0 : 1, fadeEnd)
    this.wetGain.gain.linearRampToValueAtTime(next ? 1 : 0, fadeEnd)

    if (next) {
      this.reset(false)
      this.lastTickSec = performance.now() / 1000
      this.raf = requestAnimationFrame(this.tick)
    } else {
      if (this.raf) cancelAnimationFrame(this.raf)
      this.raf = 0
      this.smoothedPower = null
      this.currentGainDb = 0
      this.inputLevelDb = -100
      this.autoGain.gain.cancelScheduledValues(now)
      this.autoGain.gain.setValueAtTime(this.autoGain.gain.value, now)
      this.autoGain.gain.linearRampToValueAtTime(1, fadeEnd)
    }
    this.emitMetrics(true)
  }

  setInitialGainDb(gainDb) {
    this.initialGainDb = clamp(
      Number.isFinite(Number(gainDb)) ? Number(gainDb) : 0,
      this.config.minGainDb,
      this.config.maxGainDb,
    )
    this.reset()
  }

  reset(shouldEmit = true) {
    this.smoothedPower = null
    this.currentGainDb = this.initialGainDb
    this.inputLevelDb = -100
    const now = this.context.currentTime
    this.autoGain.gain.cancelScheduledValues(now)
    this.autoGain.gain.setValueAtTime(dbToGain(this.currentGainDb), now)
    this.emitMetrics(shouldEmit)
  }

  tick(nowMs) {
    if (!this.enabled) return
    const nowSec = nowMs / 1000
    const deltaSec = Math.max(0, nowSec - this.lastTickSec)
    if (deltaSec < this.config.updateIntervalSec) {
      this.raf = requestAnimationFrame(this.tick)
      return
    }
    this.lastTickSec = nowSec

    this.analyser.getFloatTimeDomainData(this.samples)
    let power = 0
    for (let index = 0; index < this.samples.length; index += 1) {
      const sample = this.samples[index]
      power += sample * sample
    }
    power /= this.samples.length
    const instantLevelDb = power > 0 ? 10 * Math.log10(power) : -100

    const levelAlpha = this.smoothedPower == null
      ? 1
      : 1 - Math.exp(-deltaSec / this.config.levelTimeConstantSec)
    this.smoothedPower = this.smoothedPower == null
      ? power
      : this.smoothedPower + (power - this.smoothedPower) * levelAlpha
    this.inputLevelDb = this.smoothedPower > 0
      ? 10 * Math.log10(this.smoothedPower)
      : -100

    const targetDb = instantLevelDb <= this.config.silenceGateDb
      ? null
      : calculateAutoGainTargetDb(this.inputLevelDb, this.config)
    if (targetDb != null) {
      this.currentGainDb = smoothAutoGainDb(
        this.currentGainDb,
        targetDb,
        deltaSec,
        this.config,
      )
      this.autoGain.gain.setValueAtTime(dbToGain(this.currentGainDb), this.context.currentTime)
    }

    this.emitMetrics(nowSec - this.lastMetricsSec >= this.config.metricsIntervalSec)
    if (nowSec - this.lastMetricsSec >= this.config.metricsIntervalSec) {
      this.lastMetricsSec = nowSec
    }
    this.raf = requestAnimationFrame(this.tick)
  }

  emitMetrics(shouldEmit) {
    if (!shouldEmit || !this.onMetrics) return
    this.onMetrics({
      enabled: this.enabled,
      gainDb: this.enabled ? this.currentGainDb : 0,
      inputLevelDb: this.inputLevelDb,
      reductionDb: Number(this.compressor.reduction) || 0,
    })
  }
}

export {
  AUTO_GAIN_DEFAULTS,
  AutoGainController,
  calculateAutoGainTargetDb,
  smoothAutoGainDb,
}
