import { useEffect, useState } from 'react'
import { useKaraokeStore } from '../../state/karaokeStore.js'
import { UI_CONFIG } from '../../config.js'
import { hasVisibleMelodyGuideNote } from '../songIntroVisibility.js'

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

  const currentSong = queueIndex >= 0 ? queue?.[queueIndex] : null
  const title = currentSong?.title || midiName || ''
  const artist = currentSong?.artist || ''
  const code = currentSong?.id || currentSong?.code || ''
  const introKey = midiUrl || midiName
    ? `${playbackSessionId ?? 0}:${midiUrl || `${queueIndex ?? -1}:${midiName || ''}`}`
    : ''

  // Start the cross-fade only when a note actually enters the same visible
  // time window used by MelodyGuideCanvas.
  useEffect(() => {
    if (!showSongInfo || !reference?.notes?.length) return
    if (hasVisibleMelodyGuideNote(
      reference.notes,
      currentTime,
      UI_CONFIG.melodyGuideWindowSec,
      UI_CONFIG.melodyGuidePlayheadRatio,
    )) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowSongInfo(false)
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

  // Start the intro once per playback session. Its end is controlled by the
  // first note entering the Melody Guide rather than a fixed timeout.
  useEffect(() => {
    if (!introKey || !title || introKey === lastIntroMidiUrl) return

    setLastIntroMidiUrl(introKey)
    if (showKeyChangeAlert) showKeyChangeAlert(transposition ?? 0, 5000)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowSongInfo(true)

  }, [
    introKey,
    title,
    transposition,
    showKeyChangeAlert,
    lastIntroMidiUrl,
    setLastIntroMidiUrl,
  ])

  return { showSongInfo, songInfo }
}

export { useKaraokeSongIntro }
