export const DEFAULT_STABILITY_CONFIG = Object.freeze({
  minWindowSec: 0.08,
  maxWindowSec: 0.16,
  windowNoteRatio: 0.35,
  minVoicedCoverage: 0.55,
  fullVoicedCoverage: 0.8,
  minVoicedFrames: 1,
  minSpanSec: 0,
  fullPitchRangeCents: 80,
  maxPitchRangeCents: 130,
  fullMadCents: 35,
  maxMadCents: 70,
  maxTrendCentsPerSec: 80,
  fullDirectionalMovementCents: 30,
  maxDirectionalMovementCents: 70,
  minDirectionConsistency: 0.75,
  stableFactorThreshold: 0.65,
  stableRetroactiveWindowRatio: 0.35,
  vibratoDirectionReversals: 2,
  vibratoMinSpanSec: 0.12,
  releaseGraceSec: 0.06,
  hitToleranceCents: 60,
})

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function percentile(values, ratio) {
  if (!values.length) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const position = clamp(ratio, 0, 1) * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  const fraction = position - lower
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction
}

function median(values) {
  return percentile(values, 0.5)
}

function smoothRamp(value, zeroAt, oneAt) {
  if (!Number.isFinite(value)) return 0
  if (oneAt <= zeroAt) return value >= oneAt ? 1 : 0
  const x = clamp((value - zeroAt) / (oneAt - zeroAt), 0, 1)
  return x * x * (3 - 2 * x)
}

function linearTrend(points) {
  if (points.length < 2) return 0
  const t0 = points[0].timeSec
  let sumT = 0
  let sumY = 0
  let sumTT = 0
  let sumTY = 0
  for (const point of points) {
    const t = point.timeSec - t0
    const y = point.midi * 100
    sumT += t
    sumY += y
    sumTT += t * t
    sumTY += t * y
  }
  const count = points.length
  const denominator = count * sumTT - sumT * sumT
  if (Math.abs(denominator) < 1e-9) return 0
  return (count * sumTY - sumT * sumY) / denominator
}

function countDirectionReversals(points) {
  let previousSign = 0
  let reversals = 0
  for (let index = 1; index < points.length; index += 1) {
    const deltaCents = (points[index].midi - points[index - 1].midi) * 100
    if (Math.abs(deltaCents) < 2) continue
    const sign = Math.sign(deltaCents)
    if (previousSign && sign !== previousSign) reversals += 1
    previousSign = sign
  }
  return reversals
}

function measureDirectionConsistency(points) {
  let signedChange = 0
  let absoluteChange = 0
  for (let index = 1; index < points.length; index += 1) {
    const deltaCents = (points[index].midi - points[index - 1].midi) * 100
    if (!Number.isFinite(deltaCents)) continue
    signedChange += deltaCents
    absoluteChange += Math.abs(deltaCents)
  }
  return absoluteChange > 1e-6 ? Math.abs(signedChange) / absoluteChange : 0
}

export class PitchStabilityTracker {
  constructor(noteDurationSec, config = {}) {
    this.config = { ...DEFAULT_STABILITY_CONFIG, ...config }
    const duration = Math.max(0, Number(noteDurationSec) || 0)
    this.windowSec = clamp(
      duration * this.config.windowNoteRatio,
      this.config.minWindowSec,
      this.config.maxWindowSec,
    )
    this.samples = []
    this.stable = false
    this.releaseSince = null
    this.lastMetrics = null
  }

  _windowAt(timeSec) {
    const start = timeSec - this.windowSec
    return this.samples.filter((sample) => sample.timeSec >= start - 1e-7 && sample.timeSec <= timeSec + 1e-7)
  }

  _measure(window) {
    const voiced = window.filter((sample) => Number.isFinite(sample.midi))
    const spanSec = window.length > 1 ? window[window.length - 1].timeSec - window[0].timeSec : 0
    const voicedCoverage = window.length ? voiced.length / window.length : 0
    const pitches = voiced.map((sample) => sample.midi * 100)
    const center = median(pitches)
    const deviations = Number.isFinite(center) ? pitches.map((pitch) => Math.abs(pitch - center)) : []
    const rangeCents = pitches.length ? percentile(pitches, 0.9) - percentile(pitches, 0.1) : null
    const madCents = deviations.length ? median(deviations) : null
    const trendCentsPerSec = linearTrend(voiced)
    const movementCents = Math.abs(trendCentsPerSec) * spanSec
    const directionReversals = countDirectionReversals(voiced)
    const directionConsistency = measureDirectionConsistency(voiced)
    const enoughSpan = spanSec >= Math.max(this.windowSec * 0.85, this.config.minSpanSec)
    const enoughFrames = voiced.length >= this.config.minVoicedFrames
    const periodic =
      spanSec >= this.config.vibratoMinSpanSec &&
      directionReversals >= this.config.vibratoDirectionReversals
    const directional =
      directionConsistency >= this.config.minDirectionConsistency &&
      !periodic
    const clearDirectionalSlide =
      directional &&
      movementCents >= this.config.maxDirectionalMovementCents

    const coverageFactor = smoothRamp(
      voicedCoverage,
      this.config.minVoicedCoverage,
      this.config.fullVoicedCoverage,
    )
    const rangeFactor = 1 - smoothRamp(
      rangeCents,
      this.config.fullPitchRangeCents,
      this.config.maxPitchRangeCents,
    )
    const madFactor = 1 - smoothRamp(
      madCents,
      this.config.fullMadCents,
      this.config.maxMadCents,
    )
    const motionFactor = directional
      ? 1 - smoothRamp(
          movementCents,
          this.config.fullDirectionalMovementCents,
          this.config.maxDirectionalMovementCents,
        )
      : 1
    const stabilityFactor = enoughSpan && enoughFrames && !clearDirectionalSlide
      ? clamp(coverageFactor * rangeFactor * madFactor * motionFactor, 0, 1)
      : 0
    const passes =
      enoughSpan &&
      enoughFrames &&
      stabilityFactor >= this.config.stableFactorThreshold

    let rejectionReason = null
    if (!enoughSpan) rejectionReason = 'insufficient-span'
    else if (!enoughFrames) rejectionReason = 'insufficient-frames'
    else if (voicedCoverage < this.config.minVoicedCoverage) rejectionReason = 'insufficient-coverage'
    else if (clearDirectionalSlide) rejectionReason = 'directional-slide'
    else if (rangeFactor <= 0 || madFactor <= 0) rejectionReason = 'excess-dispersion'
    else if (stabilityFactor < this.config.stableFactorThreshold) rejectionReason = 'borderline-stability'

    return {
      passes,
      enoughSpan,
      enoughFrames,
      voicedFrames: voiced.length,
      windowStartSec: window.length ? window[0].timeSec : null,
      spanSec,
      voicedCoverage,
      rangeCents,
      madCents,
      trendCentsPerSec,
      movementCents,
      directionReversals,
      directionConsistency,
      directional,
      periodic,
      clearDirectionalSlide,
      coverageFactor,
      rangeFactor,
      madFactor,
      motionFactor,
      stabilityFactor,
      rejectionReason,
    }
  }

  push(sample) {
    const entry = {
      ...sample,
      stable: false,
      isHit: false,
      gatedCredit: 0,
      stabilityFactor: 0,
      stableState: this.stable
        ? 'stable'
        : (Number.isFinite(sample.midi) ? 'candidate' : 'unvoiced'),
    }
    this.samples.push(entry)

    const window = this._windowAt(entry.timeSec)
    const metrics = this._measure(window)
    this.lastMetrics = metrics

    if (!this.stable && metrics.passes) {
      this.stable = true
      this.releaseSince = null
      const stableStart = entry.timeSec -
        this.windowSec * this.config.stableRetroactiveWindowRatio
      for (const pending of window) {
        if (pending.timeSec >= stableStart - 1e-7) pending.stable = true
      }
    } else if (this.stable && metrics.passes) {
      this.releaseSince = null
      entry.stable = true
    } else if (this.stable && !metrics.clearDirectionalSlide) {
      if (!Number.isFinite(this.releaseSince)) this.releaseSince = entry.timeSec
      if (entry.timeSec - this.releaseSince < this.config.releaseGraceSec) {
        entry.stable = true
        entry.stableState = 'release'
      } else {
        this.stable = false
        this.releaseSince = null
      }
    } else if (metrics.clearDirectionalSlide) {
      this.stable = false
      this.releaseSince = null
    }

    for (const point of window) {
      if (metrics.stabilityFactor > point.stabilityFactor) {
        point.stabilityFactor = metrics.stabilityFactor
        point.gatedCredit = (Number.isFinite(point.rawCredit) ? point.rawCredit : 0) *
          metrics.stabilityFactor
      }
      if (!point.stable) continue
      point.isHit =
        point.stabilityFactor >= this.config.stableFactorThreshold &&
        Number.isFinite(point.centsError) &&
        Math.abs(point.centsError) <= this.config.hitToleranceCents
      if (point.stableState !== 'release') point.stableState = 'stable'
    }
    if (entry.stable) {
      entry.stabilityFactor = Math.max(entry.stabilityFactor, metrics.stabilityFactor)
      entry.gatedCredit = (Number.isFinite(entry.rawCredit) ? entry.rawCredit : 0) *
        entry.stabilityFactor
      entry.isHit =
        entry.stabilityFactor >= this.config.stableFactorThreshold &&
        Number.isFinite(entry.centsError) &&
        Math.abs(entry.centsError) <= this.config.hitToleranceCents
      if (entry.stableState !== 'release') entry.stableState = 'stable'
    } else {
      entry.stableState = Number.isFinite(entry.midi)
        ? (metrics.enoughSpan ? 'voiced' : 'candidate')
        : 'unvoiced'
    }

    return entry
  }

  getEvaluations() {
    return this.samples
  }

  getDiagnostics() {
    return {
      stable: this.stable,
      stableState: this.samples[this.samples.length - 1]?.stableState || 'unvoiced',
      windowSec: this.windowSec,
      ...(this.lastMetrics || {}),
    }
  }
}
