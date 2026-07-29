import { buildUrl } from './api.js'
import { SCORING_ALGORITHM_VERSION } from '../karaoke/scoring/SimpleScoreCalculator.js'

async function fetchLeaderboard(songCode, options = {}) {
  if (!songCode) {
    return { song: null, limit: 0, results: [] }
  }
  const params = new URLSearchParams({ song: songCode })
  const version = options.version === undefined ? SCORING_ALGORITHM_VERSION : options.version
  if (version !== null) params.set('version', String(version))
  const response = await fetch(buildUrl(`/api/leaderboard?${params.toString()}`), {
    method: 'GET',
    signal: options.signal,
  })
  if (!response.ok) {
    throw new Error(`Failed to load leaderboard (${response.status})`)
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await response.text()
    throw new Error(`Unexpected response for leaderboard API. ${text.slice(0, 120)}`)
  }
  return response.json()
}

export { fetchLeaderboard }
