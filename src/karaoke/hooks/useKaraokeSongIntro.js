import { useEffect, useState } from 'react'
import { useKaraokeStore } from '../../state/karaokeStore.js'

function useKaraokeSongIntro({ midiUrl, midiName, queue, queueIndex, transposition, showKeyChangeAlert }) {
  const [showSongInfo, setShowSongInfo] = useState(false)
  const [songInfo, setSongInfo] = useState({ title: '', artist: '' })
  const lastIntroMidiUrl = useKaraokeStore((state) => state.lastIntroMidiUrl)
  const setLastIntroMidiUrl = useKaraokeStore((state) => state.setLastIntroMidiUrl)

  useEffect(() => {
    if (!midiUrl) return
    if (midiUrl === lastIntroMidiUrl) return

    const currentSong = queueIndex >= 0 ? queue?.[queueIndex] : null
    const title = currentSong?.title || midiName || ''
    if (!title) return

    setLastIntroMidiUrl(midiUrl)
    setSongInfo({ title, artist: currentSong?.artist || '' })
    if (showKeyChangeAlert) showKeyChangeAlert(transposition ?? 0, 5000)
    setShowSongInfo(true)

    const timer = setTimeout(() => setShowSongInfo(false), 5000)
    // return () => clearTimeout(timer)
  }, [
    midiUrl,
    midiName,
    queue,
    queueIndex,
    transposition,
    showKeyChangeAlert,
    lastIntroMidiUrl,
    setLastIntroMidiUrl,
  ])

  return { showSongInfo, songInfo }
}

export { useKaraokeSongIntro }
