import { Button, Col, Row } from 'react-bootstrap'
import FindSongs from './FindSongs.jsx'
import ComfirnSong from './ComfirnSong.jsx'
import { setPendingSong } from '../engine/playerController.js'
import ViewSelectedSong from './ViewSelectedSong.jsx'
import FindSongKeywords from './FindSongKeywords.jsx'
import Leaderboard from './Leaderboard.jsx'
import ScoringPage from './ScoringPage.jsx'
import AuthScreen from './AuthScreen.jsx'
import SettingsPage from './SettingsPage.jsx'
import MySong from './MySong.jsx'
import ArtistPage from './ArtistPage.jsx'
import useUiStore from '../state/uiStore.js'
import { SCREENS } from './screens.js'
import logo from '../assets/logo.png'

function WiiScreen({ title, subtitle, onBack }) {
  return (
    <div className="wiiScreen">
      <div className="wiiScreen__card">
        <div className="wiiScreen__title">{title}</div>
        {subtitle ? <div className="wiiScreen__subtitle">{subtitle}</div> : null}
        <div className="wiiScreen__actions">
          <Button className="wiiBtn wiiScreen__back" type="button" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    </div>
  )
}

function WiiHomeMain({ screen, onNavigate, onOpenKaraoke, karaokeTargetRef, mainRef }) {
  const selectedArtist = useUiStore((state) => state.selectedArtist)
  const songSearchMode = useUiStore((state) => state.songSearchMode)
  const openSongSearch = useUiStore((state) => state.openSongSearch)
  const closeArtist = useUiStore((state) => state.closeArtist)
  const songDetailReturnScreen = useUiStore((state) => state.songDetailReturnScreen)
  const setSongDetailReturnScreen = useUiStore((state) => state.setSongDetailReturnScreen)

  if (screen !== SCREENS.home) {
    switch (screen) {
      case SCREENS.findSongs:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <FindSongs
              initialMode={songSearchMode}
              onBack={() => onNavigate(SCREENS.home)}
              onSelectSong={(song) => {
                setSongDetailReturnScreen(SCREENS.findSongs)
                onNavigate(SCREENS.comfirmSongs)
                setPendingSong(song)
              }}
            />
          </main>
        )
      case SCREENS.myRoom:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <WiiScreen title="My Room" subtitle="TODO: profile / history / favorites" onBack={() => onNavigate(SCREENS.home)} />
          </main>
        )
      case SCREENS.moreModes:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <ScoringPage onBack={() => onNavigate(SCREENS.home)} />
          </main>
        )
      case SCREENS.mySongs:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <MySong
              onBack={() => onNavigate(SCREENS.home)}
              onLogin={() => onNavigate(SCREENS.auth)}
              onOpenKaraoke={() => onOpenKaraoke && onOpenKaraoke()}
            />
          </main>
        )
      case SCREENS.settings:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <SettingsPage onBack={() => onNavigate(SCREENS.home)} />
          </main>
        )
      case SCREENS.comfirmSongs:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <ComfirnSong
              onBack={() => onNavigate(songDetailReturnScreen || SCREENS.findSongs)}
              onConfirm={() => {
                if (onOpenKaraoke) onOpenKaraoke()
              }}
            />
          </main>
        )
      case SCREENS.karaoke:
        return (
          <main className="wiiHome__main wiiHome__main--karaoke" ref={mainRef} />
        )
      case SCREENS.queue:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <ViewSelectedSong
              onBack={() => onNavigate(SCREENS.home)}
              onOpenKaraoke={() => onOpenKaraoke && onOpenKaraoke()}
            />
          </main>
        )
      case SCREENS.findSongKeywords:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <FindSongKeywords
              onBack={() => onNavigate(SCREENS.home)}
              onSelectSong={(song) => {
                setSongDetailReturnScreen(SCREENS.findSongKeywords)
                onNavigate(SCREENS.comfirmSongs)
                setPendingSong(song)
              }}
              onConfirm={() => {
                if (onOpenKaraoke) onOpenKaraoke()
              }}
            />
          </main>
        )
      case SCREENS.artist:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <ArtistPage
              artist={selectedArtist}
              onBack={closeArtist}
              onSelectSong={(song) => {
                setSongDetailReturnScreen(SCREENS.artist)
                onNavigate(SCREENS.comfirmSongs)
                setPendingSong(song)
              }}
              onConfirm={() => onOpenKaraoke?.()}
            />
          </main>
        )
      case SCREENS.leaderboard:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <Leaderboard onBack={() => onNavigate(SCREENS.home)} />
          </main>
        )
      case SCREENS.auth:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <AuthScreen onBack={() => onNavigate(SCREENS.home)} />
          </main>
        )

      default:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <WiiScreen title="Unknown" subtitle="Unknown screen" onBack={() => onNavigate(SCREENS.home)} />
          </main>
        )
    }
  }

  return (
    <main className="wiiHome__main joyHome" ref={mainRef}>
      <div className="joyHeader">
        <div className="joyBrand">
          <span className="joyBrand__main" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <img src={logo} alt="RAKUSONG" style={{ height: '1.8em', marginRight: '0.2em' }} />
            <span className="joyBrand__sub">v1.231</span>

          </span>
        </div>

      </div>

      <Row className="g-3 joyHero">
        <Col xs={12} lg={8}>
          <Row className="g-3">
            <Col xs={12} md={6}>
              <Button className="joyCard joyCard--artist w-100" type="button" onClick={() => openSongSearch('artist')}>
                <div className="joyCard__icon">🎤</div>
                <div className="joyCard__title">歌手名</div>
                <div className="joyCard__sub">ARTIST</div>
              </Button>
            </Col>
            <Col xs={12} md={6}>
              <Button className="joyCard joyCard--song w-100" type="button" onClick={() => openSongSearch('title')}>
                <div className="joyCard__icon">🎵</div>
                <div className="joyCard__title">曲 名</div>
                <div className="joyCard__sub">SONG</div>
              </Button>
            </Col>
          </Row>

          <Row className="g-3 joyTiles mt-1">
            <Col xs={6} md={6} lg={3}>
              <Button className="joyTile w-100" type="button">
                ジャンル
                <span className="joyTile__sub">GENRE</span>
              </Button>
            </Col>
            <Col xs={6} md={6} lg={3}>
              <Button className="joyTile w-100" type="button" onClick={() => onNavigate(SCREENS.leaderboard)}>
                ランキング
                <span className="joyTile__sub">RANKING</span>
              </Button>
            </Col>
            <Col xs={6} md={6} lg={3}>
              <Button className="joyTile w-100" type="button" onClick={() => onNavigate(SCREENS.findSongKeywords)}>
                キーワード
                <span className="joyTile__sub">KEYWORD</span>
              </Button>
            </Col>
            <Col xs={6} md={6} lg={3}>
              <Button className="joyTile w-100" type="button">
                選曲番号
                <span className="joyTile__sub">SONG NUMBER</span>
              </Button>
            </Col>
          </Row>
        </Col>
        <Col xs={12} lg={4}>
          <div className="joyInfo">
            <div className="joyInfo__label">演奏画面</div>
            <div className="joyInfo__media" ref={karaokeTargetRef}>
              <div className="joyInfo__overlay">ARENA SOUND</div>
            </div>
          </div>
        </Col>
      </Row>

      <Row className="g-3 joyBottom">
        <Col xs={12} md={6}>
          <button className="willInfoBtn" type="button">
            <span className="willInfoBtn__top">FOREIGN</span>
            <span className="willInfoBtn__bottom">中文 / 한글 / English / Others</span>
          </button>
        </Col>
        <Col xs={12} md={3}>
          <Button className="willInfoBtn" type="button">
            <span className="willInfoBtn__top">NURU ENGINE</span>
            <span className="willInfoBtn__bottom">最新音源情報</span>
          </Button>
        </Col>
        <Col xs={12} md={3}>
          <Button className="willInfoBtn" type="button">
            <span className="willInfoBtn__top">APPID</span>
            <span className="willInfoBtn__bottom">システム更新履歴ー覧</span>
          </Button>
        </Col>
      </Row>
    </main>
  )
}

export default WiiHomeMain
