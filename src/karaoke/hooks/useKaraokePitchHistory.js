import { useEffect, useRef } from 'react'
import { getTargetNoteAtTime, mergeAdjacentNotesByPitch } from '../../engine/audio/midi/referenceMelody.js'
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
  const lastValidPitchRef = useRef(null)
  const lastValidPitchTimeRef = useRef(null)
  const mergedReferenceRef = useRef(null)

  useEffect(() => {
    pitchHistoryRef.current = []
    lastPitchRef.current = null
    lastValidPitchRef.current = null
    lastValidPitchTimeRef.current = null
    mergedReferenceRef.current = null
  }, [resetKey])

  useEffect(() => {
    mergedReferenceRef.current = null
  }, [reference])

  useEffect(() => {
    const unsubscribe = pitchEngine.onPitch((result) => {
      lastPitchRef.current = result
    })
    return () => unsubscribe()
  }, [pitchEngine])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const songTimeSec = currentTimeRef.current
      const breakToleranceSec = Number(DEFAULT_CONFIG.breakToleranceMs) / 1000
      const edgeToleranceSec = Math.min(0.08, Math.max(0, breakToleranceSec / 2))
      if (reference && !mergedReferenceRef.current) {
        mergedReferenceRef.current = {
          ...reference,
          notes: mergeAdjacentNotesByPitch(reference.notes || [], {
            maxGapSec: breakToleranceSec,
            pitchToleranceSemis: 0,
          }),
        }
      }
      const rawTargetNote = reference
        ? getTargetNoteAtTime(mergedReferenceRef.current || reference, songTimeSec, {
            maxGap: breakToleranceSec,
            edgeToleranceSec,
          })
        : null
      const rawTargetMidi = rawTargetNote ? rawTargetNote.midi : null
      const transposedTargetMidi =
        rawTargetMidi != null ? rawTargetMidi + transpositionRef.current : null
      const last = lastPitchRef.current
      const hasRms = Number.isFinite(last?.rms)
      const rmsOk = !hasRms || last.rms >= rmsGate
      let userMidi =
        Number.isFinite(last?.midi) && rmsOk
          ? Number(last.midi)
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
      history.push({ t: songTimeSec, userMidi, targetMidi: transposedTargetMidi, rms: last?.rms ?? null })
      const cutoff = songTimeSec - 12
      while (history.length && history[0].t < cutoff) history.shift()
    }, 80)
    return () => window.clearInterval(interval)
  }, [reference, rmsGate, currentTimeRef, transpositionRef])

  return { lastPitchRef, pitchHistoryRef }
}

export { useKaraokePitchHistory }
