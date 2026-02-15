import { buildUrl } from './api.js'

async function fetchLeaderboard(songCode, options = {}) {
  if (!songCode) {
    return { song: null, limit: 0, results: [] }
  }
  const response = await fetch(buildUrl(`/api/leaderboard?song=${encodeURIComponent(songCode)}`), {
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
