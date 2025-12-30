function selectReservedQueue(state) {
  const queue = state?.queue || []
  return queue.map((song, idx) => ({ song, idx }))
}

function selectHistory(state) {
  return state?.history || []
}

function selectCurrentSong(state) {
  const queue = state?.queue || []
  const index = Number.isInteger(state?.queueIndex) ? state.queueIndex : -1
  if (index < 0 || index >= queue.length) return null
  return queue[index]
}

export { selectReservedQueue, selectHistory, selectCurrentSong }
