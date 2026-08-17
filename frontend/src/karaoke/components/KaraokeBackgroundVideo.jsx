import { useCallback, useRef, useState } from 'react'

const videoModules = import.meta.glob(
  ['../../assets/bg_video/*.mp4', '../../assets/bg_video/*.mov'],
  { eager: true, import: 'default', query: '?url' },
)

const backgroundVideoUrls = Object.values(videoModules)

function shuffleVideos(videos, previousUrl = '') {
  const shuffled = [...videos]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]]
  }

  if (shuffled.length > 1 && shuffled[0] === previousUrl) {
    ;[shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]]
  }
  return shuffled
}

function KaraokeBackgroundVideo() {
  const [playlist, setPlaylist] = useState(() => shuffleVideos(backgroundVideoUrls))
  const [videoIndex, setVideoIndex] = useState(0)
  const advancingRef = useRef(false)

  const playNext = useCallback(() => {
    if (advancingRef.current || playlist.length === 0) return
    advancingRef.current = true

    if (videoIndex + 1 < playlist.length) {
      setVideoIndex((index) => index + 1)
    } else {
      const nextPlaylist = shuffleVideos(playlist, playlist[videoIndex])
      setPlaylist(nextPlaylist)
      setVideoIndex(0)
    }

    window.setTimeout(() => {
      advancingRef.current = false
    }, 0)
  }, [playlist, videoIndex])

  if (playlist.length === 0) return null

  return (
    <video
      key={playlist[videoIndex]}
      className="karaokeBackgroundVideo"
      src={playlist[videoIndex]}
      autoPlay
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      onEnded={playNext}
      onError={playNext}
    />
  )
}

export default KaraokeBackgroundVideo
