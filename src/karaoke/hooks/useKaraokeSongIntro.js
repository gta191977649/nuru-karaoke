import { useEffect, useRef, useState } from 'react'

function useKaraokeSongIntro({ midiUrl, midiName, queue, queueIndex, transposition, showKeyChangeAlert }) {
  const [showSongInfo, setShowSongInfo] = useState(false)
  const [songInfo, setSongInfo] = useState({ title: '', artist: '' })
  const lastMidiUrlRef = useRef('')

  useEffect(() => {
    if (!midiUrl) return
    if (midiUrl === lastMidiUrlRef.current) return

    const currentSong = queueIndex >= 0 ? queue?.[queueIndex] : null
    const title = currentSong?.title || midiName || ''
    if (!title) return

    lastMidiUrlRef.current = midiUrl
    setSongInfo({ title, artist: currentSong?.artist || '' })
    if (showKeyChangeAlert) showKeyChangeAlert(transposition ?? 0, 5000)
    setShowSongInfo(true)

    const timer = setTimeout(() => setShowSongInfo(false), 5000)
    return () => clearTimeout(timer)
  }, [midiUrl, midiName, queue, queueIndex, transposition, showKeyChangeAlert])

  return { showSongInfo, songInfo }
}

export { useKaraokeSongIntro }
