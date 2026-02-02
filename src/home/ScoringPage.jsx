import React from 'react'
import { Button } from 'react-bootstrap'
import '../App.css'
// import scoringChart from '../assets/scoring_chart_placeholder.png'

const ScoringPage = ({ onBack, onStartScoring }) => {
    return (
        <div className="wiiScoringPage">
            {/* Header Removed */}

            {/* Main Content Card */}
            <div className="wiiScoring__content">
                <div className="wiiScoring__banner">
                    <div className="wiiScoring__bannerTitle">
                        <span className="wiiScoring__bannerTitleMain">周波採点</span>
                        <span className="wiiScoring__bannerTitleSub">DX</span>
                    </div>
                    <div className="wiiScoring__bannerSlogan">
                        新採点基準であなたの歌声を徹底分析!
                    </div>
                </div>

                <div className="wiiScoring__mainBody">
                    <div className="wiiScoring__leftCol">
                        <div className="wiiScoring__pointRow">
                            <div className="wiiScoring__pointLabel wiiScoring__pointLabel--pitch">音程</div>
                            <div className="wiiScoring__pointDesc">歌唱したフレーズ全体での音程一致率</div>
                        </div>
                        <div className="wiiScoring__pointRow">
                            <div className="wiiScoring__pointLabel wiiScoring__pointLabel--stability">安定感</div>
                            <div className="wiiScoring__pointDesc">音程がブレずに安定して歌唱できているか</div>
                        </div>
                        <div className="wiiScoring__pointRow">
                            <div className="wiiScoring__pointLabel wiiScoring__pointLabel--tone">ロングトーン</div>
                            <div className="wiiScoring__pointDesc">正しい音程で、安定して声を伸ばせているか</div>
                        </div>
                        <div className="wiiScoring__pointRow">
                            <div className="wiiScoring__pointLabel wiiScoring__pointLabel--rhythm">抑揚</div>
                            <div className="wiiScoring__pointDesc">曲の展開に応じて正しく抑揚をつけられているか</div>
                        </div>
                        <div className="wiiScoring__pointRow">
                            <div className="wiiScoring__pointLabel wiiScoring__pointLabel--tech">テクニック</div>
                            <div className="wiiScoring__pointDesc">こぶし、しゃくり、ビブラート、フォールなどの回数</div>
                        </div>
                    </div>

                    <div className="wiiScoring__rightCol">
                        <div className="wiiScoring__chartTitle">♪ 歌唱データを細かく分析</div>
                        <div className="wiiScoring__chartBox">
                            <div className="wiiScoring__chartMock">
                                {/* Pentagon Chart Placeholder */}
                                <div className="wiiScoring__pentagon">
                                    <span>97.3</span>
                                </div>
                            </div>
                        </div>
                        <div className="wiiScoring__chartFooter">♪ 人の感覚に近い採点基準</div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="wiiScoring__footer">
                <Button
                    className="wiiScoring__startBtn"
                    onClick={onStartScoring}
                >
                    採点スタート
                </Button>
            </div>
        </div>
    )
}

export default ScoringPage
