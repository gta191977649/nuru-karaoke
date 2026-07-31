import { useEffect, useMemo, useState } from 'react'
import { Button, Spinner } from 'react-bootstrap'

import ConnectionAlert from '../components/ConnectionAlert.jsx'
import { enqueueSongAndPlay } from '../engine/playerController.js'
import { fetchSongs } from '../services/songLibrary.js'
import useAlertStore from '../state/alertStore.js'
import useFavoriteStore from '../state/favoriteStore.js'
import useUserStore from '../state/userStore.js'

function ArtistPage({ artist, onBack, onSelectSong, onConfirm }) {
  const authStatus = useUserStore((state) => state.status)
  const accessToken = useUserStore((state) => state.accessToken)
  const favoriteItems = useFavoriteStore((state) => state.items)
  const addFavorite = useFavoriteStore((state) => state.add)
  const showAlert = useAlertStore((state) => state.showAlert)
  const [songs, setSongs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reservingSongCode, setReservingSongCode] = useState('')
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('loading')
  const [connectionMessage, setConnectionMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let didCancel = false

    setIsLoading(true)
    setLoadError('')
    const loadSongs = async () => {
      const firstPage = await fetchSongs({ artist, page: 1, pageSize: 200, signal: controller.signal })
      const totalPages = Math.max(1, Math.ceil((Number(firstPage?.count) || 0) / 200))
      const remainingPages = totalPages > 1
        ? await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) =>
            fetchSongs({ artist, page: index + 2, pageSize: 200, signal: controller.signal })),
        )
        : []
      return [
        ...(Array.isArray(firstPage?.items) ? firstPage.items : []),
        ...remainingPages.flatMap((page) => (Array.isArray(page?.items) ? page.items : [])),
      ]
    }

    loadSongs()
      .then((items) => {
        if (didCancel) return
        setSongs(items)
      })
      .catch((error) => {
        if (!didCancel) setLoadError(error?.message || '曲を読み込めませんでした。')
      })
      .finally(() => {
        if (!didCancel) setIsLoading(false)
      })

    return () => {
      didCancel = true
      controller.abort()
    }
  }, [artist])

  const favoriteSongCodes = useMemo(
    () => new Set(favoriteItems.map((item) => item.song_code)),
    [favoriteItems],
  )

  const handleFavorite = async (song, event) => {
    event.stopPropagation()
    if (!song || authStatus !== 'authenticated' || favoriteSongCodes.has(song.id)) return
    try {
      const wasAdded = await addFavorite(song, accessToken)
      if (wasAdded) {
        showAlert({
          message: `${song.title} をマイうたに追加しました`,
          variant: 'success',
          timeoutMs: 2500,
        })
      }
    } catch (error) {
      showAlert({
        message: error?.message || 'マイうたに追加できませんでした',
        variant: 'danger',
        timeoutMs: 3500,
      })
    }
  }

  const handleReserve = async (song, event) => {
    event.stopPropagation()
    setReservingSongCode(song.id)
    setConnectionOpen(true)
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
        setConnectionOpen(false)
        onConfirm?.()
      }, 600)
    } catch (error) {
      setConnectionStatus('error')
      setConnectionMessage(error?.message || '曲を予約できませんでした')
    } finally {
      setReservingSongCode('')
    }
  }

  return (
    <div className="wiiFind h-100 d-flex flex-column">
      <div className="artistPage__header">
        <a href="#" className="wiiFind__backRed" onClick={(event) => {
          event.preventDefault()
          onBack()
        }}>
          <span className="wiiFind__backIcon">←</span> 戻る
        </a>
        <div className="artistPage__identity">
          <span className="artistPage__eyebrow">歌手名</span>
          <h1 className="artistPage__title">{artist || '—'}</h1>
        </div>
        <div className="wiiFind__countRed">{isLoading ? '—' : `${songs.length}件`}</div>
      </div>

      <div className="artistPage__body">
        {isLoading ? (
          <div className="artistPage__status">
            <Spinner animation="border" size="sm" />
            読み込み中…
          </div>
        ) : null}
        {loadError ? <div className="artistPage__status text-danger">{loadError}</div> : null}
        {!isLoading && !loadError && !songs.length ? (
          <div className="wiiList__empty text-muted text-center py-5">この歌手の曲はありません。</div>
        ) : (
          <div className="wiiList">
            {songs.map((song) => {
              const isFavorite = favoriteSongCodes.has(song.id)
              return (
                <div
                  key={song.id}
                  className="wiiList__item artistPage__song"
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectSong?.(song)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelectSong?.(song)
                    }
                  }}
                >
                  <div className="wiiList__iconBadgeContainer">
                    <div className="wiiList__iconBadge wiiList__iconBadge--original">
                      {song.tags?.[0] || song.id}
                    </div>
                  </div>
                  <div className="artistPage__songMeta">
                    <div className="wiiList__title">{song.title}</div>
                    <div className="wiiList__artist">{song.artist}</div>
                  </div>
                  <div className="d-flex gap-2 ms-auto">
                    <Button
                      className={`wiiList__actionBtn ${isFavorite ? 'wiiList__actionBtn--registered' : ''}`}
                      type="button"
                      disabled={authStatus !== 'authenticated' || isFavorite}
                      onClick={(event) => handleFavorite(song, event)}
                    >
                      <span className="me-1" aria-hidden="true">★</span>
                      {isFavorite ? '登録済み' : 'マイうた'}
                    </Button>
                    <Button
                      className="wiiList__actionBtn wiiList__actionBtn--reserve"
                      type="button"
                      disabled={reservingSongCode === song.id}
                      onClick={(event) => handleReserve(song, event)}
                    >
                      {reservingSongCode === song.id ? '予約中…' : '予約'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ConnectionAlert
        isOpen={connectionOpen}
        status={connectionStatus}
        message={connectionMessage}
        onClose={() => setConnectionOpen(false)}
      />
    </div>
  )
}

export default ArtistPage
