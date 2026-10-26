const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const ease = (n) => n * n * (3 - 2 * n)

export function createScoreAnimation() {
  let shown = 0, pending = 0, start = null, turn = 0, lastKey = 0, revealed = false
  return {
    update(state, now) {
      const ready = Boolean(state.liveScoreReady)
      if (ready && state.scoreUpdateKey !== lastKey) {
        lastKey = state.scoreUpdateKey
        pending = Math.max(pending, clamp(Number(state.liveScore) || 0, 0, 100))
      }
      if (start === null && pending > shown + 0.001) { start = now; revealed = false }
      let rotation = turn
      if (start !== null) {
        const elapsed = now - start
        if (elapsed < 1000) rotation += ease(elapsed / 1000) * Math.PI / 2
        else if (elapsed < 3000) rotation += Math.PI / 2
        else {
          if (!revealed) { shown = Math.max(shown, pending); pending = 0; revealed = true }
          rotation += Math.PI / 2 + ease(clamp((elapsed - 3000) / 1000, 0, 1)) * Math.PI / 2
          if (elapsed >= 7000) { turn += Math.PI; start = null; rotation = turn }
        }
      }
      return { score: shown, ready, rotation }
    },
  }
}
