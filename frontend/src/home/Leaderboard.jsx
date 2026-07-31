import { useEffect, useMemo, useState } from 'react'
import { Button, Col, Form, ListGroup, Row, Spinner } from 'react-bootstrap'
import { fetchSongs } from '../services/songLibrary.js'
import { fetchLeaderboard } from '../services/leaderboard.js'
import ArtistLink from '../components/ArtistLink.jsx'

function Leaderboard({ onBack }) {
  const [songs, setSongs] = useState([])
  const [songCode, setSongCode] = useState('')
  const [entries, setEntries] = useState([])
  const [isLoadingSongs, setIsLoadingSongs] = useState(false)
  const [isLoadingBoard, setIsLoadingBoard] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let didCancel = false

    setIsLoadingSongs(true)
    setLoadError('')
    fetchSongs({ signal: controller.signal, pageSize: 200 })
      .then((data) => {
        if (didCancel) return
        const list = Array.isArray(data?.items) ? data.items : []
        setSongs(list)
        if (!songCode && list.length) setSongCode(list[0].id)
      })
      .catch((err) => {
        if (didCancel) return
        setLoadError(err?.message || 'Failed to load songs.')
      })
      .finally(() => {
        if (didCancel) return
        setIsLoadingSongs(false)
      })

    return () => {
      didCancel = true
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (!songCode) {
      setEntries([])
      return undefined
    }
    const controller = new AbortController()
    let didCancel = false

    setIsLoadingBoard(true)
    setLoadError('')
    fetchLeaderboard(songCode, { signal: controller.signal })
      .then((data) => {
        if (didCancel) return
        setEntries(Array.isArray(data?.results) ? data.results : [])
      })
      .catch((err) => {
        if (didCancel) return
        setLoadError(err?.message || 'Failed to load leaderboard.')
      })
      .finally(() => {
        if (didCancel) return
        setIsLoadingBoard(false)
      })

    return () => {
      didCancel = true
      controller.abort()
    }
  }, [songCode])

  const selectedSong = useMemo(
    () => songs.find((song) => song.id === songCode),
    [songs, songCode],
  )

  return (
    <div className="wiiFind h-100 d-flex flex-column">
      <div className="wiiFind__header">
        <div className="wiiFind__hint">ランキング</div>
      </div>

      <Row className="g-3 flex-grow-1 overflow-hidden">
        <Col xs={12} className="d-flex flex-column h-100">
          <Row className="g-2 align-items-center">
            <Col xs={12} md={8}>
              <Form.Select
                value={songCode}
                onChange={(e) => setSongCode(e.target.value)}
                disabled={isLoadingSongs || !songs.length}
              >
                {songs.map((song) => (
                  <option key={song.id} value={song.id}>
                    {song.title} - {song.artist}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={12} md={4} className="d-flex gap-2 justify-content-md-end">
              <Button className="wiiBottomMini wiiBottomMini--dark" type="button" onClick={onBack}>
                Back
              </Button>
            </Col>
          </Row>

          {selectedSong ? (
            <div className="text-muted small mt-2">
              {selectedSong.title} / <ArtistLink artist={selectedSong.artist} />
            </div>
          ) : null}

          {isLoadingSongs || isLoadingBoard ? (
            <div className="text-muted small mt-2 d-flex align-items-center gap-2">
              <Spinner animation="border" size="sm" />
              Loading leaderboard…
            </div>
          ) : null}
          {loadError ? <div className="text-danger small mt-2">{loadError}</div> : null}

          <ListGroup className="mt-3">
            {entries.length ? (
              entries.map((entry) => (
                <ListGroup.Item key={`${entry.username}-${entry.rank}`} className="d-flex align-items-center gap-3">
                  <div className="fw-semibold">#{entry.rank}</div>
                  <div className="flex-grow-1">
                    <div className="fw-semibold">{entry.username}</div>
                    <div className="text-muted small">
                      Score {entry.score}
                      {entry.accuracy != null ? ` · Acc ${entry.accuracy}` : ''}
                      {entry.max_combo != null ? ` · Combo ${entry.max_combo}` : ''}
                    </div>
                  </div>
                </ListGroup.Item>
              ))
            ) : (
              <ListGroup.Item className="text-muted">No results</ListGroup.Item>
            )}
          </ListGroup>
        </Col>
      </Row>
    </div>
  )
}

export default Leaderboard
