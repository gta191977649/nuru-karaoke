import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchLeaderboard } from './leaderboard.js'

describe('fetchLeaderboard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('queries only the current scoring-version leaderboard by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ results: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchLeaderboard('song id')

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('song')).toBe('song id')
    expect(url.searchParams.get('version')).toBe('pitch-v11-log-duration-tolerance')
  })

  it('can explicitly request the compatible unversioned view', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ results: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchLeaderboard('legacy', { version: null })

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.has('version')).toBe(false)
  })
})
