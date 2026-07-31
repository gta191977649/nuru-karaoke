import { useState } from 'react'
import { Alert, Button, Spinner } from 'react-bootstrap'

import ConnectionAlert from '../components/ConnectionAlert.jsx'
import { enqueueSongAndPlay } from '../engine/playerController.js'
import { fetchSongByCode } from '../services/songLibrary.js'
import useAlertStore from '../state/alertStore.js'
import useFavoriteStore from '../state/favoriteStore.js'
import useUserStore from '../state/userStore.js'
import ArtistLink from '../components/ArtistLink.jsx'

function MySong({ onBack, onLogin, onOpenKaraoke }) {
  const authStatus = useUserStore((state) => state.status)
  const accessToken = useUserStore((state) => state.accessToken)
  const favoriteItems = useFavoriteStore((state) => state.items)
  const favoriteStatus = useFavoriteStore((state) => state.status)
  const favoriteError = useFavoriteStore((state) => state.error)
  const loadFavorites = useFavoriteStore((state) => state.load)
  const removeFavorite = useFavoriteStore((state) => state.remove)
  const showAlert = useAlertStore((state) => state.showAlert)
  const [removingSongCode, setRemovingSongCode] = useState('')
  const [reservingSongCode, setReservingSongCode] = useState('')
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('loading')
  const [connectionMessage, setConnectionMessage] = useState('')

  const handleReserve = async (favorite) => {
    setReservingSongCode(favorite.song_code)
    setConnectionOpen(true)
    setConnectionStatus('loading')
    setConnectionMessage('サーバーに接続中...')
    try {
      const song = await fetchSongByCode(favorite.song_code)
      await enqueueSongAndPlay(song)
      setConnectionStatus('success')
      setConnectionMessage('接続完了。曲を読み込みました。')
      showAlert({
        message: `${favorite.title} を予約しました`,
        variant: 'success',
        timeoutMs: 2500,
      })
      setTimeout(() => {
        setConnectionOpen(false)
        if (onOpenKaraoke) onOpenKaraoke()
      }, 600)
    } catch (error) {
      setConnectionStatus('error')
      setConnectionMessage(error?.message || '曲を予約できませんでした')
      showAlert({
        message: error?.message || '曲を予約できませんでした',
        variant: 'danger',
        timeoutMs: 3500,
      })
    } finally {
      setReservingSongCode('')
    }
  }

  const handleRemove = async (favorite) => {
    setRemovingSongCode(favorite.song_code)
    try {
      await removeFavorite(favorite.song_code, accessToken)
      showAlert({
        message: `${favorite.title} をマイうたから削除しました`,
        variant: 'success',
        timeoutMs: 2500,
      })
    } catch (error) {
      showAlert({
        message: error?.message || 'マイうたから削除できませんでした',
        variant: 'danger',
        timeoutMs: 3500,
      })
    } finally {
      setRemovingSongCode('')
    }
  }

  return (
    <div className="wiiFind h-100 d-flex flex-column">
      <div className="wiiFind__headerRed">
        <a
          href="#"
          className="wiiFind__backRed"
          onClick={(event) => {
            event.preventDefault()
            onBack()
          }}
        >
          <span className="wiiFind__backIcon">←</span> 戻る
        </a>
        <div className="wiiFind__hint flex-grow-1 text-center">マイうた</div>
        <div className="wiiFind__countRed">
          {authStatus === 'authenticated' ? `${favoriteItems.length}件` : '—'}
        </div>
      </div>

      {authStatus !== 'authenticated' ? (
        <div className="wiiScreen flex-grow-1">
          <div className="wiiScreen__card">
            <div className="wiiScreen__title">ログインが必要です</div>
            <div className="wiiScreen__subtitle">
              マイうたを利用するにはログインしてください。
            </div>
            <div className="wiiScreen__actions">
              <Button type="button" onClick={onLogin}>ログイン</Button>
              <Button variant="secondary" type="button" onClick={onBack}>戻る</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-grow-1 d-flex flex-column overflow-hidden p-3">
          {favoriteStatus === 'loading' ? (
            <div className="d-flex align-items-center justify-content-center gap-2 py-4 text-muted">
              <Spinner animation="border" size="sm" />
              読み込み中…
            </div>
          ) : null}

          {favoriteStatus === 'error' ? (
            <Alert variant="danger" className="d-flex align-items-center justify-content-between gap-3">
              <span>{favoriteError || 'マイうたを読み込めませんでした。'}</span>
              <Button
                variant="outline-danger"
                size="sm"
                type="button"
                onClick={() => loadFavorites(accessToken).catch(() => {})}
              >
                再試行
              </Button>
            </Alert>
          ) : null}

          {favoriteStatus !== 'loading' && favoriteItems.length === 0 ? (
            <div className="wiiList__empty text-muted text-center py-5">
              マイうたに登録された曲はありません。
            </div>
          ) : (
            <div className="wiiList">
              {favoriteItems.map((favorite) => (
                <div key={favorite.song_code} className="wiiList__item">
                  <div className="wiiList__iconBadge wiiList__iconBadge--original">
                    {favorite.song_code}
                  </div>
                  <div className="wiiList__title">{favorite.title}</div>
                  <ArtistLink artist={favorite.artist} className="wiiList__artist" />
                  <div className="d-flex gap-2 ms-auto">
                    <Button
                      className="wiiList__actionBtn wiiList__actionBtn--remove"
                      type="button"
                      disabled={removingSongCode === favorite.song_code}
                      onClick={() => handleRemove(favorite)}
                    >
                      {removingSongCode === favorite.song_code ? '削除中…' : '削除'}
                    </Button>
                    <Button
                      className="wiiList__actionBtn wiiList__actionBtn--reserve"
                      type="button"
                      disabled={reservingSongCode === favorite.song_code}
                      onClick={() => handleReserve(favorite)}
                    >
                      {reservingSongCode === favorite.song_code ? '予約中…' : '予約'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <ConnectionAlert
        isOpen={connectionOpen}
        status={connectionStatus}
        message={connectionMessage}
        onClose={() => setConnectionOpen(false)}
      />
    </div>
  )
}

export default MySong
