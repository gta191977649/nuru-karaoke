import { buildUrl } from './api.js'

async function fetchSongs(options = {}) {
  const params = new URLSearchParams()
  if (options.q) params.set('q', options.q)
  if (options.tag) params.set('tag', options.tag)
  if (options.language) params.set('language', options.language)
  if (options.page) params.set('page', String(options.page))
  if (options.pageSize) params.set('page_size', String(options.pageSize))
  const query = params.toString()
  const path = query ? `/api/songs?${query}` : '/api/songs'

  const response = await fetch(buildUrl(path), {
    method: 'GET',
    signal: options.signal,
  })
  if (!response.ok) {
    throw new Error(`Failed to load songs (${response.status})`)
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await response.text()
    throw new Error(`Unexpected response for songs API. ${text.slice(0, 120)}`)
  }
  const data = await response.json()
  if (Array.isArray(data)) {
    return { items: data, count: data.length, next: null, previous: null }
  }
  if (Array.isArray(data?.results)) {
    return { items: data.results, count: data.count ?? data.results.length, next: data.next, previous: data.previous }
  }
  return { items: [], count: 0, next: null, previous: null }
}

async function fetchTags(options = {}) {
  const response = await fetch(buildUrl('/api/tags'), {
    method: 'GET',
    signal: options.signal,
  })
  if (!response.ok) {
    throw new Error(`Failed to load tags (${response.status})`)
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await response.text()
    throw new Error(`Unexpected response for tags API. ${text.slice(0, 120)}`)
  }
  const data = await response.json()
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  return []
}

export { fetchSongs, fetchTags }
