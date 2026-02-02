import React, { useEffect, useState } from 'react'
import { Button, Row, Col, Form, Spinner } from 'react-bootstrap'
import { fetchSongs } from '../services/songLibrary.js'
import ConnectionAlert from '../components/ConnectionAlert.jsx'
import { enqueueSongAndPlay } from '../engine/playerController.js'
import useAlertStore from '../state/alertStore.js'

function FindSongKeywords({ onBack, onSelectSong, onConfirm }) {
    const showAlert = useAlertStore((state) => state.showAlert)
    const [term, setTerm] = useState('')
    const [results, setResults] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [alertOpen, setAlertOpen] = useState(false)
    const [connectionStatus, setConnectionStatus] = useState('loading')
    const [connectionMessage, setConnectionMessage] = useState('')

    const buildNetworkMessage = (error) => String(error?.message || 'Unknown error')

    const handleReserve = async (song) => {
        if (!song) return
        setAlertOpen(true)
        setConnectionStatus('loading')
        setConnectionMessage('サーバーに接続中...')
        try {
            await enqueueSongAndPlay(song)
            setConnectionStatus('success')
            setConnectionMessage('接続完了。曲を読み込みました。')
            showAlert({
                message: `${song.title} を予約しました`,
                variant: 'success',
                timeoutMs: 2500,
            })
            setTimeout(() => {
                setAlertOpen(false)
                if (onConfirm) onConfirm()
            }, 600)
        } catch (error) {
            setConnectionStatus('error')
            const message = buildNetworkMessage(error)
            setConnectionMessage(message)
            showAlert({
                message,
                variant: 'danger',
                timeoutMs: 3500,
            })
        }
    }

    useEffect(() => {
        const controller = new AbortController()
        let didCancel = false

        setLoadError('')
        fetchSongs({
            q: term,
            signal: controller.signal,
        })
            .then((items) => {
                if (didCancel) return
                setResults(Array.isArray(items) ? items : [])
            })
            .catch((err) => {
                if (didCancel) return
                setLoadError(err?.message || 'Failed to load songs.')
            })
            .finally(() => {
                if (didCancel) return
                setIsLoading(false)
            })

        return () => {
            didCancel = true
            controller.abort()
        }
    }, [term])

    return (
        <div className="wiiFind h-100 d-flex flex-column">

            {/* Main Content */}
            <Row className="g-3 flex-grow-1 overflow-hidden">
                <Col xs={12} className="d-flex flex-column h-100">
                    <div className="wiiFind__hint mb-2">キーワードを入力して楽曲やアーティストを検索します。</div>

                    {/* Search Bar */}
                    <div className="wiiFind__inputRow">
                        <Form.Control
                            className="wiiFind__input"
                            value={term}
                            onChange={(e) => {
                                setTerm(e.target.value)
                                setIsLoading(true)
                            }}
                            placeholder="Enter keyword"
                        />
                        <Button className="wiiFind__delete" onClick={() => setTerm('')}>
                            <span className="wiiFind__deleteX">×</span>
                            Delete
                        </Button>
                    </div>
                    {isLoading ? (
                        <div className="text-muted small mt-2 d-flex align-items-center gap-2">
                            <Spinner animation="border" size="sm" />
                            Loading songs…
                        </div>
                    ) : null}
                    {loadError ? <div className="text-danger small mt-2">{loadError}</div> : null}

                    {/* Results List */}
                    <div className="wiiList">
                        {results.length ? (
                            results.map((song) => (
                                <div
                                    key={song.id}
                                    className="wiiList__item"
                                    onClick={() => onSelectSong && onSelectSong(song)}
                                    role="button"
                                >
                                    <div className="wiiList__iconBadgeContainer">
                                        {song.tags?.length ? (
                                            <div className="wiiList__iconBadge wiiList__iconBadge--original">
                                                {song.tags[0]}
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="wiiList__title">{song.title}</div>
                                    <div className="wiiList__artist">{song.artist}</div>

                                    <div className="d-flex gap-2 ms-auto">
                                        <Button
                                            className="wiiList__actionBtn"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                // TODO: Implement My Song logic
                                            }}
                                        >
                                            <span className="me-1 text-warning" style={{ textShadow: '0 1px 0 rgba(0,0,0,0.2)' }}>★</span>
                                            マイうた
                                        </Button>
                                        <Button
                                            className="wiiList__actionBtn wiiList__actionBtn--reserve"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleReserve(song)
                                            }}
                                        >
                                            予約
                                        </Button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="wiiList__empty text-muted">No results</div>
                        )}
                    </div>
                </Col>
            </Row>

            <ConnectionAlert
                isOpen={alertOpen}
                status={connectionStatus}
                message={connectionMessage}
                onClose={() => setAlertOpen(false)}
            />
        </div>
    )
}

export default FindSongKeywords
