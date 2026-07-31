import { synthEngine } from './SynthEngine.js'
import { getSettingsStoreState } from '../state/settingsStore.js'

async function enqueueSongAndPlay(song) {
  if (!song) return
  const queuedSong = song.guideMelodyEnabled == null
    ? {
      ...song,
      guideMelodyEnabled: getSettingsStoreState().guideMelodyEnabled,
    }
    : song
  await synthEngine.resumeAudio()
  synthEngine.enqueueSong(queuedSong)
  synthEngine.clearPendingSong()
  await synthEngine.playQueueIfIdle()
}

function clearQueue() {
  synthEngine.clearQueue()
}

function removeFromQueue(index) {
  synthEngine.removeFromQueue(index)
}

function bumpQueueNext(index) {
  synthEngine.bumpQueueNext(index)
}

function setPendingSong(song) {
  synthEngine.setPendingSong(song)
}

export { enqueueSongAndPlay, clearQueue, removeFromQueue, bumpQueueNext, setPendingSong }
