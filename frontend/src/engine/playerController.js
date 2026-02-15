import { synthEngine } from './SynthEngine.js'

async function enqueueSongAndPlay(song) {
  if (!song) return
  await synthEngine.resumeAudio()
  synthEngine.enqueueSong(song)
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
