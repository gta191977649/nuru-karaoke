import { useEffect, useRef, useState } from 'react'
import { useKaraokeStore } from '../state/karaokeStore.js'
import './GlobalSynthLoadingModal.css'

const STAGE_MESSAGES = {
  starting: '起動の準備をしています…',
  audio: 'オーディオエンジンを起動しています…',
  'soundfont-download': '音色ライブラリをダウンロードしています…',
  'soundfont-load': '音色ライブラリを読み込んでいます…',
  player: 'プレーヤーを準備しています…',
}

function GlobalSynthLoadingModal({ onRetry }) {
  const ready = useKaraokeStore((state) => state.ready)
  const stage = useKaraokeStore((state) => state.engineLoadStage)
  const error = useKaraokeStore((state) => state.engineLoadError)
  const modalRef = useRef(null)
  const [retrying, setRetrying] = useState(false)
  const isError = stage === 'error'

  useEffect(() => {
    if (ready) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    modalRef.current?.focus()

    const freezeKeyboard = (event) => {
      if (isError && (event.key === 'Enter' || event.key === ' ')) {
        modalRef.current?.querySelector('button')?.click()
      }
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', freezeKeyboard, true)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', freezeKeyboard, true)
    }
  }, [isError, ready])

  if (ready) return null

  const handleRetry = async () => {
    if (retrying) return
    setRetrying(true)
    try {
      await onRetry?.()
    } catch {
      setRetrying(false)
    }
  }

  return (
    <div className="synthLoadingOverlay">
      <section
        className="synthLoadingModal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="synth-loading-title"
        aria-describedby="synth-loading-message"
        ref={modalRef}
        tabIndex={-1}
      >
        <header className="synthLoadingModal__header" id="synth-loading-title">
          {isError ? '読み込みエラー' : 'ただいま準備中'}
        </header>
        <div className="synthLoadingModal__body">
          <div className={`synthLoadingModal__disc ${isError ? 'synthLoadingModal__disc--error' : ''}`} aria-hidden="true">
            <span>{isError ? '!' : '♪'}</span>
          </div>
          <div className="synthLoadingModal__english">
            {isError ? 'LOAD ERROR' : 'NOW LOADING…'}
          </div>
          <p className="synthLoadingModal__message" id="synth-loading-message" aria-live="polite">
            {isError
              ? 'シンセエンジンを準備できませんでした。'
              : STAGE_MESSAGES[stage] || 'シンセエンジンを準備しています…'}
          </p>
          {isError && error ? <p className="synthLoadingModal__detail">{error}</p> : null}
          {!isError ? (
            <div className="synthLoadingModal__progress" role="progressbar" aria-label="読み込み中">
              <span />
            </div>
          ) : (
            <button className="synthLoadingModal__retry" type="button" onClick={handleRetry} disabled={retrying}>
              {retrying ? '再試行しています…' : 'もう一度試す'}
            </button>
          )}
          <p className="synthLoadingModal__notice">
            {isError ? '下のボタンを押して、もう一度お試しください。' : '準備が完了するまで、そのままお待ちください。'}
          </p>
        </div>
      </section>
    </div>
  )
}

export default GlobalSynthLoadingModal
