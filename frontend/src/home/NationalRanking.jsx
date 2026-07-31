import { useEffect, useState } from 'react'
import { Container, Row, Col, Card, Badge, Stack, Button, Spinner, Alert } from 'react-bootstrap'
import { Crown, User, MapPin, Trophy } from 'lucide-react';
import { fetchLeaderboard } from '../services/leaderboard.js'
import ArtistLink from '../components/ArtistLink.jsx'

export default function NationalRanking({ song, onBack }) {
    const [ranking, setRanking] = useState([])
    const [stats, setStats] = useState({ total_participants: 0, average_score: 0 })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        let ignore = false
        const load = async () => {
            if (!song?.id) return
            setLoading(true)
            setError(null)
            try {
                const data = await fetchLeaderboard(song.id)
                if (!ignore) {
                    const results = data.results || []
                    setRanking(results)

                    // Calculate stats if not provided by API
                    const total = data.total_participants !== undefined ? data.total_participants : results.length

                    let avg = 0
                    if (data.average_score !== undefined) {
                        avg = data.average_score
                    } else if (results.length > 0) {
                        const sum = results.reduce((acc, curr) => acc + (parseFloat(curr.score) || 0), 0)
                        avg = sum / results.length
                    }

                    setStats({
                        total_participants: total,
                        average_score: avg
                    })
                }
            } catch (err) {
                if (!ignore) {
                    console.error('Failed to load leaderboard', err)
                    setError('ランキングの読み込みに失敗しました。')
                }
            } finally {
                if (!ignore) setLoading(false)
            }
        }
        load()
        return () => { ignore = true }
    }, [song?.id])

    return (
        <Container fluid className="py-3">
            {/* Header Section */}
            <Card className="mb-3 shadow-none" style={{
                border: '1px solid #fab1da',
                backgroundColor: '#fff0f6',
                backgroundImage: `
          linear-gradient(rgba(233, 30, 99, 0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(233, 30, 99, 0.05) 1px, transparent 1px),
          linear-gradient(135deg, #fff0f6 0%, #ffeaf2 50%, #e6f7ff 100%)
        `,
                backgroundSize: '20px 20px, 20px 20px, 100% 100%'
            }}>
                <Card.Body className="p-4">
                    <Row className="align-items-center">

                        <Col>
                            <div className="mb-1">
                                <span className="px-3 py-1 rounded-pill fw-bold" style={{
                                    background: 'linear-gradient(to bottom, #ffd700, #ffa500)',
                                    color: '#fff',
                                    border: '2px solid #fff',

                                    textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                }}>全国採点</span>
                            </div>

                            <h1 className="fw-bold mb-0 lh-1" style={{
                                fontFamily: '"Arial Black", Gadget, sans-serif',
                                fontSize: '3.5rem',
                                background: "#0071bc",
                                backgroundClip: 'text',
                                WebkitBackgroundClip: 'text',
                                color: 'transparent',
                                WebkitTextStroke: '1px white',
                                filter: 'drop-shadow(0px 2px 0px rgba(0,0,0,0.2))'
                            }}>{song?.title || 'Pretender'}</h1>

                            <div className="fs-2 fw-bold" style={{
                                fontFamily: '"Arial Black", Gadget, sans-serif',
                                background: "#0071bc",
                                backgroundClip: 'text',
                                WebkitBackgroundClip: 'text',
                                color: 'transparent',
                                WebkitTextStroke: '1px white',
                                filter: 'drop-shadow(0px 2px 0px rgba(0,0,0,0.2))'
                            }}>
                                <ArtistLink artist={song?.artist || 'Official髭男dism'} />
                            </div>
                        </Col>
                        <Col xs="auto" className="text-end">
                            <div className="mb-3">
                                <div className="fw-bold" style={{
                                    fontSize: '0.9rem',
                                    color: '#0056b3',
                                    textShadow: '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff',
                                    letterSpacing: '0.05em'
                                }}>PARTICIPANTS</div>
                                <div className="fs-2 fw-bold lh-1" style={{
                                    color: '#0056b3',
                                    textShadow: '2px 2px 0 #fff, 0 0 5px rgba(0,0,0,0.1)'
                                }}>
                                    {loading ? '---' : stats.total_participants.toLocaleString()}
                                    <span className="fs-5 ms-1">人</span>
                                </div>
                            </div>
                            <div>
                                <div className="fw-bold" style={{
                                    fontSize: '0.9rem',
                                    color: '#0056b3',
                                    textShadow: '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff',
                                    letterSpacing: '0.05em'
                                }}>AVG. SCORE</div>
                                <div className="fs-2 fw-bold lh-1" style={{
                                    color: '#0056b3',
                                    textShadow: '2px 2px 0 #fff, 0 0 5px rgba(0,0,0,0.1)'
                                }}>
                                    {loading ? '---' : stats.average_score.toFixed(3)}
                                    <span className="fs-5 ms-1">点</span>
                                </div>
                            </div>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            {/* Ranking Section */}
            <Card className="bg-white border text-dark shadow-sm" style={{ minHeight: 400 }}>
                <Card.Header className="bg-light border-bottom py-3 d-flex justify-content-between align-items-center">
                    <div className="fw-bold fs-5 d-flex align-items-center">
                        <Trophy className="me-2 text-warning" size={20} /> 月間ランキング
                    </div>
                </Card.Header>
                <Card.Body className="p-0">
                    {loading && (
                        <div className="d-flex justify-content-center align-items-center py-5">
                            <Spinner animation="border" variant="primary" />
                        </div>
                    )}

                    {error && (
                        <div className="p-4">
                            <Alert variant="danger">{error}</Alert>
                        </div>
                    )}

                    {!loading && !error && ranking.length === 0 && (
                        <div className="text-center py-5 text-muted">
                            まだランキングデータがありません。
                        </div>
                    )}

                    {!loading && !error && (
                        <Stack gap={0}>
                            {ranking.map((item, index) => {
                                let medal = null
                                if (item.rank === 1) medal = 'gold'
                                if (item.rank === 2) medal = 'silver'
                                if (item.rank === 3) medal = 'bronze'

                                return (
                                    <div
                                        key={item.rank}
                                        className={`d-flex align-items-center p-3 border-bottom ${index % 2 === 0 ? 'bg-light' : ''}`}
                                    >
                                        {/* Rank */}
                                        <div className="text-center" style={{ width: 60 }}>
                                            {medal === 'gold' && <div className="mx-auto" style={{ width: 32 }}><Crown className="text-warning" size={32} fill="currentColor" /></div>}
                                            {medal === 'silver' && <div className="mx-auto" style={{ width: 32 }}><Crown className="text-secondary" size={32} fill="currentColor" /></div>}
                                            {medal === 'bronze' && <div className="mx-auto" style={{ width: 32 }}><Crown className="text-warning-emphasis" size={32} fill="currentColor" /></div>}
                                            {!medal && <div className="fs-4 fst-italic fw-bold text-muted">{item.rank}</div>}
                                            {medal && <div className="small fw-bold mt-n1 text-uppercase text-muted" style={{ fontSize: '0.6rem' }}>RANK</div>}
                                            {!medal && <div className="small fw-bold text-uppercase text-muted" style={{ fontSize: '0.6rem' }}>RANK</div>}
                                        </div>

                                        {/* User Avatar */}
                                        <div className="mx-3">
                                            <div
                                                className="rounded-circle d-flex align-items-center justify-content-center bg-white border border-dark"
                                                style={{ width: 48, height: 48 }}
                                            >
                                                <User size={24} className="text-dark" />
                                            </div>
                                        </div>

                                        {/* Name & Shop */}
                                        <div className="flex-grow-1">
                                            <div className="d-flex align-items-center gap-2">
                                                <span className="fw-bold fs-5 text-dark">{item.username || 'Unknown User'}</span>
                                                {item.rank === 1 && <Badge bg="warning" text="dark" className="small">全国制覇</Badge>}
                                            </div>
                                            <div className="small text-muted d-flex align-items-center">
                                                <MapPin size={14} className="me-1" /> {item.shop_name || 'Home'}
                                            </div>
                                        </div>

                                        {/* Score */}
                                        <div className="text-end">
                                            <div className="fs-2 fw-bold text-dark lh-1">
                                                {Number(item.score).toFixed(3)}
                                                <span className="fs-6 fw-normal ms-1 text-muted">点</span>
                                            </div>
                                            <div className="small text-muted">{item.updated_at ? new Date(item.updated_at).toLocaleDateString() : 'N/A'}</div>
                                        </div>
                                    </div>
                                )
                            })}
                        </Stack>
                    )}
                </Card.Body>
            </Card>

            <div className="mt-4 text-center">
                <Button variant="secondary" onClick={onBack} className="px-5 rounded-pill">
                    閉じる
                </Button>
            </div>
        </Container>
    )
}
