import { useEffect, useMemo, useState } from 'react'
import { Button, Col, Form, Row, Stack } from 'react-bootstrap'

import { fetchSongs } from '../services/songLibrary.js'
import useUiStore from '../state/uiStore.js'


const KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
]

function normalize(text) {
  return String(text ?? '').trim().toLowerCase()
}

function FindSongs({ initialMode = 'title', onBack, onSelectSong }) {
  const openArtist = useUiStore((state) => state.openArtist)
  const [term, setTerm] = useState(initialMode === 'artist' ? '' : 'Pretender')
  const [isComposing, setIsComposing] = useState(false)
  const [mode, setMode] = useState(initialMode) // 'title' | 'artist'
  const [songs, setSongs] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const q = term.trim()
    if (!q) {
      const emptyTimer = window.setTimeout(() => {
        setSongs([])
        setIsLoading(false)
        setLoadError('')
      }, 0)
      return () => window.clearTimeout(emptyTimer)
    }

    const controller = new AbortController()
    let didCancel = false
    const timer = window.setTimeout(() => {
      setIsLoading(true)
      setLoadError('')
      fetchSongs({
        signal: controller.signal,
        pageSize: 50,
        artistQ: mode === 'artist' ? q : undefined,
        titleQ: mode === 'title' ? q : undefined,
      })
        .then((data) => {
          if (didCancel) return
          setSongs(Array.isArray(data?.items) ? data.items : [])
        })
        .catch((err) => {
          if (didCancel) return
          setLoadError(err?.message || 'Failed to load songs.')
        })
        .finally(() => {
          if (didCancel) return
          setIsLoading(false)
        })
    }, 180)

    return () => {
      didCancel = true
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [mode, term])

  const suggestions = useMemo(() => {
    const q = normalize(term)
    if (!q) return []
    const matches = songs.filter((song) => {
      const haystack = mode === 'artist' ? song.artist : song.title
      return normalize(haystack).includes(q)
    })
    if (mode === 'artist') {
      return [...new Map(matches.map((song) => [normalize(song.artist), song])).values()].slice(0, 3)
    }
    return matches.slice(0, 3)
  }, [mode, songs, term])

  return (
    <div className="wiiFind">
      <div className="wiiFind__header">
        <div className="wiiFind__hint">Enter a search term to find an original artist or song.</div>
        {isLoading ? <div className="wiiFind__hint text-muted">Loading songs…</div> : null}
        {loadError ? <div className="wiiFind__hint text-danger">{loadError}</div> : null}
      </div>

      <Row className="g-3">
        <Col xs={12} lg={9}>
          <div className="wiiFind__inputRow">
            <Form.Control
              className="wiiFind__input"
              value={term}
              onChange={(e) => {
                if (isComposing) {
                  setTerm(e.target.value)
                  return
                }
                setTerm(e.target.value.toUpperCase())
              }}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={(e) => {
                setIsComposing(false)
                setTerm(e.target.value)
              }}
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              className="wiiFind__delete"
              type="button"
              onClick={() => setTerm((t) => (t.length ? t.slice(0, -1) : t))}
              aria-label="Delete"
            >
              <span className="wiiFind__deleteX" aria-hidden="true">
                ×
              </span>
              Delete
            </Button>
          </div>

          <div className="wiiKeyboard" role="group" aria-label="On-screen keyboard">
            <Stack gap={2}>
              {KEYBOARD_ROWS.map((row, idx) => (
                <div className="wiiKeyboard__row" key={idx}>
                  {row.map((key) => (
                    <Button
                      key={key}
                      className="wiiKey"
                      type="button"
                      onClick={() => setTerm((t) => `${t}${key}`)}
                    >
                      {key}
                    </Button>
                  ))}
                </div>
              ))}
              <Button className="wiiKey wiiKey--space" type="button" onClick={() => setTerm((t) => `${t} `)}>
                Space
              </Button>
            </Stack>
          </div>

          <Row className="g-3 mt-2">
            <Col xs={12} md={6}>
              <Button className="wiiSearchBtn wiiSearchBtn--artist w-100" type="button" onClick={() => setMode('artist')}>
                <span className="wiiSearchBtn__icon" aria-hidden="true" />
                <span className="wiiSearchBtn__label">Search Artist</span>
              </Button>
            </Col>
            <Col xs={12} md={6}>
              <Button className="wiiSearchBtn wiiSearchBtn--title w-100" type="button" onClick={() => setMode('title')}>
                <span className="wiiSearchBtn__icon wiiSearchBtn__icon--note" aria-hidden="true" />
                <span className="wiiSearchBtn__label">Search Title</span>
              </Button>
            </Col>
          </Row>
        </Col>

        <Col xs={12} lg={3}>
          <div className="wiiSuggest">
            <div className="wiiSuggest__title">もしかして...</div>
            <Stack gap={2}>
              {suggestions.length ? (
                suggestions.map((song) => (
                  <Button
                    key={`${song.artist}-${song.title}`}
                    className="wiiSuggest__item"
                    type="button"
                    onClick={() => {
                      if (mode === 'artist') {
                        openArtist(song.artist)
                        return
                      }
                      if (onSelectSong) onSelectSong(song)
                      else setTerm((mode === 'artist' ? song.artist : song.title).toUpperCase())
                    }}
                    title={mode === 'artist' ? song.artist : song.title}
                  >
                    <span className="wiiSuggest__note" aria-hidden="true">
                      ♪
                    </span>
                    <span className="wiiSuggest__text">{mode === 'artist' ? song.artist : song.title}</span>
                  </Button>
                ))
              ) : (
                <div className="wiiSuggest__empty">Type to see suggestions</div>
              )}
            </Stack>
          </div>
        </Col>
      </Row>

      <div className="wiiFind__bottom">
        <div className="wiiFind__bottomLeft">
          <Button className="wiiBottomMini wiiBottomMini--dark" type="button" onClick={onBack}>
            Back
          </Button>
          <Button className="wiiBottomMini wiiBottomMini--dark" type="button" onClick={onBack}>
            Main Menu
          </Button>
        </div>

      </div>
    </div>
  )
}

export default FindSongs
