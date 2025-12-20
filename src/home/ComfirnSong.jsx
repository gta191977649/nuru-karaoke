import { Button, Card, Col, Container, Row, Stack } from 'react-bootstrap'
import { useEffect, useState } from 'react'
import { synthEngine } from '../engine/SynthEngine.js'
import { useSynthEngine } from '../engine/useSynthEngine.js'
import { parseLrc } from '../engine/lrc.js'
import useAlertStore from '../state/alertStore.js'
import WiiDialog from '../components/WiiDialog.jsx'

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
  const synth = useSynthEngine()
  const song = synth.pendingSong
  const showAlert = useAlertStore((state) => state.showAlert)
  const [previewText, setPreviewText] = useState('—')
  const [showLyrics, setShowLyrics] = useState(false)
  const [lyricsText, setLyricsText] = useState('')

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
          .map((entry) => entry.text)
          .join(' / ')
        const normalized = raw.replace(/<[^>]*>/g, '').trim()
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
          .map((entry) => entry.text.replace(/<[^>]*>/g, '').trim())
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

  return (
    <Container fluid className="py-3">
      <div className="bg-light border rounded-3 p-3">
        <div className="text-muted small mb-2">
          予約を決定します。この曲でよろしければ、「予約」をタッチしてください。
        </div>

        <Row className="g-3">
          <Col xs={12} lg={9}>
            <div className="bg-white border rounded-3 p-3">
              <InfoRow icon="👤" label="歌手名" value={song?.artist || '—'} />
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
                  歌詞続き
                </Button>
              </div>
            </div>

            <div className="mt-3">
              <Row className="g-2">
                <Col xs={12} md={4}>
                  <Card className="h-100">
                    <Card.Header className="py-2 fw-semibold">ガイドメロディ設定</Card.Header>
                    <Card.Body className="py-2">
                      <div className="text-muted small">ガイドあり</div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={12} md={4}>
                  <Card className="h-100">
                    <Card.Header className="py-2 fw-semibold">キー設定</Card.Header>
                    <Card.Body className="py-2">
                      <div className="text-muted small">原曲キー</div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={12} md={4}>
                  <Card className="h-100">
                    <Card.Header className="py-2 fw-semibold">歌詞のサイズ</Card.Header>
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
                  トップへ
                </Button>
              </div>
            </div>
          </Col>

          <Col xs={12} lg={3}>
            <Stack gap={2} className="h-100">
              <Button variant="info" className="fw-semibold" type="button">
                お気に入りに
                <br />
                登録する
              </Button>
              <Button variant="info" className="fw-semibold" type="button">
                全国歌ランクを見る
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
                    await synthEngine.resumeAudio()
                    synthEngine.enqueueSong(song)
                    synthEngine.clearPendingSong()
                    showAlert({
                      message: `${song.title} を予約しました`,
                      variant: 'success',
                      timeoutMs: 2500,
                    })
                    await synthEngine.playQueueIfIdle()
                    if (onConfirm) onConfirm()
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
        title={song?.title || 'Lyrics'}
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
    </Container>
  )
}
