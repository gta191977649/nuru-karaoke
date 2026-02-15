import { buildUrl } from './api.js'

async function submitScore(payload, accessToken) {
  const response = await fetch(buildUrl('/api/scores'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Failed to submit score (${response.status})`)
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return { status: 'ok' }
  }
  return response.json()
}

export { submitScore }
