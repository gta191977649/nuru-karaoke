import { buildUrl } from './api.js'

async function addFavorite(songCode, accessToken) {
  if (!songCode) throw new Error('Song code required')
  const response = await fetch(buildUrl('/api/user/favorites'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ song: songCode }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || 'Failed to add favorite')
  }
  return response.json()
}

export { addFavorite }
