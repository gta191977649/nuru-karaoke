import { useEffect, useRef, useState } from 'react'
import { useKaraokeStore } from '../../state/karaokeStore.js'

function useKaraokeSongIntro({
  midiUrl,
  midiName,
  queue,
  queueIndex,
  playbackSessionId,
  transposition,
  showKeyChangeAlert,
  reference,
  currentTime = 0
}) {
  const [showSongInfo, setShowSongInfo] = useState(false)
  const [songInfo, setSongInfo] = useState({ title: '', artist: '', code: '' })
  const lastIntroMidiUrl = useKaraokeStore((state) => state.lastIntroMidiUrl)
  const setLastIntroMidiUrl = useKaraokeStore((state) => state.setLastIntroMidiUrl)
  const introTimerRef = useRef(null)

  const currentSong = queueIndex >= 0 ? queue?.[queueIndex] : null
  const title = currentSong?.title || midiName || ''
  const artist = currentSong?.artist || ''
  const code = currentSong?.id || currentSong?.code || ''
  const introKey = midiUrl || midiName
    ? `${playbackSessionId ?? 0}:${midiUrl || `${queueIndex ?? -1}:${midiName || ''}`}`
    : ''

  // Force hide if melody is visible (approaching within 3 seconds)
  useEffect(() => {
    if (!showSongInfo || !reference?.notes?.length) return
    const firstNoteTime = reference.notes[0].t0Sec
    // If first note is within 3 seconds (visible window roughly), hide intro
    if (firstNoteTime < currentTime + 3.0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (showSongInfo) setShowSongInfo(false)
    }
  }, [showSongInfo, reference, currentTime])

  // Keep the result-page metadata in sync independently from the intro timer.
  useEffect(() => {
    if (
      title &&
      (songInfo.title !== title || songInfo.artist !== artist || songInfo.code !== code)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSongInfo({ title, artist, code })
    }
  }, [artist, code, songInfo.artist, songInfo.code, songInfo.title, title])

  // Start the intro once per playback session. The timer is deliberately kept
  // outside this effect's cleanup so the store update below cannot cancel it.
  useEffect(() => {
    if (!introKey || !title || introKey === lastIntroMidiUrl) return

    setLastIntroMidiUrl(introKey)
    if (showKeyChangeAlert) showKeyChangeAlert(transposition ?? 0, 5000)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowSongInfo(true)

    if (introTimerRef.current) clearTimeout(introTimerRef.current)
    introTimerRef.current = setTimeout(() => {
      introTimerRef.current = null
      setShowSongInfo(false)
    }, 5000)
  }, [
    introKey,
    title,
    transposition,
    showKeyChangeAlert,
    lastIntroMidiUrl,
    setLastIntroMidiUrl,
  ])

  useEffect(() => () => {
    if (introTimerRef.current) clearTimeout(introTimerRef.current)
  }, [])

  return { showSongInfo, songInfo }
}

export { useKaraokeSongIntro }
