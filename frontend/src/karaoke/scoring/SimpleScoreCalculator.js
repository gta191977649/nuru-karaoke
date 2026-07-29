export const SCORING_ALGORITHM_VERSION = 'pitch-v9-allkaraoke-dynamic-join'
export const LIVE_HIT_MARKER_DETUNE_SCALE = 0.5
export const LIVE_HIT_MARKER_MAX_OFFSET_SEMITONES = 0.75

export const DEFAULT_SCORING_CONFIG = Object.freeze({
  pitchToleranceSemitones: 2,
  fragmentJoinNoteRatio: 0.2,
  edgeSnapNoteRatio: 0.1,
  sampleGridSec: 0.02,
  sampleLookupToleranceSec: 0.03,
  shortNoteMaxSec: 0.22,
  visualConfirmationMinSec: 0.08,
  visualConfirmationMaxSec: 0.16,
  visualConfirmationNoteRatio: 0.35,
  shortNoteSettleDelaySec: 0.04,
  visualFillRate: 1.5,
})

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function mod12(value) {
  const remainder = value % 12
  return remainder < 0 ? remainder + 12 : remainder
}

export function getNoteFragmentJoinToleranceSec(
  note,
  ratio = DEFAULT_SCORING_CONFIG.fragmentJoinNoteRatio,
) {
  const duration = Math.max(0, Number(note?.t1Sec) - Number(note?.t0Sec))
  const resolvedRatio = Number.isFinite(Number(ratio)) ? Math.max(0, Number(ratio)) : 0
  return duration * resolvedRatio
}

/** Map a continuous detected pitch to the closest octave-equivalent of the target. */
export function normalizePitchClass(userMidi, targetMidi) {
  const user = Number.isFinite(userMidi) ? Number(userMidi) : null
  const target = Number.isFinite(targetMidi) ? Number(targetMidi) : null
  if (user === null || target === null) {
    return {
      normalizedMidi: null,
      octaveFoldSemitones: null,
      centsError: null,
      absCentsError: null,
    }
  }

  const octaveFoldSemitones = Math.round((user - target) / 12) * 12
  const normalizedMidi = user - octaveFoldSemitones
  const centsError = (normalizedMidi - target) * 100
  return {
    normalizedMidi,
    octaveFoldSemitones,
    centsError,
    absCentsError: Math.abs(centsError),
  }
}

/** Match allkaraoke's rounded-note, shortest pitch-class distance. */
export function getPitchClassDistance(userMidi, targetMidi) {
  if (!Number.isFinite(userMidi) || !Number.isFinite(targetMidi)) return null
  const detectedPitch = Math.round(Number(userMidi))
  const targetPitch = Math.round(Number(targetMidi))
  return ((mod12(detectedPitch) - mod12(targetPitch) + 18) % 12) - 6
}

/** Convert pitch-class distance into all-or-nothing hit credit. */
export function scorePitchCredit(userMidi, targetMidi, config = {}) {
  const normalized = normalizePitchClass(userMidi, targetMidi)
  const distance = getPitchClassDistance(userMidi, targetMidi)
  if (!Number.isFinite(distance)) {
    return {
      ...normalized,
      distance: null,
      credit: 0,
      classification: 'unvoiced',
    }
  }

  const tolerance = Number.isFinite(config.pitchToleranceSemitones)
    ? Math.max(0, Math.round(Number(config.pitchToleranceSemitones)))
    : DEFAULT_SCORING_CONFIG.pitchToleranceSemitones
  const hit = Math.abs(distance) <= tolerance
  return {
    ...normalized,
    distance,
    credit: hit ? 1 : 0,
    classification: hit ? 'accurate' : 'miss',
  }
}

export function getLiveHitDisplayMidi(userMidi, targetMidi, config = {}) {
  const result = scorePitchCredit(userMidi, targetMidi, config)
  if (
    result.credit !== 1 ||
    !Number.isFinite(targetMidi) ||
    !Number.isFinite(result.normalizedMidi)
  ) {
    return null
  }

  const target = Number(targetMidi)
  const relativeOffset = (result.normalizedMidi - target) * LIVE_HIT_MARKER_DETUNE_SCALE
  const displayOffset = clamp(
    relativeOffset,
    -LIVE_HIT_MARKER_MAX_OFFSET_SEMITONES,
    LIVE_HIT_MARKER_MAX_OFFSET_SEMITONES,
  )
  return target + displayOffset
}

export function getLiveF0DisplayMidi(userMidi, targetMidi) {
  const normalized = normalizePitchClass(userMidi, targetMidi)
  if (!Number.isFinite(targetMidi) || !Number.isFinite(normalized.normalizedMidi)) {
    return null
  }

  const target = Number(targetMidi)
  const relativeOffset =
    (normalized.normalizedMidi - target) * LIVE_HIT_MARKER_DETUNE_SCALE
  const displayOffset = clamp(
    relativeOffset,
    -LIVE_HIT_MARKER_MAX_OFFSET_SEMITONES,
    LIVE_HIT_MARKER_MAX_OFFSET_SEMITONES,
  )
  return target + displayOffset
}

/**
 * Beat-weighted scoring compatible with the existing karaoke UI contract.
 * Internally it follows allkaraoke's rounded pitch-class matching and joins
 * short interruptions inside one target note, while emitting the same
 * note/visual/debug structures.
 */
export class SimpleScoreCalculator {
  constructor() {
    this.reset([])
  }

  reset(referenceNotes = [], options = {}) {
    this.referenceNotes = Array.isArray(referenceNotes)
      ? referenceNotes.slice().sort((a, b) => Number(a.t0Sec) - Number(b.t0Sec))
      : []
    this.reference = options.reference || null
    this.noteWeights = options.noteWeights || { normal: 1, default: 1 }
    this.rmsGate = Number.isFinite(options.rmsGate) ? Number(options.rmsGate) : 0.01
    this.config = {
      ...DEFAULT_SCORING_CONFIG,
      ...(options.scoringConfig || {}),
    }

    this.totalWeightedBeats = this._computeTotalWeightedBeats()
    this.correctWeightedBeats = 0
    this.finalizedWeightedBeats = 0
    this._samples = []
    this._nextNoteIndex = 0
    this._noteResults = []
    this._lastSampleTime = null
    this._visualTimeSec = 0
    this._lastFinalizeCount = 0
    this._lastFinalizeScore = 0
    this._liveResult = null
    this._currentFrame = null
    this._metrics = {
      totalSamples: 0,
      voicedSamples: 0,
      rejectedRms: 0,
      rejectedClarity: 0,
      smoothingResetCount: 0,
    }
    this._lastDebug = {
      timeSec: null,
      targetMidi: null,
      userMidi: null,
      normalizedUserMidi: null,
      octaveFoldSemitones: null,
      distance: null,
      credit: 0,
      centsError: null,
    }
  }

  getMaxGapSec(note) {
    return getNoteFragmentJoinToleranceSec(note, this.config.fragmentJoinNoteRatio)
  }

  getEdgeToleranceSec(note) {
    const duration = Math.max(0, Number(note?.t1Sec) - Number(note?.t0Sec))
    const ratio = Number(this.config.edgeSnapNoteRatio)
    const resolvedRatio = Number.isFinite(ratio)
      ? Math.max(0, ratio)
      : DEFAULT_SCORING_CONFIG.edgeSnapNoteRatio
    return duration * resolvedRatio
  }

  _getNoteWeight(note) {
    const type = note?.type || 'normal'
    const weight = this.noteWeights[type]
    if (Number.isFinite(weight)) return weight
    return Number.isFinite(this.noteWeights.default) ? this.noteWeights.default : 1
  }

  _noteBeatLength(note) {
    if (!note) return 0
    if (Number.isFinite(note.t0Beat) && Number.isFinite(note.t1Beat)) {
      return Math.max(0, note.t1Beat - note.t0Beat)
    }
    if (this.reference?.getBeatAtTime && Number.isFinite(note.t0Sec) && Number.isFinite(note.t1Sec)) {
      const startBeat = this.reference.getBeatAtTime(note.t0Sec)
      const endBeat = this.reference.getBeatAtTime(note.t1Sec)
      if (Number.isFinite(startBeat) && Number.isFinite(endBeat)) {
        return Math.max(0, endBeat - startBeat)
      }
    }
    return Math.max(0, Number(note.t1Sec) - Number(note.t0Sec))
  }

  _computeTotalWeightedBeats() {
    if (!this.referenceNotes.length) return 1
    const total = this.referenceNotes.reduce((sum, note) => {
      return sum + this._noteBeatLength(note) * this._getNoteWeight(note)
    }, 0)
    return total > 0 ? total : 1
  }

  _beatAtTime(timeSec) {
    if (this.reference?.getBeatAtTime) {
      const beat = this.reference.getBeatAtTime(timeSec)
      if (Number.isFinite(beat)) return beat
    }
    return Number(timeSec) || 0
  }

  _findReferenceNoteAtTime(timeSec) {
    let low = 0
    let high = this.referenceNotes.length - 1
    while (low <= high) {
      const middle = (low + high) >> 1
      const note = this.referenceNotes[middle]
      if (timeSec < note.t0Sec) high = middle - 1
      else if (timeSec >= note.t1Sec) low = middle + 1
      else return note
    }
    return null
  }

  _samplesBetween(startSec, endSec) {
    const lowerBound = (value) => {
      let low = 0
      let high = this._samples.length
      while (low < high) {
        const middle = (low + high) >> 1
        if (this._samples[middle].timeSec < value) low = middle + 1
        else high = middle
      }
      return low
    }
    return this._samples.slice(lowerBound(startSec), lowerBound(endSec))
  }

  _decisionWindowSec(note) {
    const duration = Math.max(0, Number(note?.t1Sec) - Number(note?.t0Sec))
    if (duration <= this.config.shortNoteMaxSec + 1e-7) {
      return this.config.visualConfirmationMinSec
    }
    return clamp(
      duration * this.config.visualConfirmationNoteRatio,
      this.config.visualConfirmationMinSec,
      this.config.visualConfirmationMaxSec,
    )
  }

  _visualDelaySec(note) {
    return this._decisionWindowSec(note)
  }

  _emptyNoteResult(note) {
    const duration = Math.max(0, Number(note?.t1Sec) - Number(note?.t0Sec))
    const stabilityMode = duration <= this.config.shortNoteMaxSec + 1e-7
      ? 'short-native'
      : 'standard-grid'
    return {
      note,
      noteId: note ? `${note.t0Sec}:${note.t1Sec}:${note.midi}` : null,
      creditBeats: 0,
      rawCreditBeats: 0,
      totalBeats: this._noteBeatLength(note),
      voicedBeats: 0,
      stableBeats: 0,
      hitBeats: 0,
      meanCredit: 0,
      meanRawCredit: 0,
      meanAbsCents: null,
      meanStabilityFactor: 0,
      stableCoverage: 0,
      voicedCoverage: 0,
      hitCoverage: 0,
      stableSegments: [],
      currentFrame: null,
      stabilityMode,
      pendingConfirmation: false,
      decisionWindowSec: this._decisionWindowSec(note),
      visualDelaySec: this._visualDelaySec(note),
      rawFrameCoverage: 0,
      validRawFrames: 0,
      stableIslandSec: 0,
      rejectionReason: 'unvoiced',
      smoothingResetCount: 0,
      smoothingResetMaxCents: 0,
      stability: {
        stable: false,
        stableState: 'unvoiced',
        stabilityFactor: 0,
        rejectionReason: 'unvoiced',
      },
    }
  }

  _evaluateNote(note, evaluationEndSec = note?.t1Sec, allowConfirmation = true) {
    const noteStart = Number(note?.t0Sec)
    const noteEnd = Number(note?.t1Sec)
    const duration = noteEnd - noteStart
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(note?.midi)) {
      return this._emptyNoteResult(note)
    }

    const endSec = Math.max(noteStart, Math.min(noteEnd, Number(evaluationEndSec) || noteEnd))
    const isComplete = endSec >= noteEnd - 1e-7
    const isShort = duration <= this.config.shortNoteMaxSec + 1e-7
    const pendingConfirmation = !isComplete || !allowConfirmation
    const samples = this._samplesBetween(noteStart - 1e-7, endSec - 1e-7)
    const fragmentJoinToleranceSec = this.getMaxGapSec(note)
    const edgeToleranceSec = this.getEdgeToleranceSec(note)
    const hitSegments = []
    const evaluations = []
    let activeSegment = null
    let lastHitTime = null
    let absCentsSum = 0
    let validRawFrames = 0

    const closeActiveSegment = (roundToEnd = false) => {
      if (!activeSegment || !Number.isFinite(lastHitTime)) {
        activeSegment = null
        lastHitTime = null
        return
      }
      activeSegment.t1Sec = roundToEnd ? noteEnd : lastHitTime
      if (activeSegment.t1Sec > activeSegment.t0Sec + 1e-9) {
        hitSegments.push(activeSegment)
      }
      activeSegment = null
      lastHitTime = null
    }

    for (const sample of samples) {
      const targetMidi = Number(note.midi) + (Number(sample.transposition) || 0)
      const pitch = scorePitchCredit(sample.midi, targetMidi, this.config)
      const voiced = Number.isFinite(sample.midi)
      const hit = pitch.credit === 1

      if (voiced) {
        validRawFrames += 1
        if (Number.isFinite(pitch.absCentsError)) absCentsSum += pitch.absCentsError
      }

      if (hit) {
        const gapSec = Number.isFinite(lastHitTime) ? sample.timeSec - lastHitTime : Infinity
        if (!activeSegment || gapSec > fragmentJoinToleranceSec + 1e-9) {
          closeActiveSegment()
          const roundedStart = sample.timeSec - noteStart <= edgeToleranceSec + 1e-9
            ? noteStart
            : sample.timeSec
          activeSegment = {
            t0Sec: roundedStart,
            t1Sec: sample.timeSec,
            midi: Number(note.midi),
          }
        }
        activeSegment.t1Sec = sample.timeSec
        lastHitTime = sample.timeSec
      } else if (
        activeSegment &&
        Number.isFinite(lastHitTime) &&
        sample.timeSec - lastHitTime > fragmentJoinToleranceSec + 1e-9
      ) {
        closeActiveSegment()
      }

      const visibleHit = hit && !pendingConfirmation
      evaluations.push({
        timeSec: sample.timeSec,
        endTimeSec: sample.timeSec,
        midi: pitch.normalizedMidi,
        rawMidi: sample.midi,
        octaveFoldSemitones: pitch.octaveFoldSemitones,
        targetMidi,
        distance: pitch.distance,
        rawCredit: pitch.credit,
        gatedCredit: visibleHit ? pitch.credit : 0,
        stabilityFactor: visibleHit ? pitch.credit : 0,
        centsError: pitch.centsError,
        absCentsError: pitch.absCentsError,
        stable: visibleHit,
        isHit: visibleHit,
        stableState: visibleHit ? 'stable' : (voiced ? 'voiced' : 'unvoiced'),
      })
    }

    const shouldRoundEnd =
      isComplete &&
      Number.isFinite(lastHitTime) &&
      noteEnd - lastHitTime <= edgeToleranceSec + 1e-9
    closeActiveSegment(shouldRoundEnd)

    const scoringSegments = hitSegments
    const stableSegments = pendingConfirmation ? [] : hitSegments
    const creditBeats = scoringSegments.reduce((sum, segment) => {
      return sum + Math.max(0, this._beatAtTime(segment.t1Sec) - this._beatAtTime(segment.t0Sec))
    }, 0)
    const totalBeats = Math.max(
      0,
      this._beatAtTime(endSec) - this._beatAtTime(noteStart),
    )
    const fullNoteBeats = this._noteBeatLength(note)
    const completedTotalBeats = isComplete ? fullNoteBeats : totalBeats
    const stableIslandSec = stableSegments.reduce((sum, segment) => {
      return sum + Math.max(0, segment.t1Sec - segment.t0Sec)
    }, 0)
    const currentFrame = evaluations[evaluations.length - 1] || null
    const meanCredit = completedTotalBeats > 0 ? creditBeats / completedTotalBeats : 0
    const voicedCoverage = samples.length > 0 ? validRawFrames / samples.length : 0
    const rejectionReason = creditBeats > 0
      ? null
      : (validRawFrames > 0 ? 'out-of-tolerance' : 'unvoiced')

    return {
      note,
      noteId: `${note.t0Sec}:${note.t1Sec}:${note.midi}`,
      creditBeats,
      rawCreditBeats: creditBeats,
      totalBeats: completedTotalBeats,
      voicedBeats: completedTotalBeats * voicedCoverage,
      stableBeats: creditBeats,
      hitBeats: creditBeats,
      meanCredit,
      meanRawCredit: meanCredit,
      meanAbsCents: validRawFrames > 0 ? absCentsSum / validRawFrames : null,
      meanStabilityFactor: meanCredit,
      stableCoverage: meanCredit,
      voicedCoverage,
      hitCoverage: meanCredit,
      stableSegments,
      currentFrame,
      stabilityMode: isShort ? 'short-native' : 'standard-grid',
      pendingConfirmation,
      decisionWindowSec: this._decisionWindowSec(note),
      visualDelaySec: this._visualDelaySec(note),
      rawFrameCoverage: voicedCoverage,
      validRawFrames,
      stableIslandSec,
      rejectionReason,
      smoothingResetCount: samples.filter((sample) => sample.smoothingReset).length,
      smoothingResetMaxCents: samples.length
        ? Math.max(...samples.map((sample) => Math.abs(sample.smoothingResetCents || 0)))
        : 0,
      stability: {
        stable: Boolean(currentFrame?.stable),
        stableState: currentFrame?.stableState || 'unvoiced',
        stabilityFactor: currentFrame?.stabilityFactor || 0,
        rejectionReason,
      },
    }
  }

  _finalizeReadyNotes(nowSec, force = false) {
    this._lastFinalizeCount = 0
    while (this._nextNoteIndex < this.referenceNotes.length) {
      const note = this.referenceNotes[this._nextNoteIndex]
      const readyAtSec = Number(note.t1Sec) + this._visualDelaySec(note)
      if (!force && nowSec < readyAtSec) break
      const result = this._evaluateNote(note)
      result.finalizedAtSec = nowSec
      const weight = this._getNoteWeight(note)
      this.correctWeightedBeats += result.creditBeats * weight
      this.finalizedWeightedBeats += result.totalBeats * weight
      this._noteResults.push(result)
      if (this._noteResults.length > 40) this._noteResults.shift()
      this._nextNoteIndex += 1
      this._lastFinalizeCount += 1
    }
    if (this._lastFinalizeCount > 0) this._lastFinalizeScore = this.getLiveScore()
  }

  process({ userPitch, transposition = 0, timeSec }) {
    const time = Number(timeSec)
    if (!Number.isFinite(time)) return undefined
    if (Number.isFinite(this._lastSampleTime) && time < this._lastSampleTime - 0.05) {
      const referenceNotes = this.referenceNotes
      const options = {
        reference: this.reference,
        noteWeights: this.noteWeights,
        rmsGate: this.rmsGate,
        scoringConfig: this.config,
      }
      this.reset(referenceNotes, options)
    }
    if (Number.isFinite(this._lastSampleTime) && time <= this._lastSampleTime + 0.001) {
      return undefined
    }

    this._lastSampleTime = time
    this._visualTimeSec = time
    const hasRms = Number.isFinite(userPitch?.rms)
    const rmsOk = !hasRms || Number(userPitch.rms) >= this.rmsGate
    const detectedMidi = Number.isFinite(userPitch?.rawMidi)
      ? Number(userPitch.rawMidi)
      : (Number.isFinite(userPitch?.midi) ? Number(userPitch.midi) : null)
    const midi = rmsOk ? detectedMidi : null
    this._metrics.totalSamples += 1
    if (Number.isFinite(midi)) this._metrics.voicedSamples += 1
    else if (hasRms && !rmsOk) this._metrics.rejectedRms += 1
    if (userPitch?.smoothingReset === true) this._metrics.smoothingResetCount += 1

    const sample = {
      timeSec: time,
      midi,
      rawMidi: midi,
      rms: hasRms ? Number(userPitch.rms) : null,
      confidence: Number.isFinite(userPitch?.confidence) ? Number(userPitch.confidence) : 0,
      rawConfidence: Number.isFinite(userPitch?.rawConfidence)
        ? Number(userPitch.rawConfidence)
        : 0,
      smoothingReset: userPitch?.smoothingReset === true,
      smoothingResetCount: Number.isFinite(userPitch?.smoothingResetCount)
        ? Number(userPitch.smoothingResetCount)
        : 0,
      smoothingResetCents: Number.isFinite(userPitch?.smoothingResetCents)
        ? Number(userPitch.smoothingResetCents)
        : null,
      transposition: Number.isFinite(Number(transposition)) ? Number(transposition) : 0,
    }
    this._samples.push(sample)
    this._finalizeReadyNotes(time)

    const note = this._findReferenceNoteAtTime(time)
    const targetMidi = note ? Number(note.midi) + sample.transposition : null
    const current = scorePitchCredit(midi, targetMidi, this.config)
    this._liveResult = note
      ? this._evaluateNote(note, Math.min(time + this.config.sampleGridSec, note.t1Sec), false)
      : null
    this._currentFrame = this._liveResult?.currentFrame || {
      timeSec: time,
      endTimeSec: time,
      midi: current.normalizedMidi,
      rawMidi: midi,
      octaveFoldSemitones: current.octaveFoldSemitones,
      targetMidi,
      distance: current.distance,
      rawCredit: current.credit,
      gatedCredit: 0,
      centsError: current.centsError,
      stable: false,
      isHit: false,
      stabilityFactor: 0,
      stableState: Number.isFinite(midi) ? 'voiced' : 'unvoiced',
    }
    this._lastDebug = {
      timeSec: time,
      targetMidi,
      userMidi: midi,
      normalizedUserMidi: current.normalizedMidi,
      octaveFoldSemitones: current.octaveFoldSemitones,
      distance: current.distance,
      credit: current.credit,
      centsError: current.centsError,
    }
    return {
      noteId: this._liveResult?.noteId || null,
      stableState: this._currentFrame.stableState,
      rawCredit: this._currentFrame.rawCredit,
      gatedCredit: this._currentFrame.gatedCredit,
      stabilityFactor: this._currentFrame.stabilityFactor,
      centsError: this._currentFrame.centsError,
      stable: this._currentFrame.stable,
      isHit: this._currentFrame.isHit,
    }
  }

  finalize(endTimeSec = this._lastSampleTime) {
    const end = Number.isFinite(Number(endTimeSec))
      ? Number(endTimeSec)
      : (this._lastSampleTime || 0)
    this._visualTimeSec = end
    this._finalizeReadyNotes(end, true)
    return this.getScore()
  }

  getScore() {
    if (!Number.isFinite(this.totalWeightedBeats) || this.totalWeightedBeats <= 0) return 0
    return clamp01(this.correctWeightedBeats / this.totalWeightedBeats) * 100
  }

  getLiveScore() {
    if (!Number.isFinite(this.finalizedWeightedBeats) || this.finalizedWeightedBeats <= 0) return 0
    return clamp01(this.correctWeightedBeats / this.finalizedWeightedBeats) * 100
  }

  getLiveScoreInfo(minFinalizedNotes = 3) {
    const finalizedNotes = this._nextNoteIndex
    const requestedThreshold = Math.max(1, Number(minFinalizedNotes) || 1)
    const readyThreshold = Math.min(
      requestedThreshold,
      Math.max(1, this.referenceNotes.length),
    )
    return {
      score: this.getLiveScore(),
      ready: finalizedNotes >= readyThreshold,
      finalizedNotes,
      finalizedWeightedBeats: this.finalizedWeightedBeats,
    }
  }

  getDebugInfo() {
    const totalSamples = this._metrics.totalSamples
    const stabilityRejections = this._noteResults.reduce((counts, result) => {
      const reason = result.rejectionReason || result.stability?.rejectionReason
      if (reason) counts[reason] = (counts[reason] || 0) + 1
      return counts
    }, {})
    return {
      algorithmVersion: SCORING_ALGORITHM_VERSION,
      score: this.getScore(),
      liveScore: this.getLiveScore(),
      correctWeightedBeats: this.correctWeightedBeats,
      totalWeightedBeats: this.totalWeightedBeats,
      finalizedWeightedBeats: this.finalizedWeightedBeats,
      finalizedNotes: this._nextNoteIndex,
      pendingNotes: Math.max(0, this.referenceNotes.length - this._nextNoteIndex),
      octaveShift: 0,
      octavePolicy: 'pitch-class',
      calibrationStatus: 'disabled',
      calibrationSamples: 0,
      voicedCoverage: totalSamples > 0 ? this._metrics.voicedSamples / totalSamples : 0,
      rejectedRms: this._metrics.rejectedRms,
      rejectedClarity: this._metrics.rejectedClarity,
      smoothingResetCount: this._metrics.smoothingResetCount,
      stabilityRejections,
      recentNotes: this._noteResults.slice(),
      liveNote: this._liveResult,
      last: { ...this._lastDebug },
    }
  }

  _confirmedThroughForResult(result) {
    if (!result) return null
    const note = result.note
    const noteStart = Number(note?.t0Sec)
    const noteEnd = Number(note?.t1Sec)
    if (!Number.isFinite(noteStart) || !Number.isFinite(noteEnd)) return null
    return Number.isFinite(result.finalizedAtSec) && !result.pendingConfirmation
      ? noteEnd
      : noteStart
  }

  _confirmedSegmentsForResult(result) {
    if (!result || !Array.isArray(result.stableSegments)) return []
    const confirmedThroughSec = this._confirmedThroughForResult(result)
    if (!Number.isFinite(confirmedThroughSec)) return []

    return result.stableSegments.flatMap((segment) => {
      const startSec = Number(segment.t0Sec)
      const endSec = Math.min(Number(segment.t1Sec), confirmedThroughSec)
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return []
      return [{
        ...segment,
        t1Sec: endSec,
        noteId: result.noteId,
        decisionWindowSec: result.decisionWindowSec,
        visualDelaySec: result.visualDelaySec,
        confirmedAtSec: result.finalizedAtSec,
      }]
    })
  }

  getVisualState() {
    const nowSec = Number.isFinite(this._visualTimeSec) ? this._visualTimeSec : 0
    const visualResults = this._liveResult
      ? [...this._noteResults.filter((result) => result.noteId !== this._liveResult.noteId), this._liveResult]
      : this._noteResults.slice()
    const confirmedSegments = visualResults
      .flatMap((result) => this._confirmedSegmentsForResult(result))
      .sort((a, b) => a.t0Sec - b.t0Sec)
    const activeResult = this._liveResult || this._noteResults[this._noteResults.length - 1] || null
    const confirmedThroughSec = this._confirmedThroughForResult(activeResult)
    const pendingDecisionCount = activeResult
      ? Math.max(0, Math.ceil(
        (Math.min(Number(activeResult.note?.t1Sec) || nowSec, nowSec) -
          (Number.isFinite(confirmedThroughSec)
            ? confirmedThroughSec
            : Number(activeResult.note?.t0Sec) || nowSec)) /
        this.config.sampleGridSec,
      ))
      : 0
    return {
      algorithmVersion: SCORING_ALGORITHM_VERSION,
      octaveShift: 0,
      octavePolicy: 'pitch-class',
      calibrationStatus: 'disabled',
      currentFrame: this._currentFrame,
      liveNote: this._liveResult,
      recentNotes: this._noteResults.slice(),
      confirmedSegments,
      pendingDecisionCount,
      decisionWindowSec: activeResult?.decisionWindowSec ?? null,
      confirmedThroughSec,
    }
  }

  getFinalizeInfo() {
    return {
      count: this._lastFinalizeCount,
      score: this._lastFinalizeScore,
    }
  }
}
