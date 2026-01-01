import './Karaoke.css'
import { useEffect, useMemo, useRef } from 'react'
import { useKaraokeStore } from '../state/karaokeStore.js'
import { synthEngine } from '../engine/SynthEngine.js'
import { sharedPitchEngine, startSharedMic, stopSharedMic } from '../engine/audio/pitch/sharedPitchEngine.js'
import MelodyGuideCanvas from '../components/MelodyGuideCanvas.jsx'
import KeyChangeAlert from '../components/KeyChangeAlert.jsx'
import useKeyChangeAlertStore from '../state/keyChangeAlertStore.js'
import { useKaraokeReference } from './hooks/useKaraokeReference.js'
import { useKaraokePitchHistory } from './hooks/useKaraokePitchHistory.js'
import { useKaraokeSongIntro } from './hooks/useKaraokeSongIntro.js'

function splitRubySegments(text) {
  const raw = String(text ?? '')
  if (!raw.includes('<')) return { segments: [{ text: raw, ruby: '' }], hasRuby: false }

  const segments = []
  let cursor = 0
  while (cursor < raw.length) {
    const open = raw.indexOf('<', cursor)
    if (open === -1) {
      segments.push({ text: raw.slice(cursor), ruby: '' })
      break
    }
    const close = raw.indexOf('>', open + 1)
    if (close === -1) {
      segments.push({ text: raw.slice(cursor), ruby: '' })
      break
    }
    const base = raw.slice(cursor, open)
    const ruby = raw.slice(open + 1, close)
    if (base) {
      const wordMatch = base.match(/[A-Za-z][A-Za-z0-9'-]*$/)
      if (wordMatch) {
        const word = wordMatch[0]
        const prefix = base.slice(0, base.length - word.length)
        if (prefix) segments.push({ text: prefix, ruby: '' })
        segments.push({ text: word, ruby })
      } else {
        const prefix = base.slice(0, -1)
        const lastChar = base.slice(-1)
        if (prefix) segments.push({ text: prefix, ruby: '' })
        segments.push({ text: lastChar, ruby })
      }
    }
    cursor = close + 1
  }
  const hasRuby = segments.some((seg) => seg.ruby)
  return { segments, hasRuby }
}

function renderRubySegments(segments) {
  return segments.map((seg, idx) =>
    seg.ruby ? (
      <ruby key={`${seg.text}-${idx}`}>
        {seg.text}
        <rt>{seg.ruby}</rt>
      </ruby>
    ) : (
      <span key={`${seg.text}-${idx}`}>{seg.text}</span>
    ),
  )
}

function Karaoke() {
  const state = useKaraokeStore()
  const pitchEngine = sharedPitchEngine
  const currentTimeRef = useRef(0)
  const transpositionRef = useRef(0)
  const micRmsGate = 0.01
  const showKeyChangeAlert = useKeyChangeAlertStore((store) => store.showKeyChangeAlert)
  const reference = useKaraokeReference({
    ready: state.ready,
    midiName: state.midiName,
    midiUrl: state.midiUrl,
    queueIndex: state.queueIndex,
  })
  const { showSongInfo, songInfo } = useKaraokeSongIntro({
    midiUrl: state.midiUrl,
    midiName: state.midiName,
    queue: state.queue,
    queueIndex: state.queueIndex,
    transposition: state.transposition,
    showKeyChangeAlert,
  })
  const { pitchHistoryRef, lastPitchRef } = useKaraokePitchHistory({
    pitchEngine,
    reference,
    currentTimeRef,
    transpositionRef,
    rmsGate: micRmsGate,
    resetKey: `${state.midiName || ''}-${state.queueIndex ?? -1}`,
  })

  const lines = useMemo(() => {
    const entries = state.lrcEntries || []
    const i = state.activeLyricIndex ?? -1
    const pairStart = i >= 0 ? i - (i % 2) : -1
    const current =
      pairStart >= 0 ? splitRubySegments(entries[pairStart]?.text) : { segments: [{ text: '…', ruby: '' }], hasRuby: false }
    const next =
      pairStart + 1 < entries.length
        ? splitRubySegments(entries[pairStart + 1]?.text)
        : { segments: [{ text: '…', ruby: '' }], hasRuby: false }
    const activeInPair = i >= 0 ? i % 2 : 0
    return {
      current,
      next,
      currentAlign: 'text-left',
      nextAlign: 'text-right lyric-row--indent',
      activeInPair,
    }
  }, [state.activeLyricIndex, state.lrcEntries])

  const progressPercent = Math.round((state.karaokeProgress ?? 0) * 1000) / 10
  const scorePercent =
    state.duration > 0 ? Math.max(0, Math.min(100, Math.round((state.currentTime / state.duration) * 100))) : 0

  useEffect(() => {
    if (!state.ready) return
    synthEngine.playQueueIfIdle().catch(() => {
      // ignore
    })
  }, [state.ready])

  useEffect(() => {
    currentTimeRef.current = state.currentTime ?? 0
  }, [state.currentTime])

  useEffect(() => {
    transpositionRef.current = Number(state.transposition) || 0
  }, [state.transposition])

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      try {
        await startSharedMic()
      } catch (err) {
        if (!cancelled) console.error(err)
      }
    }
    start()
    return () => {
      cancelled = true
      stopSharedMic()
    }
  }, [pitchEngine])

  return (
    <div className="karaokePage">
      <KeyChangeAlert />
      {showSongInfo ? (
        <div className="karaokeSongIntro">
          <div className="karaokeSongIntro__title">{songInfo.title}</div>
          {songInfo.artist ? <div className="karaokeSongIntro__artist">♪{songInfo.artist}</div> : null}
        </div>
      ) : null}
      <div className="karaoke-stage">
        <div className="karaoke-screen">
        <div className="top-section">
          <div className="pitch-monitor-bar">
            <div className="pitch-label">音程</div>

            <div className="pitch-graph">
              <svg className="karaokeVisual" preserveAspectRatio="none" viewBox="0 0 300 50" aria-hidden="true">
                <path
                  d="M0,10 L300,10 M0,20 L300,20 M0,30 L300,30 M0,40 L300,40"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="1"
                  fill="none"
                />
                <text x="150" y="25" fill="#00ccff" fontSize="10" textAnchor="middle">
                  間奏
                </text>
                <polyline
                  points="0,40 20,30 40,10 60,10 80,20 100,20 120,35 140,30 160,10 180,10 200,25 220,25 240,40"
                  fill="none"
                  stroke="#f1c40f"
                  strokeWidth="2"
                  markerMid="url(#dot)"
                />
                <defs>
                  <marker id="dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6">
                    <circle cx="5" cy="5" r="4" fill="#f1c40f" />
                  </marker>
                </defs>
              </svg>
            </div>

            <div className="scoring-panel">
              <div className="score-status">
                <span className="score-percent">{scorePercent}%</span>
                <div className="status-badge">採点中</div>
              </div>
              <div className="technique-counters">
                <div className="tech-item blue">
                  <span>こぶし</span>
                  <span className="tech-count">
                    000<small>回</small>
                  </span>
                </div>
                <div className="tech-item red">
                  <span>しゃくり</span>
                  <span className="tech-count">
                    004<small>回</small>
                  </span>
                </div>
                <div className="tech-item yellow">
                  <span>ビブラート</span>
                  <span className="tech-count">
                    044<small>秒</small>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="melody-guide">
            <MelodyGuideCanvas
              className="melodyGuideCanvas"
              reference={reference}
              historyRef={pitchHistoryRef}
              currentTimeRef={currentTimeRef}
              transpositionRef={transpositionRef}
              rmsGate={micRmsGate}
              gateUserByTarget
              width={900}
              height={220}
            />
          </div>
        </div>

        <div className="bottom-section">
          <div className="lyrics-container">
            <div className={`lyric-row ${lines.currentAlign}`}>
              <span className="text">
                <span
                  className="karaokeTextWrap"
                  style={{
                    '--karaoke-progress': `${lines.activeInPair === 0 ? progressPercent : 100}%`,
                  }}
                >
                  <span className="karaokeTextBase">{renderRubySegments(lines.current.segments)}</span>
                  <span className="karaokeTextFill" aria-hidden="true">
                    {renderRubySegments(lines.current.segments)}
                  </span>
                </span>
              </span>
            </div>

            <div className={`lyric-row ${lines.nextAlign}`}>
              <span className="text">
                <span
                  className="karaokeTextWrap"
                  style={{
                    '--karaoke-progress': `${lines.activeInPair === 1 ? progressPercent : 0}%`,
                  }}
                >
                  <span className="karaokeTextBase">{renderRubySegments(lines.next.segments)}</span>
                  <span className="karaokeTextFill" aria-hidden="true">
                    {renderRubySegments(lines.next.segments)}
                  </span>
                </span>
              </span>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

export default Karaoke
