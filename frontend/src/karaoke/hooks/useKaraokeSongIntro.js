import { useEffect, useState } from 'react'
import { useKaraokeStore } from '../../state/karaokeStore.js'

function useKaraokeSongIntro({
  midiUrl,
  midiName,
  queue,
  queueIndex,
  transposition,
  showKeyChangeAlert,
  reference,
  currentTime = 0
}) {
  const [showSongInfo, setShowSongInfo] = useState(false)
  const [songInfo, setSongInfo] = useState({ title: '', artist: '', code: '' })
  const lastIntroMidiUrl = useKaraokeStore((state) => state.lastIntroMidiUrl)
  const setLastIntroMidiUrl = useKaraokeStore((state) => state.setLastIntroMidiUrl)

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

  useEffect(() => {
    if (!midiUrl && !midiName) return

    const currentSong = queueIndex >= 0 ? queue?.[queueIndex] : null
    const title = currentSong?.title || midiName || ''

    // Always update song info so it's available for ResultsPage
    const nextCode = currentSong?.id || currentSong?.code || ''
    if (
      title &&
      (songInfo.title !== title || songInfo.artist !== (currentSong?.artist || '') || songInfo.code !== nextCode)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSongInfo({ title, artist: currentSong?.artist || '', code: nextCode })
    }

    // Only trigger the intro animation if it's a new song load
    const introKey = midiUrl || `${queueIndex ?? -1}:${midiName || ''}`
    if (introKey === lastIntroMidiUrl) return
    if (!title) return

    setLastIntroMidiUrl(introKey)
    if (showKeyChangeAlert) showKeyChangeAlert(transposition ?? 0, 5000)
    setShowSongInfo(true)

    const timer = setTimeout(() => setShowSongInfo(false), 5000)
    return () => clearTimeout(timer)
  }, [
    midiUrl,
    midiName,
    queue,
    queueIndex,
    transposition,
    showKeyChangeAlert,
    lastIntroMidiUrl,
    setLastIntroMidiUrl,
    songInfo.artist,
    songInfo.title,
    songInfo.code
  ])

  return { showSongInfo, songInfo }
}

export { useKaraokeSongIntro }
