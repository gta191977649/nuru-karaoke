import { useEffect, useMemo, useRef, useState } from 'react'
import { Form } from 'react-bootstrap'

const HISTORY_SIZE = 90
const SAMPLE_INTERVAL_MS = 500
const CHART_WIDTH = 1000

const LANES = [
  { key: 'input', label: 'Input', min: -60, max: 0, top: 28, height: 48, className: 'is-input' },
  { key: 'gain', label: 'Gain', min: -6, max: 20, top: 108, height: 48, className: 'is-gain' },
  { key: 'limiter', label: 'Limiter', min: -18, max: 0, top: 188, height: 48, className: 'is-limiter' },
]

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const sanitizeSample = ({ input, gain, limiter }) => ({
  input: Number.isFinite(input) ? input : -100,
  gain: Number.isFinite(gain) ? gain : 0,
  limiter: Number.isFinite(limiter) ? limiter : 0,
})

const formatDb = (value, { signed = false, unavailableBelow = null } = {}) => {
  if (!Number.isFinite(value) || (unavailableBelow !== null && value <= unavailableBelow)) return '—'
  const normalized = Math.abs(value) < 0.05 ? 0 : value
  const prefix = signed && normalized > 0 ? '+' : ''
  return `${prefix}${normalized.toFixed(1)} dB`
}

const sampleToPoint = (sample, lane, index, length) => {
  const x = length <= 1 ? CHART_WIDTH : (index / (length - 1)) * CHART_WIDTH
  const value = clamp(sample[lane.key], lane.min, lane.max)
  const y = lane.top + ((lane.max - value) / (lane.max - lane.min)) * lane.height
  return `${x.toFixed(2)},${y.toFixed(2)}`
}

function AutoGainDspMonitor({ enabled, inputDb, gainDb, limiterDb, onEnabledChange }) {
  const initialSample = sanitizeSample({ input: inputDb, gain: gainDb, limiter: limiterDb })
  const latestSampleRef = useRef(initialSample)
  const [history, setHistory] = useState(() =>
    Array.from({ length: HISTORY_SIZE }, () => initialSample),
  )

  useEffect(() => {
    latestSampleRef.current = sanitizeSample({ input: inputDb, gain: gainDb, limiter: limiterDb })
  }, [inputDb, gainDb, limiterDb])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setHistory((current) => [...current.slice(-(HISTORY_SIZE - 1)), latestSampleRef.current])
    }, SAMPLE_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [])

  const pointsByLane = useMemo(
    () => Object.fromEntries(
      LANES.map((lane) => [
        lane.key,
        history.map((sample, index) => sampleToPoint(sample, lane, index, history.length)).join(' '),
      ]),
    ),
    [history],
  )

  const latest = history[history.length - 1]

  return (
    <div className={`autoGainMonitor ${enabled ? 'is-enabled' : 'is-disabled'}`}>
      <div className="autoGainMonitor__header">
        <div>
          <div className="fw-semibold">自動音量調整 DSP モニター</div>
          <div className="small text-muted">演奏中の入力レベルと音量補正をリアルタイムで表示します。</div>
        </div>
        <Form.Check
          type="switch"
          id="synth-auto-gain"
          label={enabled ? 'ON' : 'OFF'}
          checked={enabled}
          onChange={(event) => onEnabledChange(event.currentTarget.checked)}
          aria-label="自動音量調整を切り替える"
        />
      </div>

      <div className="autoGainMonitor__metrics" aria-live="polite">
        <div className="autoGainMonitor__metric is-input">
          <span>Input</span>
          <strong>{formatDb(inputDb, { unavailableBelow: -90 })}</strong>
        </div>
        <div className="autoGainMonitor__metric is-gain">
          <span>Gain</span>
          <strong>{formatDb(gainDb, { signed: true })}</strong>
        </div>
        <div className="autoGainMonitor__metric is-limiter">
          <span>Limiter</span>
          <strong>{formatDb(limiterDb)}</strong>
        </div>
      </div>

      <div className="autoGainMonitor__chartHeader">
        <span>REALTIME DSP</span>
        <span>直近 45 秒</span>
      </div>
      <div className="autoGainMonitor__chart">
        <svg viewBox="0 0 1000 260" role="img" aria-label="自動音量調整のリアルタイム DSP グラフ">
          <defs>
            <linearGradient id="autoGainDspBackground" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#17202b" />
              <stop offset="100%" stopColor="#0b1017" />
            </linearGradient>
          </defs>
          <rect width="1000" height="260" rx="10" fill="url(#autoGainDspBackground)" />

          {[0, 200, 400, 600, 800, 1000].map((x) => (
            <line key={x} className="autoGainMonitor__grid" x1={x} y1="12" x2={x} y2="246" />
          ))}

          {LANES.map((lane) => {
            const latestPoint = sampleToPoint(latest, lane, history.length - 1, history.length).split(',')
            return (
              <g key={lane.key}>
                <line
                  className="autoGainMonitor__grid autoGainMonitor__grid--horizontal"
                  x1="0"
                  y1={lane.top + lane.height / 2}
                  x2="1000"
                  y2={lane.top + lane.height / 2}
                />
                <text className={`autoGainMonitor__laneLabel ${lane.className}`} x="16" y={lane.top - 8}>
                  {lane.label}
                </text>
                <text className="autoGainMonitor__scale" x="984" y={lane.top - 8} textAnchor="end">
                  {lane.min} … {lane.max} dB
                </text>
                <polyline
                  className={`autoGainMonitor__trace ${lane.className}`}
                  points={pointsByLane[lane.key]}
                />
                <circle
                  className={`autoGainMonitor__point ${lane.className}`}
                  cx={latestPoint[0]}
                  cy={latestPoint[1]}
                  r="4"
                />
              </g>
            )
          })}
        </svg>
        {!enabled ? <div className="autoGainMonitor__disabledLabel">自動音量調整 OFF</div> : null}
      </div>

      <div className="autoGainMonitor__legend" aria-hidden="true">
        <span className="is-input">Input</span>
        <span className="is-gain">Gain</span>
        <span className="is-limiter">Limiter</span>
      </div>
    </div>
  )
}

export default AutoGainDspMonitor
