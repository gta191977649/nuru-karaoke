import { Assets, Sprite, Texture, VideoSource } from 'pixi.js'
import backgroundUrl from '../../assets/bg/bg2.jpg'
import { coverSize } from './singingLayout.js'

const videoUrls = Object.values(import.meta.glob(
  ['../../assets/bg_video/*.mp4', '../../assets/bg_video/*.mov'],
  { eager: true, import: 'default', query: '?url' },
))
export function createBackground(parent) {
  const photo = new Sprite()
  const movie = new Sprite()
  movie.visible = false
  parent.addChild(photo, movie)
  let disposed = false
  let enabled = false
  let video = null
  let texture = null
  let remaining = []
  let failed = new Set()
  let previous = ''
  let size = { width: 1, height: 1 }
  let advanceTimer
  const fit = () => {
    for (const sprite of [photo, movie]) {
      const source = sprite.texture.source
      if (source.width <= 1 || source.height <= 1) continue
      const cover = coverSize(source.width, source.height, size.width, size.height)
      sprite.width = cover.width
      sprite.height = cover.height
      // CSS background-position defaults to 0 0; video object-position is 50%.
      sprite.position.set(sprite === movie ? (size.width - cover.width) / 2 : 0, sprite === movie ? (size.height - cover.height) / 2 : 0)
    }
  }
  Assets.load(backgroundUrl).then((asset) => {
    if (disposed) return
    photo.texture = asset
    fit()
  }).catch((error) => console.error('Background image failed', error))
  const stop = () => {
    clearTimeout(advanceTimer)
    if (video) {
      video.onended = video.onerror = video.onloadeddata = null
      video.pause()
    }
    movie.visible = false
    movie.texture = Texture.EMPTY
    texture?.destroy(true)
    texture = null
    if (video) {
      video.removeAttribute('src')
      video.load()
      video = null
    }
  }
  const next = () => {
    stop()
    if (!enabled || disposed) return
    if (!remaining.length) {
      remaining = videoUrls.filter((url) => !failed.has(url))
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[remaining[i], remaining[j]] = [remaining[j], remaining[i]]
      }
      if (remaining.length > 1 && remaining[0] === previous) remaining.push(remaining.shift())
    }
    const url = remaining.shift()
    if (!url) return // All formats failed: retain the background image.
    previous = url
    video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = url
    video.onended = next
    video.onerror = () => {
      failed.add(url)
      remaining = remaining.filter((item) => item !== url)
      advanceTimer = setTimeout(next, 0)
    }
    const currentVideo = video
    video.onloadeddata = () => {
      if (disposed || !enabled || video !== currentVideo || texture) return
      // Native requestVideoFrameCallback updates only when a decoded frame arrives.
      const source = new VideoSource({ resource: video, autoLoad: false, autoPlay: false })
      texture = new Texture({ source })
      movie.texture = texture
      source.load().then(() => {
        if (disposed || texture?.source !== source) return
        movie.visible = true
        fit()
      }).catch(() => { if (video === currentVideo) video.onerror?.() })
      video.play().catch(() => { /* A later visibility/user event can resume playback. */ })
    }
    video.load()
  }
  const visibility = () => {
    if (document.hidden) video?.pause()
    else if (enabled) video?.play().catch(() => {})
  }
  document.addEventListener('visibilitychange', visibility)
  return {
    resize(width, height) { size = { width, height }; fit() },
    setEnabled(value) {
      if (value === enabled) return
      enabled = value
      if (value) { failed = new Set(); next() } else stop()
    },
    destroy() { disposed = true; enabled = false; stop(); document.removeEventListener('visibilitychange', visibility) },
  }
}

