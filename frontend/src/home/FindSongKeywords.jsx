import React, { useEffect, useMemo, useState } from 'react'
import { Button, Row, Col, Form, Spinner } from 'react-bootstrap'
import { fetchSongs, fetchTags } from '../services/songLibrary.js'
import ConnectionAlert from '../components/ConnectionAlert.jsx'
import { enqueueSongAndPlay } from '../engine/playerController.js'
import useAlertStore from '../state/alertStore.js'
import useFavoriteStore from '../state/favoriteStore.js'
import useUserStore from '../state/userStore.js'
import ArtistLink from '../components/ArtistLink.jsx'

function FindSongKeywords({ onBack, onSelectSong, onConfirm }) {
    const showAlert = useAlertStore((state) => state.showAlert)
    const authStatus = useUserStore((state) => state.status)
    const accessToken = useUserStore((state) => state.accessToken)
    const favoriteItems = useFavoriteStore((state) => state.items)
    const addFavorite = useFavoriteStore((state) => state.add)
    const [term, setTerm] = useState('')
    const [results, setResults] = useState([])
    const [totalCount, setTotalCount] = useState(0)
    const [page, setPage] = useState(1)
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [alertOpen, setAlertOpen] = useState(false)
    const [connectionStatus, setConnectionStatus] = useState('loading')
    const [connectionMessage, setConnectionMessage] = useState('')
    const [tags, setTags] = useState([])
    const [activeTag, setActiveTag] = useState('')

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

    const handleFavorite = async (song, e) => {
        e.stopPropagation()
        if (!song || authStatus !== 'authenticated') return
        try {
            const wasAdded = await addFavorite(song, accessToken)
            if (!wasAdded) return
            showAlert({
                message: `${song.title} をマイうたに追加しました`,
                variant: 'success',
                timeoutMs: 2500,
            })
        } catch (error) {
            showAlert({
                message: String(error?.message || 'Failed to add favorite'),
                variant: 'danger',
                timeoutMs: 3500,
            })
        }
    }

    useEffect(() => {
        const controller = new AbortController()
        let didCancel = false

        fetchTags({ signal: controller.signal })
            .then((items) => {
                if (didCancel) return
                const list = Array.isArray(items) ? items.map((t) => t.name || t) : []
                setTags(list)
            })
            .catch(() => {
                if (didCancel) return
                setTags([])
            })

        return () => {
            didCancel = true
            controller.abort()
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        let didCancel = false

        fetchSongs({
            q: term,
            tag: activeTag || undefined,
            page,
            signal: controller.signal,
        })
            .then((data) => {
                if (didCancel) return
                const list = Array.isArray(data?.items) ? data.items : []
                setResults(list)
                setTotalCount(Number(data?.count) || list.length)
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
    }, [activeTag, page, term])

    const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / 10)), [totalCount])
    const favoriteSongCodes = useMemo(
        () => new Set(favoriteItems.map((item) => item.song_code)),
        [favoriteItems],
    )

    return (
        <div className="wiiFind h-100 d-flex flex-column">

            {/* Redesigned Header */}
            <div className="wiiFind__headerRed">
                <a href="#" className="wiiFind__backRed" onClick={(e) => { e.preventDefault(); onBack() }}>
                    <span className="wiiFind__backIcon">←</span> 戻る
                </a>

                <div className="d-flex align-items-center flex-grow-1 mx-2">
                    <Form.Control
                        className="wiiFind__inputRed"
                        value={term}
                        onChange={(e) => {
                            setTerm(e.target.value)
                            setPage(1)
                            setIsLoading(true)
                            setLoadError('')
                        }}
                    />
                    <span className="wiiFind__suffix">で 始まる曲</span>
                </div>

                <div className="wiiFind__countRed">{totalCount ? `${totalCount}件` : '0件'}</div>
            </div>

            {/* Tabs */}
            <div className="wiiFind__tabs">
                <Button
                    className={`wiiFind__tabBtn ${activeTag === '' ? 'wiiFind__tabBtn--active' : ''}`}
                    onClick={() => {
                        setActiveTag('')
                        setPage(1)
                        setIsLoading(true)
                        setLoadError('')
                    }}
                >
                    すべて
                </Button>
                {tags.map((tag) => (
                    <Button
                        key={tag}
                        className={`wiiFind__tabBtn ${activeTag === tag ? 'wiiFind__tabBtn--active' : ''}`}
                        onClick={() => {
                            setActiveTag(tag)
                            setPage(1)
                            setIsLoading(true)
                            setLoadError('')
                        }}
                    >
                        {tag}
                    </Button>
                ))}
            </div>

            {/* Main Content Area */}
            <Row className="g-0 flex-grow-1 overflow-hidden">
                {/* Song List Column - Expand to fill available space */}
                <Col className="h-100 d-flex flex-column" style={{ minWidth: 0 }}>
                    <div className="wiiList h-100">
                        {isLoading ? (
                            <div className="text-muted small mt-2 d-flex align-items-center gap-2">
                                <Spinner animation="border" size="sm" />
                                読み込み中…
                            </div>
                        ) : null}
                        {loadError ? <div className="text-danger small mt-2">{loadError}</div> : null}

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
                                    <ArtistLink artist={song.artist} className="wiiList__artist" />

                                    <div className="d-flex gap-2 ms-auto">
                                        <Button
                                            className={`wiiList__actionBtn ${favoriteSongCodes.has(song.id) ? 'wiiList__actionBtn--registered' : ''}`}
                                            disabled={authStatus !== 'authenticated' || favoriteSongCodes.has(song.id)}
                                            onClick={(e) => handleFavorite(song, e)}
                                        >
                                            <span
                                                className={`me-1 ${favoriteSongCodes.has(song.id) ? 'text-secondary' : 'text-warning'}`}
                                                style={{ textShadow: '0 1px 0 rgba(0,0,0,0.2)' }}
                                            >
                                                ★
                                            </span>
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
                            !isLoading && <div className="wiiList__empty text-muted">該当する曲がありません。</div>
                        )}
                    </div>
                </Col>

                {/* Right Navigation Column - Fixed width */}
                <Col xs="auto" className="h-100 ps-0">
                    <div className="wiiFind__navBar" style={{ width: '50px' }}>
                        <Button
                            className="wiiFind__navBtn"
                            disabled={page <= 1 || isLoading}
                            onClick={() => {
                                setPage((currentPage) => Math.max(1, currentPage - 1))
                                setIsLoading(true)
                                setLoadError('')
                            }}
                        >
                            <div style={{ fontSize: '1.5rem' }}>▲</div>
                            前
                        </Button>

                        {/* Spacer / Page Info could go here if needed, but image shows solid control area */}

                        <Button
                            className="wiiFind__navBtn"
                            disabled={page >= totalPages || isLoading}
                            onClick={() => {
                                setPage((currentPage) => Math.min(totalPages, currentPage + 1))
                                setIsLoading(true)
                                setLoadError('')
                            }}
                        >
                            次
                            <div style={{ fontSize: '1.5rem' }}>▼</div>
                        </Button>
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
