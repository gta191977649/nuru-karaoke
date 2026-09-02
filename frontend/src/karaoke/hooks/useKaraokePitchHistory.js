import { useEffect, useRef } from 'react'
import { getTargetNoteAtTick } from '../../engine/audio/midi/referenceMelody.js'
import { normalizePitchClass } from '../scoring/SimpleScoreCalculator.js'
import { resolveMicAlignedSongTime } from '../../engine/audio/micTiming.js'

function useKaraokePitchHistory({
  pitchEngine,
  reference,
  currentTimeRef,
  transpositionRef,
  rmsGate = 0,
  resetKey = '',
  microphoneLatencySec = 0,
}) {
  const lastPitchRef = useRef(null)
  const pitchHistoryRef = useRef([])
  const fullHistoryRef = useRef([])
  const framePitchHistoryRef = useRef([]) // short per-hop-ish buffer for stability metrics
  const lastHistoryTimeRef = useRef(null)

  useEffect(() => {
    pitchHistoryRef.current = []
    fullHistoryRef.current = []
    framePitchHistoryRef.current = []
    lastPitchRef.current = null
    lastHistoryTimeRef.current = null
  }, [resetKey])

  useEffect(() => {
    const unsubscribe = pitchEngine.onPitch((result) => {
      lastPitchRef.current = result

      const songTimeSec = resolveMicAlignedSongTime({
        pitch: result,
        songTimeSec: currentTimeRef.current,
        microphoneLatencySec,
        audioContext: pitchEngine.getAudioContext?.(),
      })
      if (!Number.isFinite(songTimeSec)) return

      // Short rolling buffer at detector rate (or close to it), for per-frame stability.
      {
        const tAcSec = Number.isFinite(result?.tAcSec) ? Number(result.tAcSec) : null
        const point = {
          t: songTimeSec,
          tAcSec,
          f0Hz: Number.isFinite(result?.f0Hz) ? Number(result.f0Hz) : null,
          rawF0Hz: Number.isFinite(result?.rawF0Hz) ? Number(result.rawF0Hz) : null,
          rawMidi: Number.isFinite(result?.rawMidi) ? Number(result.rawMidi) : null,
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

      const ref = reference
      const tick = ref?.getTickAtTime ? ref.getTickAtTime(songTimeSec) : songTimeSec
      const rawTargetNote = ref
        ? getTargetNoteAtTick(ref, tick)
        : null
      const rawTargetMidi = rawTargetNote ? rawTargetNote.midi : null
      const transposedTargetMidi =
        rawTargetMidi != null ? rawTargetMidi + transpositionRef.current : null

      const hasRms = Number.isFinite(result?.rms)
      const rmsOk = !hasRms || result.rms >= rmsGate
      const rawUserMidi =
        Number.isFinite(result?.rawMidi) && rmsOk
          ? Number(result.rawMidi)
          : null
      const normalized = normalizePitchClass(rawUserMidi, transposedTargetMidi)
      const userMidi = normalized.normalizedMidi

      const history = pitchHistoryRef.current
      const point = {
        t: songTimeSec,
        userMidi,
        rawMidi: rawUserMidi,
        octaveFoldSemitones: normalized.octaveFoldSemitones,
        targetMidi: transposedTargetMidi,
        rms: result?.rms ?? null,
        f0Hz: Number.isFinite(result?.rawF0Hz) ? Number(result.rawF0Hz) : null,
        rawF0Hz: Number.isFinite(result?.rawF0Hz) ? Number(result.rawF0Hz) : null,
        confidence: Number.isFinite(result?.confidence) ? Number(result.confidence) : 0,
      }
      history.push(point)
      fullHistoryRef.current.push(point)
      const cutoff = songTimeSec - 12
      while (history.length && history[0].t < cutoff) history.shift()
    })
    return () => unsubscribe()
  }, [pitchEngine, reference, rmsGate, currentTimeRef, transpositionRef, microphoneLatencySec])

  return { lastPitchRef, pitchHistoryRef, fullHistoryRef, framePitchHistoryRef }
}

export { useKaraokePitchHistory }
