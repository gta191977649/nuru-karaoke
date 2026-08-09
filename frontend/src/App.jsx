import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Col, Container, Row, Tab, Tabs } from 'react-bootstrap'
import { UserRound } from 'lucide-react'
import WiiHomeMain from './home/WiiHomeMain.jsx'
import { SCREENS } from './home/screens.js'
import Karaoke from './karaoke/Karaoke.jsx'
import { synthEngine } from './engine/SynthEngine.js'
import { getKaraokeStoreState, useKaraokeStore } from './state/karaokeStore.js'
import { usePlayerScoreStore } from './state/playerScoreStore.js'
import useUiStore from './state/uiStore.js'
import WiiAlert from './components/WiiAlert.jsx'
import KeyChangeAlert from './components/KeyChangeAlert.jsx'
import useKeyChangeAlertStore from './state/keyChangeAlertStore.js'
import useAlertStore from './state/alertStore.js'
import useFavoriteStore from './state/favoriteStore.js'
import useUserStore from './state/userStore.js'
import { UI_CONFIG } from './config.js'
import { getUiAudioEngine } from './engine/audioEngine.js'
import './App.css'

const TRANSITION_MS = UI_CONFIG.karaokeTransitionMs
const MINI_TRANSITION_MS = 720

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function App({ onNavigate }) {
  const screen = useUiStore((state) => state.screen)
  const karaokeActive = useUiStore((state) => state.karaokeActive)
  const karaokeMini = useUiStore((state) => state.karaokeMini)
  const setScreen = useUiStore((state) => state.setScreen)
  const setKaraokeMini = useUiStore((state) => state.setKaraokeMini)
  const openKaraoke = useUiStore((state) => state.openKaraoke)
  const [karaokeTransform, setKaraokeTransform] = useState({
    x: 0,
    y: 0,
    sx: 1,
    sy: 1,
  })
  const frameRef = useRef(null)
  const mainRef = useRef(null)
  const karaokeTargetRef = useRef(null)
  const [karaokeBase, setKaraokeBase] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const synth = useKaraokeStore()
  const setKaraokeView = useKaraokeStore((state) => state.setKaraokeView)
  const resetPlayerScore = usePlayerScoreStore((state) => state.resetPlayerScore)
  const [transitionPhase, setTransitionPhase] = useState('idle')
  const transitionLockRef = useRef(false)
  const dockTransitionTimerRef = useRef(null)
  const [animateKaraokeDock, setAnimateKaraokeDock] = useState(false)
  const [karaokeResetKey, setKaraokeResetKey] = useState(0)
  const showKeyChangeAlert = useKeyChangeAlertStore((state) => state.showKeyChangeAlert)
  const showAlert = useAlertStore((state) => state.showAlert)
  const refreshUser = useUserStore((state) => state.refresh)
  const authStatus = useUserStore((state) => state.status)
  const accessToken = useUserStore((state) => state.accessToken)
  const isGuest = useUserStore((state) => state.isGuest)
  const user = useUserStore((state) => state.user)
  const loadFavorites = useFavoriteStore((state) => state.load)
  const resetFavorites = useFavoriteStore((state) => state.reset)

  const isKaraoke = useMemo(
    () => screen === SCREENS.karaoke && karaokeActive && !karaokeMini,
    [screen, karaokeActive, karaokeMini],
  )
  const chromeVisible = !(screen === SCREENS.karaoke && karaokeActive && !karaokeMini)
  const showKaraokeDock = screen === SCREENS.karaoke || karaokeActive
  const karaokeDockMode = screen === SCREENS.karaoke && !karaokeMini
    ? 'full'
    : screen === SCREENS.home && karaokeActive
      ? 'mini'
      : 'parked'

  const go = useCallback(
    (to) => {
      if (onNavigate) onNavigate(to)
      else window.location.assign(to)
    },
    [onNavigate],
  )

  const cancelKaraokeDockAnimation = useCallback(() => {
    if (dockTransitionTimerRef.current) {
      clearTimeout(dockTransitionTimerRef.current)
      dockTransitionTimerRef.current = null
    }
    setAnimateKaraokeDock(false)
  }, [])

  const startKaraokeDockAnimation = useCallback(() => {
    if (dockTransitionTimerRef.current) {
      clearTimeout(dockTransitionTimerRef.current)
    }
    setAnimateKaraokeDock(true)
    dockTransitionTimerRef.current = setTimeout(() => {
      dockTransitionTimerRef.current = null
      setAnimateKaraokeDock(false)
    }, MINI_TRANSITION_MS)
  }, [])

  const navigateScreen = useCallback(
    (next) => {
      cancelKaraokeDockAnimation()
      if (next !== SCREENS.karaoke && karaokeActive) {
        setKaraokeMini(true)
      }
      setScreen(next)
    },
    [cancelKaraokeDockAnimation, karaokeActive, setKaraokeMini, setScreen],
  )

  useEffect(() => {
    if (!karaokeActive || karaokeMini || screen !== SCREENS.karaoke) return
    const handleMove = () => {
      startKaraokeDockAnimation()
      setKaraokeMini(true)
      setScreen(SCREENS.home)
    }
    window.addEventListener('mousemove', handleMove, { once: true })
    return () => window.removeEventListener('mousemove', handleMove)
  }, [
    karaokeActive,
    karaokeMini,
    screen,
    setKaraokeMini,
    setScreen,
    startKaraokeDockAnimation,
  ])

  useEffect(() => () => {
    if (dockTransitionTimerRef.current) {
      clearTimeout(dockTransitionTimerRef.current)
    }
  }, [])

  useLayoutEffect(() => {
    if (!karaokeActive) return
    const updateTransform = () => {
      if (!frameRef.current || !mainRef.current) return
      const frameRect = frameRef.current.getBoundingClientRect()
      const baseRect = mainRef.current.getBoundingClientRect()
      setKaraokeBase({
        left: baseRect.left - frameRect.left,
        top: baseRect.top - frameRect.top,
        width: baseRect.width,
        height: baseRect.height,
      })
      if (!karaokeTargetRef.current) {
        setKaraokeTransform({ x: 0, y: 0, sx: 1, sy: 1 })
        return
      }
      const targetRect = karaokeTargetRef.current.getBoundingClientRect()
      const x = targetRect.left - baseRect.left
      const y = targetRect.top - baseRect.top
      const sx = targetRect.width / baseRect.width
      const sy = targetRect.height / baseRect.height
      setKaraokeTransform({ x, y, sx, sy })
    }
    if (!frameRef.current || !mainRef.current) return
    updateTransform()
    const frameObserver = new ResizeObserver(updateTransform)
    const mainObserver = new ResizeObserver(updateTransform)
    frameObserver.observe(frameRef.current)
    mainObserver.observe(mainRef.current)
    const targetObserver = karaokeTargetRef.current ? new ResizeObserver(updateTransform) : null
    if (targetObserver && karaokeTargetRef.current) targetObserver.observe(karaokeTargetRef.current)
    window.addEventListener('resize', updateTransform)
    return () => {
      frameObserver.disconnect()
      mainObserver.disconnect()
      if (targetObserver) targetObserver.disconnect()
      window.removeEventListener('resize', updateTransform)
    }
  }, [karaokeActive, karaokeMini, screen])

  // Global SFX Listener
  useEffect(() => {
    const uiAudio = getUiAudioEngine()
    const handleGlobalClick = (e) => {
      // Check if the clicked element or its parents is a button or link
      const target = e.target.closest('button, a, [role="button"]')
      if (target) {
        import('./config/sfxConfig.js').then(({ SFX }) => {
          uiAudio.playSfx(SFX.SELECT).catch(() => { })
        })
      }
    }
    window.addEventListener('click', handleGlobalClick, { capture: true })
    return () => window.removeEventListener('click', handleGlobalClick, { capture: true })
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  useEffect(() => {
    if (authStatus === 'authenticated' && accessToken) {
      loadFavorites(accessToken).catch(() => {})
      return
    }
    resetFavorites()
  }, [accessToken, authStatus, loadFavorites, resetFavorites])

  const runTransition = useCallback(async (action) => {
    if (transitionLockRef.current) return
    transitionLockRef.current = true
    setTransitionPhase('in')
    await wait(TRANSITION_MS)
    if (action) await action()
    setTransitionPhase('out')
    await wait(TRANSITION_MS)
    setTransitionPhase('idle')
    transitionLockRef.current = false
  }, [])

  const handleStop = useCallback(async () => {
    const hasQueued = Array.isArray(synth.queue) && synth.queue.length > 0
    if (!synth.midiName && !hasQueued) return
    showAlert({
      message: '演奏を停止しました',
      variant: 'warning',
      timeoutMs: 3000,
    })
    await runTransition(async () => {
      resetPlayerScore()
      setKaraokeResetKey((prev) => prev + 1)
      await synthEngine.stopAndAdvance({ fadeMs: TRANSITION_MS })
      const { queue, queueIndex } = getKaraokeStoreState()
      if (!queue.length && queueIndex < 0) {
        setKaraokeView('message')
      } else {
        setKaraokeView('singing')
      }
    })
  }, [resetPlayerScore, runTransition, setKaraokeView, showAlert, synth.midiName, synth.queue])

  const rawUserName = !isGuest && authStatus === 'authenticated'
    ? (user?.profile?.display_name || user?.username || 'USER')
    : 'GUEST'
  const displayUserName = rawUserName === 'GUEST' || rawUserName.endsWith('さん')
    ? rawUserName
    : `${rawUserName}さん`

  return (
    <div className="wiiHome">
      <WiiAlert />
      <KeyChangeAlert />
      <Container
        className={`wiiHome__frame ${isKaraoke ? 'wiiHome__frame--karaoke' : ''}`}
        fluid="lg"
        ref={frameRef}
      >
        <header className={`wiiHome__top ${chromeVisible ? '' : 'wiiHome__top--hidden'}`}>
          <div className="wiiTopBar joyTopBar">
            <Tabs
              className="joyTopNav"
              variant="tabs"
              activeKey={screen}
              onSelect={(key) => {
                if (!key) return
                if (key === SCREENS.home) navigateScreen(SCREENS.home)
                if (key === SCREENS.moreModes) navigateScreen(SCREENS.moreModes)
                if (key === SCREENS.settings) navigateScreen(SCREENS.settings)
                if (key === SCREENS.mySongs) navigateScreen(SCREENS.mySongs)
              }}
              id="joy-top-tabs"
            >
              <Tab eventKey={SCREENS.home} title="曲を選ぶ" />
              <Tab eventKey={SCREENS.moreModes} title="採点" />
              <Tab eventKey={SCREENS.mySongs} title="マイうた" />
              <Tab eventKey={SCREENS.settings} title="設定" />

            </Tabs>

            <div className="joyTopStatus">
              <div className="joyTopUser">
                <span className="joyTopUser__icon" aria-hidden="true">
                  <UserRound />
                </span>
                <div className="joyTopUser__name">{displayUserName}</div>
                <button
                  className="joyTopUser__switch"
                  type="button"
                  onClick={() => navigateScreen(SCREENS.auth)}
                >
                  ユーザー切替
                </button>
              </div>
              <div className="joyTopSignal" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </header>

        <WiiHomeMain
          screen={screen}
          onNavigate={navigateScreen}
          onOpenKaraoke={openKaraoke}
          karaokeTargetRef={karaokeTargetRef}
          mainRef={mainRef}
        />

        {showKaraokeDock ? (
          <div
            className={[
              'karaokeDock',
              `karaokeDock--${karaokeDockMode}`,
              animateKaraokeDock ? 'karaokeDock--animate-resize' : '',
            ].join(' ')}
            style={{
              top: `${karaokeBase.top}px`,
              left: `${karaokeBase.left}px`,
              width: karaokeBase.width ? `${karaokeBase.width}px` : '100%',
              height: karaokeBase.height ? `${karaokeBase.height}px` : '100%',
              '--karaoke-mini-x': `${karaokeTransform.x}px`,
              '--karaoke-mini-y': `${karaokeTransform.y}px`,
              '--karaoke-mini-sx': karaokeTransform.sx,
              '--karaoke-mini-sy': karaokeTransform.sy,
              '--karaoke-mini-transition-ms': `${MINI_TRANSITION_MS}ms`,
            }}
            onClick={() => {
              if (screen !== SCREENS.home || !karaokeMini) return
              startKaraokeDockAnimation()
              openKaraoke()
            }}
            role="button"
            tabIndex={karaokeDockMode === 'parked' ? -1 : 0}
            aria-label="Karaoke view"
            aria-hidden={karaokeDockMode === 'parked'}
          >
            <div className="karaokeDock__move">
              <div
                className="karaokeDock__scale"
                style={{ '--karaoke-transition-ms': `${TRANSITION_MS}ms` }}
              >
                <Karaoke
                  onStop={handleStop}
                  resetKey={karaokeResetKey}
                  transitionPhase={transitionPhase}
                  displayMode={karaokeDockMode}
                />
              </div>
            </div>
          </div>
        ) : null}

        <footer className={`wiiHome__footer ${chromeVisible ? '' : 'wiiHome__footer--hidden'}`}>
          <div className="wiiFooterBar">
            <div className="wiiFooterGroup">
              <Button className="wiiFooterBtn wiiFooterBtn--dark" type="button">
                ◀ 遅
              </Button>
              <Button className="wiiFooterBtn wiiFooterBtn--dark" type="button">
                速 ▶
              </Button>
              <Button
                className="wiiFooterBtn wiiFooterBtn--dark"
                type="button"
                onClick={async () => {
                  await synthEngine.resumeAudio()
                  synthEngine.shiftTransposition(-1)
                  showKeyChangeAlert((synth.transposition || 0) - 1)
                }}
              >
                ▼ ♭
              </Button>
              <Button
                className="wiiFooterBtn wiiFooterBtn--dark"
                type="button"
                onClick={async () => {
                  await synthEngine.resumeAudio()
                  synthEngine.shiftTransposition(1)
                  showKeyChangeAlert((synth.transposition || 0) + 1)
                }}
              >
                ▲ ♯
              </Button>
              <Button
                className="wiiFooterBtn wiiFooterBtn--dark"
                type="button"
                onClick={async () => {
                  await synthEngine.resumeAudio()
                  synthEngine.setTransposition(0)
                  showKeyChangeAlert(0)
                }}
              >
                原曲キー
              </Button>
              <Button
                className="wiiFooterBtn wiiFooterBtn--red"
                type="button"
                onClick={handleStop}
              >
                演奏停止
              </Button>
            </div>

            <div className="wiiFooterKaraokeControl" aria-label="Transport">
              <Button
                className="wiiFooterKaraokeControl__btn"
                type="button"
                onClick={() => synthEngine.seek(Math.max(0, synth.currentTime - 5))}
                disabled={!synth.midiName}
              >
                ◀◀
                <span>巻戻し</span>
              </Button>
              <Button
                className="wiiFooterKaraokeControl__btn"
                type="button"
                onClick={async () => {
                  await synthEngine.resumeAudio()
                  if (synth.isPlaying) synthEngine.pause()
                  else synthEngine.play()
                }}
                disabled={!synth.midiName}
              >
                {synth.isPlaying ? 'Ⅱ' : '▶'}
                <span>一時停止</span>
              </Button>
              <Button
                className="wiiFooterKaraokeControl__btn"
                type="button"
                onClick={() => synthEngine.seek(Math.min(synth.duration || 0, synth.currentTime + 5))}
                disabled={!synth.midiName}
              >
                ▶▶
                <span>早送り</span>
              </Button>
            </div>

            <div className="wiiFooterRight">
              <Button className="wiiFooterAction wiiFooterBtn--dark" type="button" onClick={() => go('/synth')}>
                DEBUG
              </Button>
              <Button className="wiiFooterAction wiiFooterBtn--blue" type="button">
                音量/操作
              </Button>

              <Button className="wiiFooterAction wiiFooterBtn--green" type="button" onClick={() => navigateScreen(SCREENS.queue)}>
                予約確認 <span className="wiiFooterAction__count">({synth.queue.length}曲)</span>
              </Button>
            </div>
          </div>
        </footer>
      </Container>
    </div>
  )
}

export default App
