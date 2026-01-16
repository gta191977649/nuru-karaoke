import React, { useMemo } from 'react'
import '../Karaoke.css'
import { useKaraokeStore } from '../../state/karaokeStore.js'

const SCORE_RING_CONFIG = {
    radius: 48, // Larger radius to be "outside"
    strokeWidth: 1.5,
    cx: 50,
    cy: 50
}

function ResultsPage({ score, techniques, songInfo, onNext }) {
    score = 94.25 // Preserving user debug value
    const displayScore = (Number(score) || 0).toFixed(2)
    const [intPart, decPart] = displayScore.split('.')

    // Mock Analysis Data (since we don't have real analytics for these yet)
    const analysisdata = useMemo(() => ({
        pitch: { label: '音程', val: Math.min(40, (score / 100) * 40).toFixed(3), max: 40 },
        stability: { label: '安定感', val: (Math.random() * 30).toFixed(3), max: 30 },
        intonation: { label: '抑揚', val: (Math.random() * 15).toFixed(3), max: 15 },
        longTone: { label: 'ロングトーン', val: (Math.random() * 10).toFixed(3), max: 10 },
        technique: { label: 'テクニック', val: (Math.random() * 5).toFixed(3), max: 5 },
    }), [score])

    const circumference = 2 * Math.PI * SCORE_RING_CONFIG.radius
    const progressOffset = circumference * (1 - (Math.min(100, Math.max(0, Number(score) || 0)) / 100))

    return (
        <div className="karaokePage resultsPage">
            <div className="results-container">

                {/* Header: Analysis Title & Time */}
                <div className="results-header-row">
                    <div className="analysis-logo">
                        <span className="analysis-logo-text">分析採点</span>
                        <span className="analysis-logo-sub">マスター</span>
                    </div>
                    <div className="results-time-info">
                        {new Date().toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        <span className="guest-name">ゲスト さん</span>
                    </div>
                </div>

                {/* Main Body */}
                <div className="results-main-body">

                    {/* Left: Bar Graph Analysis */}
                    <div className="analysis-bars-section">
                        {Object.entries(analysisdata).map(([key, data]) => (
                            <div className={`analysis-bar-new bar-type-${key}`} key={key}>
                                <div className="bar-fill-layer" style={{ width: `${(data.val / data.max) * 100}%` }}></div>
                                <div className="bar-content-layer">
                                    <div className="bar-label-new">{data.label}</div>
                                    <div className="bar-value-new">
                                        <span className="val-big">{data.val}</span>
                                        <span className="val-small">/{data.max}点</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Center: Big Score */}
                    <div className="center-score-section">
                        <div className="total-score-circle">
                            {/* Score Progress Ring */}
                            <svg className="score-ring-svg" viewBox="0 0 100 100">
                                <defs>
                                    <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#0080e8ff" />
                                        <stop offset="100%" stopColor="#0900aaff" />
                                    </linearGradient>
                                </defs>

                                {/* Base Background Circle (Outer) */}
                                <circle
                                    cx={SCORE_RING_CONFIG.cx}
                                    cy={SCORE_RING_CONFIG.cy}
                                    r={SCORE_RING_CONFIG.radius + SCORE_RING_CONFIG.strokeWidth}
                                    fill="rgba(0, 0, 0, 0.5)"
                                />

                                {/* Background Circle (Gradient Fill) */}
                                <circle
                                    cx={SCORE_RING_CONFIG.cx}
                                    cy={SCORE_RING_CONFIG.cy}
                                    r={47.5} /* Fill to ring edge */
                                    fill="url(#scoreGradient)"
                                />

                                {/* Track Ring */}
                                <circle
                                    className="score-ring-bg"
                                    cx={SCORE_RING_CONFIG.cx}
                                    cy={SCORE_RING_CONFIG.cy}
                                    r={SCORE_RING_CONFIG.radius}
                                    fill="none"
                                    style={{ strokeWidth: SCORE_RING_CONFIG.strokeWidth }}
                                />

                                {/* Progress Ring */}
                                <circle
                                    className="score-ring-progress"
                                    cx={SCORE_RING_CONFIG.cx}
                                    cy={SCORE_RING_CONFIG.cy}
                                    r={SCORE_RING_CONFIG.radius}
                                    fill="none"
                                    transform={`translate(100, 0) scale(-1, 1) rotate(-90 ${SCORE_RING_CONFIG.cx} ${SCORE_RING_CONFIG.cy})`}
                                    style={{
                                        strokeWidth: SCORE_RING_CONFIG.strokeWidth,
                                        strokeDasharray: circumference,
                                        strokeDashoffset: progressOffset,
                                        strokeLinecap: 'butt'
                                    }}
                                />
                            </svg>

                            <div className="total-score-content">
                                <div className="total-score-label">TOTAL<br />総合得点</div>
                                <div className="total-score-value">
                                    <div className="ts-int-row">{intPart}</div>
                                    <div className="ts-dec-row">
                                        <span className="ts-dec">.{decPart}</span>
                                        <span className="ts-unit">点</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Song Information & Calories */}
                    <div className="right-song-section">
                        <div className="song-info-list">
                            <div className="song-info-row">
                                <div className="song-info-badge">曲名</div>
                                <div className="song-info-val">{songInfo.title}</div>
                            </div>
                            <div className="song-info-row">
                                <div className="song-info-badge">歌手名</div>
                                <div className="song-info-val">♪ {songInfo.artist}</div>
                            </div>
                            <div className="song-info-row">
                                <div className="song-info-badge">全国平均</div>
                                <div className="song-info-val">74.123 点</div>
                            </div>
                            <div className="song-info-row">
                                <div className="song-info-badge">全国順位</div>
                                <div className="song-info-val">1 位</div>
                            </div>
                            {/* Calories integrated as a row */}
                            <div className="song-info-row">
                                <div className="song-info-badge">消費</div>
                                <div className="song-info-val calorie-val">12 kcal <span className="fire-icon">🔥</span></div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Bottom Details (Technique, Vibrato, Rhythm) */}
                <div className="details-section">

                    {/* Technique Detail */}
                    <div className="detail-box tech-detail">
                        <div className="detail-circle-badge">
                            <div className="badge-content">
                                <div className="badge-small">テクニック</div>
                                <div className="badge-large">詳細</div>
                            </div>
                        </div>
                        <div className="tech-list">
                            <div className="tech-row color-kobushi">
                                <span className="tech-icon-circle">~</span>
                                <span className="tech-name">こぶし</span>
                                <span className="tech-count">{techniques?.kobushi || 0}</span>
                                <span className="tech-unit">回</span>
                            </div>
                            <div className="tech-row color-shakuri">
                                <span className="tech-icon-circle">↝</span>
                                <span className="tech-name">しゃくり</span>
                                <span className="tech-count">{techniques?.glissup || 0}</span>
                                <span className="tech-unit">回</span>
                            </div>
                            <div className="tech-row color-vibrato">
                                <span className="tech-icon-circle">〰</span>
                                <span className="tech-name">ビブラート</span>
                                <span className="tech-count">{techniques?.vibrato || 0}</span>
                                <span className="tech-unit">回</span>
                            </div>
                        </div>
                    </div>

                    {/* Vibrato Type (Mock) */}
                    <div className="detail-box vibrato-type">
                        <div className="detail-header">ビブラートタイプ</div>
                        <div className="vibrato-grid">
                            <div className="v-row">
                                <div className="v-label">早い</div>
                                <div className="v-cell">〰</div><div className="v-cell">〰</div><div className="v-cell">〰</div>
                            </div>
                            <div className="v-row">
                                <div className="v-label">標準</div>
                                <div className="v-cell selected">〰</div><div className="v-cell">〰</div><div className="v-cell">〰</div>
                            </div>
                            <div className="v-row">
                                <div className="v-label">遅い</div>
                                <div className="v-cell">〰</div><div className="v-cell">〰</div><div className="v-cell">〰</div>
                            </div>
                            <div className="v-footer">
                                <span>浅い</span><span>標準</span><span>深い</span>
                            </div>
                        </div>
                    </div>

                    {/* Rhythm (Mock) */}
                    <div className="detail-box rhythm-box">
                        <div className="detail-header">リズム</div>
                        <div className="rhythm-meter">
                            <div className="rhythm-bar">
                                <div className="rhythm-center-line"></div>
                                <div className="rhythm-fill"></div>
                            </div>
                        </div>
                        <div className="rhythm-labels">
                            <span>後ろノリ</span>
                            <span>前ノリ</span>
                        </div>
                    </div>

                </div>

                {/* Footer Buttons */}
                <div className="results-footer-bar">
                    <button className="footer-btn red" onClick={onNext}>演奏停止</button>
                    <div className="spacer"></div>
                    <button className="footer-btn blue">音程強化モード</button>
                    <button className="footer-btn blue">マイルームに保存</button>
                    <button className="footer-btn cyan" onClick={onNext}>プレビュー</button>
                </div>

            </div>
        </div>
    )
}

export default ResultsPage
