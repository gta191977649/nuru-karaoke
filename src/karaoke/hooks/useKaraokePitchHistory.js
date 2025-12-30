import { useEffect, useRef } from 'react'
import { getTargetMidiAtTime } from '../../engine/audio/midi/referenceMelody.js'

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

  useEffect(() => {
    pitchHistoryRef.current = []
    lastPitchRef.current = null
  }, [resetKey])

  useEffect(() => {
    const unsubscribe = pitchEngine.onPitch((result) => {
      lastPitchRef.current = result
    })
    return () => unsubscribe()
  }, [pitchEngine])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const songTimeSec = currentTimeRef.current
      const rawTargetMidi = reference ? getTargetMidiAtTime(reference, songTimeSec) : null
      const transposedTargetMidi =
        rawTargetMidi != null ? rawTargetMidi + transpositionRef.current : null
      const last = lastPitchRef.current
      const userMidi =
        Number.isFinite(last?.midi) && Number.isFinite(last?.rms) && last.rms >= rmsGate
          ? Number(last.midi)
          : null
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
