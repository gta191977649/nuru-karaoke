import { useEffect, useRef } from 'react'
import { getTargetNoteAtTick, mergeAdjacentNotesByPitch } from '../../engine/audio/midi/referenceMelody.js'
import { DEFAULT_CONFIG } from '../../engine/audioEngine.js'

function useKaraokePitchHistory({
  pitchEngine,
  reference,
  currentTimeRef,
  transpositionRef,
  rmsGate = 0,
  resetKey = '',
}) {
  const lastPitchRef = useRef(null)
  const pitchHistoryRef = useRef([])
  const fullHistoryRef = useRef([])
  const framePitchHistoryRef = useRef([]) // short per-hop-ish buffer for stability metrics
  const lastValidPitchRef = useRef(null)
  const lastValidPitchTimeRef = useRef(null)
  const mergedReferenceRef = useRef(null)
  const lastHistoryTimeRef = useRef(null)

  useEffect(() => {
    pitchHistoryRef.current = []
    fullHistoryRef.current = []
    framePitchHistoryRef.current = []
    lastPitchRef.current = null
    lastValidPitchRef.current = null
    lastValidPitchTimeRef.current = null
    mergedReferenceRef.current = null
    lastHistoryTimeRef.current = null
  }, [resetKey])

  useEffect(() => {
    mergedReferenceRef.current = null
  }, [reference])

  useEffect(() => {
    const unsubscribe = pitchEngine.onPitch((result) => {
      lastPitchRef.current = result

      const songTimeSec = currentTimeRef.current
      if (!Number.isFinite(songTimeSec)) return

      // Short rolling buffer at detector rate (or close to it), for per-frame stability.
      {
        const tAcSec = Number.isFinite(result?.tAcSec) ? Number(result.tAcSec) : null
        const point = {
          t: songTimeSec,
          tAcSec,
          f0Hz: Number.isFinite(result?.f0Hz) ? Number(result.f0Hz) : null,
          rawF0Hz: Number.isFinite(result?.rawF0Hz) ? Number(result.rawF0Hz) : null,
          confidence: Number.isFinite(result?.confidence) ? Number(result.confidence) : 0,
          rawConfidence: Number.isFinite(result?.rawConfidence) ? Number(result.rawConfidence) : 0,
          rms: result?.rms ?? null,
        }
        const frames = framePitchHistoryRef.current
        frames.push(point)
        const nowKey = Number.isFinite(tAcSec) ? tAcSec : songTimeSec
        const cutoff = nowKey - 12.0
        while (frames.length) {
          const head = frames[0]
          const headKey = Number.isFinite(head?.tAcSec) ? head.tAcSec : head?.t
          if (!Number.isFinite(headKey) || headKey >= cutoff) break
          frames.shift()
        }
        if (frames.length > 4096) frames.splice(0, frames.length - 4096)
      }

      if (Number.isFinite(lastHistoryTimeRef.current) && songTimeSec <= lastHistoryTimeRef.current) return
      lastHistoryTimeRef.current = songTimeSec

      const breakToleranceSec = Number(DEFAULT_CONFIG.breakToleranceMs) / 1000
      const edgeToleranceSec = Math.min(0.08, Math.max(0, breakToleranceSec / 2))
      if (reference && !mergedReferenceRef.current) {
        const bps = reference?.getBeatsPerSecond ? reference.getBeatsPerSecond(0) : 2
        const maxGapBeat = breakToleranceSec * (Number.isFinite(bps) ? bps : 2)
        mergedReferenceRef.current = {
          ...reference,
          notes: mergeAdjacentNotesByPitch(reference.notes || [], {
            maxGapBeat,
            pitchToleranceSemis: 0,
            useBeat: true,
          }),
        }
      }
      const ref = mergedReferenceRef.current || reference
      const ticksPerBeat = Number(ref?.timeDivision) || 480
      const tick = ref?.getTickAtTime ? ref.getTickAtTime(songTimeSec) : songTimeSec
      const bpsNow = ref?.getBeatsPerSecond ? ref.getBeatsPerSecond(songTimeSec) : 2
      const ticksPerSec = (Number.isFinite(bpsNow) ? bpsNow : 2) * ticksPerBeat
      const maxGapTick = breakToleranceSec * ticksPerSec
      const edgeToleranceTick = edgeToleranceSec * ticksPerSec
      const rawTargetNote = ref
        ? getTargetNoteAtTick(ref, tick, {
            maxGapTick,
            edgeToleranceTick,
          })
        : null
      const rawTargetMidi = rawTargetNote ? rawTargetNote.midi : null
      const transposedTargetMidi =
        rawTargetMidi != null ? rawTargetMidi + transpositionRef.current : null

      const hasRms = Number.isFinite(result?.rms)
      const rmsOk = !hasRms || result.rms >= rmsGate
      let userMidi =
        Number.isFinite(result?.midi) && rmsOk
          ? Number(result.midi)
          : null
      if (Number.isFinite(userMidi)) {
        lastValidPitchRef.current = userMidi
        lastValidPitchTimeRef.current = songTimeSec
      } else if (
        Number.isFinite(lastValidPitchRef.current) &&
        Number.isFinite(lastValidPitchTimeRef.current) &&
        songTimeSec - lastValidPitchTimeRef.current <= breakToleranceSec
      ) {
        userMidi = Number(lastValidPitchRef.current)
      }

      const history = pitchHistoryRef.current
      const point = {
        t: songTimeSec,
        userMidi,
        targetMidi: transposedTargetMidi,
        rms: result?.rms ?? null,
        f0Hz: Number.isFinite(result?.f0Hz) ? Number(result.f0Hz) : null,
        confidence: Number.isFinite(result?.confidence) ? Number(result.confidence) : 0,
      }
      history.push(point)
      fullHistoryRef.current.push(point)
      const cutoff = songTimeSec - 12
      while (history.length && history[0].t < cutoff) history.shift()
    })
    return () => unsubscribe()
  }, [pitchEngine, reference, rmsGate, currentTimeRef, transpositionRef])

  return { lastPitchRef, pitchHistoryRef, fullHistoryRef, framePitchHistoryRef }
}

export { useKaraokePitchHistory }
