
import React, { useState } from 'react'
import { Button, Row, Col, Form } from 'react-bootstrap'

const MOCK_RESULTS = [
    { id: 1, title: 'R.I.P.', artist: 'BUMP OF CHICKEN', type: 'original', starred: true },
    { id: 2, title: 'アリア(ビデオクリップバージョン)', artist: 'BUMP OF CHICKEN', type: 'original', starred: true },
    { id: 3, title: 'アルエ', artist: 'BUMP OF CHICKEN', type: 'original', starred: true },
    { id: 4, title: 'アンサー', artist: 'BUMP OF CHICKEN', type: 'anime', starred: true },
    { id: 5, title: '宇宙飛行士への手紙 (ビデオクリッ', artist: 'BUMP OF CHICKEN', type: 'original', starred: true },
    { id: 6, title: 'Aurora (ビデオクリップバージョン)', artist: 'BUMP OF CHICKEN', type: 'original', starred: true },
    { id: 7, title: 'オンリー ロンリー グローリー', artist: 'BUMP OF CHICKEN', type: 'original', starred: true },
    { id: 8, title: 'カルマ', artist: 'BUMP OF CHICKEN', type: 'original', starred: true },
]

function FindSongKeywords({ onBack }) {
    const [term, setTerm] = useState('BUMP OF CHICKEN')
    return (
        <div className="wiiFind h-100 d-flex flex-column">

            {/* Main Content */}
            <Row className="g-3 flex-grow-1 overflow-hidden">
                <Col xs={12} className="d-flex flex-column h-100">
                    <div className="wiiFind__hint mb-2">キーワードを入力して楽曲やアーティストを検索します。</div>

                    {/* Search Bar */}
                    <div className="wiiFind__inputRow">
                        <Form.Control
                            className="wiiFind__input"
                            value={term}
                            onChange={(e) => setTerm(e.target.value)}
                            placeholder="Enter keyword"
                        />
                        <Button className="wiiFind__delete" onClick={() => setTerm('')}>
                            <span className="wiiFind__deleteX">×</span>
                            Delete
                        </Button>
                    </div>

                    {/* Results List */}
                    <div className="wiiList">
                        {MOCK_RESULTS.map((song) => (
                            <div key={song.id} className="wiiList__item">
                                <div className="wiiList__iconBadgeContainer">
                                    {song.type === 'original' && (
                                        <div className="wiiList__iconBadge wiiList__iconBadge--original">
                                            本人<br />映像
                                        </div>
                                    )}
                                    {song.type === 'anime' && (
                                        <div className="wiiList__iconBadge wiiList__iconBadge--anime">
                                            アニメ<br />特撮
                                        </div>
                                    )}
                                </div>

                                <div className="wiiList__title">{song.title}</div>
                                <div className="wiiList__artist">{song.artist}</div>

                                <div className="d-flex gap-2 ms-auto">
                                    <Button className="wiiList__actionBtn">
                                        <span className="me-1 text-warning" style={{ textShadow: '0 1px 0 rgba(0,0,0,0.2)' }}>★</span>
                                        マイうた
                                    </Button>
                                    <Button className="wiiList__actionBtn wiiList__actionBtn--reserve">
                                        予約
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Col>
            </Row>
        </div>
    )
}

export default FindSongKeywords
