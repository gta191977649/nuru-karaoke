import { Button, Card, Col, Container, Form, Row, Stack } from 'react-bootstrap'
import { useEffect, useState } from 'react'
import { useKaraokeStore } from '../state/karaokeStore.js'
import { parseLrc } from '../engine/lrc.js'
import useAlertStore from '../state/alertStore.js'
import WiiDialog from '../components/WiiDialog.jsx'
import { enqueueSongAndPlay } from '../engine/playerController.js'
import ConnectionAlert from '../components/ConnectionAlert.jsx'
import useFavoriteStore from '../state/favoriteStore.js'
import useUserStore from '../state/userStore.js'
import NationalRanking from './NationalRanking.jsx'
import ArtistLink from '../components/ArtistLink.jsx'
import { useSettingsStore } from '../state/settingsStore.js'

function InfoRow({ icon, label, value }) {
  return (
    <div className="d-flex align-items-center gap-3 py-2 border-bottom">
      <div
        className="d-flex align-items-center justify-content-center rounded-3 bg-secondary-subtle text-secondary-emphasis flex-shrink-0"
        style={{ width: 44, height: 44 }}
        aria-hidden="true"
      >
        <span style={{ fontSize: 22 }}>{icon}</span>
      </div>
      <div className="text-muted small" style={{ width: 72 }}>
        {label}
      </div>
      <div className="fw-semibold fs-5 flex-grow-1">{value}</div>
    </div>
  )
}

export default function ComfirmSong({ onBack, onConfirm }) {
  const state = useKaraokeStore()
  const song = state.pendingSong
  const showAlert = useAlertStore((state) => state.showAlert)
  const authStatus = useUserStore((state) => state.status)
  const accessToken = useUserStore((state) => state.accessToken)
  const favoriteItems = useFavoriteStore((state) => state.items)
  const addFavorite = useFavoriteStore((state) => state.add)
  const defaultGuideMelodyEnabled = useSettingsStore((state) => state.guideMelodyEnabled)
  const [previewText, setPreviewText] = useState('—')
  const [showLyrics, setShowLyrics] = useState(false)
  const [lyricsText, setLyricsText] = useState('')
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('loading')
  const [connectionMessage, setConnectionMessage] = useState('')
  const [view, setView] = useState('info') // 'info' or 'ranking'
  const [guideMelodyEnabled, setGuideMelodyEnabled] = useState(defaultGuideMelodyEnabled)
  const isFavorite = Boolean(song?.id) && favoriteItems.some((item) => item.song_code === song.id)

  const buildNetworkMessage = (error) => String(error?.message || 'Unknown error')

  useEffect(() => {
    let ignore = false
    const loadPreview = async () => {
      if (!song?.lrc) {
        setPreviewText(song?.preview || '—')
        return
      }
      try {
        const res = await fetch(song.lrc)
        if (!res.ok) throw new Error('LRC not found')
        const text = await res.text()
        const entries = parseLrc(text)
        const raw = entries
          .slice(0, 3)
          .map((entry) => entry.plainText || entry.text)
          .join(' / ')
        const normalized = raw.trim()
        const maxLen = 28
        const clipped = normalized.length > maxLen ? `${normalized.slice(0, maxLen)}…` : normalized
        if (!ignore) setPreviewText(clipped || '—')
      } catch {
        if (!ignore) setPreviewText(song?.preview || '—')
      }
    }
    loadPreview()
    return () => {
      ignore = true
    }
  }, [song])

  useEffect(() => {
    let ignore = false
    const loadLyrics = async () => {
      if (!song?.lrc) {
        setLyricsText('—')
        return
      }
      try {
        const res = await fetch(song.lrc)
        if (!res.ok) throw new Error('LRC not found')
        const text = await res.text()
        const entries = parseLrc(text)
        const lines = entries
          .map((entry) => String(entry.plainText || entry.text || '').trim())
          .filter(Boolean)
        if (!ignore) setLyricsText(lines.join('\n') || '—')
      } catch {
        if (!ignore) setLyricsText('—')
      }
    }
    loadLyrics()
    return () => {
      ignore = true
    }
  }, [song])

  if (view === 'ranking') {
    return <NationalRanking song={song} onBack={() => setView('info')} />
  }

  return (
    <Container fluid className="py-3">
      <div className="bg-light border rounded-3 p-3">
        <div className="text-muted small mb-2">
          曲予約を確定します。よろしければ「予約」をタッチしてください。
        </div>

        <Row className="g-3">
          <Col xs={12} lg={9}>
            <div className="bg-white border rounded-3 p-3">
              <InfoRow icon="🆔" label="曲番号" value={song?.id || '—'} />
              <InfoRow
                icon="👤"
                label="歌手名"
                value={song?.artist ? <ArtistLink artist={song.artist} /> : '—'}
              />
              <InfoRow icon="🎵" label="曲名" value={song?.title || '—'} />
              <div className="d-flex align-items-center gap-3 py-2">
                <div
                  className="d-flex align-items-center justify-content-center rounded-3 bg-secondary-subtle text-secondary-emphasis flex-shrink-0"
                  style={{ width: 44, height: 44 }}
                  aria-hidden="true"
                >
                  <span style={{ fontSize: 22 }}>🎤</span>
                </div>
                <div className="text-muted small" style={{ width: 72 }}>
                  歌い出し
                </div>
                <div className="fw-semibold fs-5 flex-grow-1">{previewText}</div>
                <Button
                  variant="primary"
                  className="rounded-pill px-10"
                  type="button"
                  onClick={() => setShowLyrics(true)}
                >
                  歌詞を見る
                </Button>
              </div>
            </div>

            <div className="mt-3">
              <Row className="g-2">
                <Col xs={12} md={4}>
                  <Card className="h-100">
                    <Card.Header className="py-2 fw-semibold">ガイドメロディ</Card.Header>
                    <Card.Body className="py-2 d-flex align-items-center justify-content-between gap-3">
                      <div className="text-muted small">
                        {guideMelodyEnabled ? 'あり' : 'なし'}
                      </div>
                      <Form.Check
                        type="switch"
                        id={`guide-melody-${song?.id || 'song'}`}
                        checked={guideMelodyEnabled}
                        onChange={(event) => setGuideMelodyEnabled(event.currentTarget.checked)}
                        label={guideMelodyEnabled ? 'ON' : 'OFF'}
                        aria-label="ガイドメロディを切り替える"
                      />
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={12} md={4}>
                  <Card className="h-100">
                    <Card.Header className="py-2 fw-semibold">キー</Card.Header>
                    <Card.Body className="py-2">
                      <div className="text-muted small">原曲</div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={12} md={4}>
                  <Card className="h-100">
                    <Card.Header className="py-2 fw-semibold">歌詞サイズ</Card.Header>
                    <Card.Body className="py-2">
                      <div className="text-muted small">ふつう</div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
              <div className="w-100 mt-3" />
              <div className="d-flex gap-2">
                <Button variant="secondary" className="rounded-pill px-4" type="button" onClick={onBack}>
                  もどる
                </Button>
                <Button variant="secondary" className="rounded-pill px-4" type="button">
                  トップメニュー
                </Button>
              </div>
            </div>
          </Col>

          <Col xs={12} lg={3}>
            <Stack gap={2} className="h-100">
              <Button
                variant={isFavorite ? 'secondary' : 'info'}
                className="fw-semibold"
                type="button"
                disabled={authStatus !== 'authenticated' || isFavorite}
                onClick={async () => {
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
                }}
              >
                {isFavorite ? (
                  <>登録済み</>
                ) : (
                  <>
                    マイうたに
                    <br />
                    登録
                  </>
                )}
              </Button>
              <Button
                variant="info"
                className="fw-semibold"
                type="button"
                onClick={() => setView('ranking')}
              >
                全国ランキング
              </Button>

              <div className="flex-grow-1 d-flex align-items-end justify-content-center">
                <Button
                  variant="danger"
                  className="rounded-circle fw-bold fs-1"
                  type="button"
                  style={{ width: 140, height: 140 }}
                  disabled={!song}
                  onClick={async () => {
                    if (!song) return
                    setConnectionOpen(true)
                    setConnectionStatus('loading')
                    setConnectionMessage('通信中です…')
                    try {
                      await enqueueSongAndPlay({
                        ...song,
                        guideMelodyEnabled,
                      })
                      setConnectionStatus('success')
                      setConnectionMessage('読み込み完了しました。')
                      showAlert({
                        message: `${song.title} を予約しました。`,
                        variant: 'success',
                        timeoutMs: 2500,
                      })
                      setTimeout(() => {
                        setConnectionOpen(false)
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
                  }}
                >
                  予約
                </Button>
              </div>
            </Stack>
          </Col>
        </Row>
      </div>
      <WiiDialog
        show={showLyrics}
        title={song?.title || '歌詞'}
        showActions={false}
        onClose={() => setShowLyrics(false)}
      >
        <div className="text-start" style={{ maxHeight: 360, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
          {lyricsText}
        </div>
        <div className="mt-3 d-flex justify-content-center">
          <Button variant="secondary" type="button" onClick={() => setShowLyrics(false)}>
            閉じる
          </Button>
        </div>
      </WiiDialog>
      <ConnectionAlert
        isOpen={connectionOpen}
        status={connectionStatus}
        message={connectionMessage}
        onClose={() => setConnectionOpen(false)}
      />
    </Container>
  )
}
