import { useEffect, useMemo } from 'react'
import { useKaraokeStore } from '../../state/karaokeStore.js'
import { UI_CONFIG } from '../../config.js'
import { shouldShowSongIntro } from '../songIntroVisibility.js'

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
  const lastIntroMidiUrl = useKaraokeStore((state) => state.lastIntroMidiUrl)
  const setLastIntroMidiUrl = useKaraokeStore((state) => state.setLastIntroMidiUrl)

  const currentSong = queueIndex >= 0 ? queue?.[queueIndex] : null
  const title = currentSong?.title || midiName || ''
  const artist = currentSong?.artist || ''
  const code = currentSong?.id || currentSong?.code || ''
  const introKey = midiUrl || midiName
    ? `${playbackSessionId ?? 0}:${midiUrl || `${queueIndex ?? -1}:${midiName || ''}`}`
    : ''

  const songInfo = useMemo(() => ({ title, artist, code }), [title, artist, code])
  const showSongInfo = Boolean(title) && shouldShowSongIntro(
    reference?.notes, currentTime,
    UI_CONFIG.melodyGuideWindowSec, UI_CONFIG.melodyGuidePlayheadRatio,
  )

  // Announce the key once per session; title visibility follows transport time.
  useEffect(() => {
    if (!introKey || !title || introKey === lastIntroMidiUrl) return

    setLastIntroMidiUrl(introKey)
    if (showKeyChangeAlert) showKeyChangeAlert(transposition ?? 0, 5000)

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
