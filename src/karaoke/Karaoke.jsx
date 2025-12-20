import './Karaoke.css'
import { useEffect, useMemo } from 'react'
import { useSynthEngine } from '../engine/useSynthEngine.js'
import { synthEngine } from '../engine/SynthEngine.js'

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
      const prefix = base.slice(0, -1)
      const lastChar = base.slice(-1)
      if (prefix) segments.push({ text: prefix, ruby: '' })
      segments.push({ text: lastChar, ruby })
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
  const state = useSynthEngine()

  const lines = useMemo(() => {
    const entries = state.lrcEntries || []
    const i = state.activeLyricIndex ?? -1
    const current = i >= 0 ? splitRubySegments(entries[i]?.text) : { segments: [{ text: '…', ruby: '' }], hasRuby: false }
    const next =
      i + 1 < entries.length
        ? splitRubySegments(entries[i + 1]?.text)
        : { segments: [{ text: '…', ruby: '' }], hasRuby: false }
    return {
      current,
      next,
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

  return (
    <div className="karaokePage">
      <div className="karaoke-stage">
        <div className="karaoke-screen">
        <div className="top-section">
          <div className="pitch-monitor-bar">
            <div className="pitch-label">音程</div>

            <div className="pitch-graph">
              <svg preserveAspectRatio="none" viewBox="0 0 300 50" aria-hidden="true">
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
            <div className="playhead" />
            <div className="cursor-sparkle" />

            <div className="staff-lines" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="line" />
              ))}
            </div>

            <div className="note-bar" style={{ top: '30%', left: '10%', width: '5%' }} />
            <div className="note-bar" style={{ top: '25%', left: '16%', width: '8%' }} />
            <div className="note-bar" style={{ top: '45%', left: '30%', width: '15%' }} />
            <div className="note-bar" style={{ top: '50%', left: '48%', width: '10%' }} />
            <div className="note-bar" style={{ top: '45%', left: '60%', width: '8%' }} />
            <div className="note-bar note-bar--hot" style={{ top: '40%', left: '70%', width: '20%' }} />

            <svg className="sung-pitch-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path
                d="M10,32 Q15,25 20,27 T35,46 T55,52 T70,42"
                fill="none"
                stroke="#7efff5"
                strokeWidth="0.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        <div className="bottom-section">
          <div className="lyrics-container">
            <div className="lyric-row text-left">
              <span className="text">
                <span className="karaokeTextWrap" style={{ '--karaoke-progress': `${progressPercent}%` }}>
                  <span className="karaokeTextBase">{renderRubySegments(lines.current.segments)}</span>
                  <span className="karaokeTextFill" aria-hidden="true">
                    {renderRubySegments(lines.current.segments)}
                  </span>
                </span>
              </span>
            </div>

            <div className="lyric-row text-right lyric-row--indent">
              <span className="text">
                {renderRubySegments(lines.next.segments)}
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
