import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import useFavoriteStore from './favoriteStore.js'

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('favoriteStore', () => {
  beforeEach(() => {
    useFavoriteStore.getState().reset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads, adds, deduplicates, and removes favorite songs', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([
        {
          song_code: 'song-1',
          title: 'First Song',
          artist: 'First Artist',
          created_at: '2026-07-24T00:00:00Z',
        },
      ]))
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
    vi.stubGlobal('fetch', request)

    await useFavoriteStore.getState().load('access-token')
    expect(useFavoriteStore.getState().items).toHaveLength(1)

    const added = await useFavoriteStore.getState().add({
      id: 'song-2',
      title: 'Second Song',
      artist: 'Second Artist',
    }, 'access-token')
    expect(added).toBe(true)
    expect(useFavoriteStore.getState().items.map((item) => item.song_code)).toEqual([
      'song-2',
      'song-1',
    ])

    const duplicateAdded = await useFavoriteStore.getState().add({
      id: 'song-2',
      title: 'Second Song',
      artist: 'Second Artist',
    }, 'access-token')
    expect(duplicateAdded).toBe(false)
    expect(request).toHaveBeenCalledTimes(2)

    await useFavoriteStore.getState().remove('song-2', 'access-token')
    expect(useFavoriteStore.getState().items.map((item) => item.song_code)).toEqual(['song-1'])
    expect(request).toHaveBeenCalledTimes(3)
  })
})
