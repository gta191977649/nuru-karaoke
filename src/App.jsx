import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Col, Container, Row, Tab, Tabs } from 'react-bootstrap'
import WiiHomeMain, { SCREENS } from './home/WiiHomeMain.jsx'
import Karaoke from './karaoke/Karaoke.jsx'
import { synthEngine } from './engine/SynthEngine.js'
import { useSynthEngine } from './engine/useSynthEngine.js'
import useUiStore from './state/uiStore.js'
import WiiAlert from './components/WiiAlert.jsx'
import KeyChangeAlert from './components/KeyChangeAlert.jsx'
import useKeyChangeAlertStore from './state/keyChangeAlertStore.js'
import useAlertStore from './state/alertStore.js'
import './App.css'

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
  const synth = useSynthEngine()
  const showKeyChangeAlert = useKeyChangeAlertStore((state) => state.showKeyChangeAlert)
  const showAlert = useAlertStore((state) => state.showAlert)

  const isKaraoke = useMemo(
    () => screen === SCREENS.karaoke && karaokeActive && !karaokeMini,
    [screen, karaokeActive, karaokeMini],
  )
  const chromeVisible = !(screen === SCREENS.karaoke && karaokeActive && !karaokeMini)
  const showKaraokeDock = screen === SCREENS.karaoke || (screen === SCREENS.home && karaokeActive)

  const go = useCallback(
    (to) => {
      if (onNavigate) onNavigate(to)
      else window.location.assign(to)
    },
    [onNavigate],
  )

  const navigateScreen = useCallback(
    (next) => {
      if (next !== SCREENS.karaoke && karaokeActive) {
        setKaraokeMini(true)
      }
      setScreen(next)
    },
    [karaokeActive, setKaraokeMini, setScreen],
  )

  useEffect(() => {
    if (!karaokeActive || karaokeMini || screen !== SCREENS.karaoke) return
    const handleMove = () => {
      setKaraokeMini(true)
      setScreen(SCREENS.home)
    }
    window.addEventListener('mousemove', handleMove, { once: true })
    return () => window.removeEventListener('mousemove', handleMove)
  }, [karaokeActive, karaokeMini, screen, setKaraokeMini, setScreen])

  useEffect(() => {
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
                if (key === SCREENS.home) setScreen(SCREENS.home)
                if (key === SCREENS.moreModes) setScreen(SCREENS.moreModes)
                if (key === SCREENS.ticket) setScreen(SCREENS.ticket)
                if (key === SCREENS.singWithGamepad) setScreen(SCREENS.singWithGamepad)
              }}
              id="joy-top-tabs"
            >
              <Tab eventKey={SCREENS.home} title="曲を選ぶ" />
              <Tab eventKey={SCREENS.moreModes} title="採点" />
              <Tab eventKey={SCREENS.ticket} title="🎤 うたスキ" />
              <Tab eventKey={SCREENS.singWithGamepad} title="遊ぶ♪" />
            </Tabs>

            <div className="joyTopStatus">
              <div className="joyTopUser">
                <div className="joyTopUser__icon" aria-hidden="true" />
                <div className="joyTopUser__name">Nurupo</div>
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
            className={`karaokeDock ${screen === SCREENS.karaoke && !karaokeMini ? 'karaokeDock--full' : 'karaokeDock--mini'}`}
            style={{
              top: `${karaokeBase.top}px`,
              left: `${karaokeBase.left}px`,
              width: karaokeBase.width ? `${karaokeBase.width}px` : '100%',
              height: karaokeBase.height ? `${karaokeBase.height}px` : '100%',
              '--karaoke-mini-x': `${karaokeTransform.x}px`,
              '--karaoke-mini-y': `${karaokeTransform.y}px`,
              '--karaoke-mini-sx': karaokeTransform.sx,
              '--karaoke-mini-sy': karaokeTransform.sy,
            }}
            onClick={() => {
              if (screen !== SCREENS.home || !karaokeMini) return
              openKaraoke()
            }}
            role="button"
            tabIndex={0}
            aria-label="Karaoke view"
          >
            <div className="karaokeDock__move">
              <div className="karaokeDock__scale">
                <Karaoke />
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
                ♭
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
                ♯
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
                onClick={async () => {
                  if (!synth.midiName) return
                  showAlert({
                    message: '演奏を停止しました',
                    variant: 'warning',
                    timeoutMs: 3000,
                  })
                  await synthEngine.stopAndAdvance()
                }}
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
              <Button className="wiiFooterAction wiiFooterBtn--green" type="button" onClick={() => navigateScreen(SCREENS.queue)}>
                予約確認 <span className="wiiFooterAction__count">({synth.queue.length}曲)</span>
              </Button>
              <Button className="wiiFooterAction wiiFooterBtn--blue" type="button" onClick={() => go('/synth')}>
                音量/操作
              </Button>
            </div>
          </div>
        </footer>
      </Container>
    </div>
  )
}

export default App
