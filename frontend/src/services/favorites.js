import { buildUrl } from './api.js'

async function parseError(response, fallbackMessage) {
  const text = await response.text()
  if (!text) return fallbackMessage
  try {
    const data = JSON.parse(text)
    return data?.detail || Object.values(data).flat().join(' / ') || fallbackMessage
  } catch {
    return text
  }
}

async function fetchFavorites(accessToken, options = {}) {
  if (!accessToken) throw new Error('Authentication required')
  const response = await fetch(buildUrl('/api/user/favorites'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: options.signal,
  })
  if (!response.ok) {
    throw new Error(await parseError(response, 'Failed to load favorites'))
  }
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

async function addFavorite(songCode, accessToken) {
  if (!songCode) throw new Error('Song code required')
  if (!accessToken) throw new Error('Authentication required')
  const response = await fetch(buildUrl('/api/user/favorites'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ song: songCode }),
  })
  if (!response.ok) {
    throw new Error(await parseError(response, 'Failed to add favorite'))
  }
  return response.json()
}

async function removeFavorite(songCode, accessToken) {
  if (!songCode) throw new Error('Song code required')
  if (!accessToken) throw new Error('Authentication required')
  const response = await fetch(buildUrl(`/api/user/favorites/${encodeURIComponent(songCode)}`), {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!response.ok) {
    throw new Error(await parseError(response, 'Failed to remove favorite'))
  }
  return response.json()
}

export { addFavorite, fetchFavorites, removeFavorite }
