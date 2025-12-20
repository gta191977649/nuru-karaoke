import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Col, Container, Row } from 'react-bootstrap'
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
          <div className="wiiTopBar">
            <Button className="wiiBtn wiiBtn--addMii" type="button">
              <span className="wiiBtn__plus" aria-hidden="true">
                +
              </span>
              <span className="wiiBtn__twoLine">
                <span>Add</span>
                <span>Mii</span>
              </span>
            </Button>

            <div className="wiiTopBar__nav">
              <Button className="wiiBtn wiiBtn--nav" type="button" aria-label="Previous profile" />
              <div className="wiiTopBar__faces" aria-label="Profiles">
                <Button className="wiiFace wiiFace--active" type="button" aria-label="Profile 1" />
                <Button className="wiiFace" type="button" aria-label="Profile 2" />
                <Button className="wiiFace" type="button" aria-label="Profile 3" />
                <Button className="wiiFace" type="button" aria-label="Profile 4" />
              </div>
            </div>

            <div className="wiiTopBar__name">
              <div className="wiiTopBar__nameIcon" aria-hidden="true" />
              <div className="wiiTopBar__nameText">Nurupo</div>
             
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
          <Row className="g-2 g-md-3 align-items-center">
            <Col xs={12} md="auto">
              <Button className="wiiBottomBtn wiiBottomBtn--blue w-100" type="button">
                Karaoke
                <br />
                Settings
              </Button>
            </Col>

            

            <Col xs={12} md="auto">
              <Button className="wiiBottomBtn wiiBottomBtn--disabled w-100" type="button" disabled>
                Skip Song
              </Button>
            </Col>

             <Col xs={12} md="auto">
               <Button className="wiiBtn wiiTopBar__synth" type="button" onClick={() => go('/synth')}>
                Synth Debug
              </Button>
            </Col>

            
            <Col xs={12} md>
              <div className="wiiPills">
                <div className="wiiHex" aria-hidden="true">
                  <div className="wiiHex__grid">
                    <div className="wiiHex__cell" onClick={async () => {
                      await synthEngine.resumeAudio()
                      synthEngine.shiftTransposition(1)
                      showKeyChangeAlert((synth.transposition || 0) + 1)
                    }}>▲</div>
                    <div className="wiiHex__cell">♯</div>
                    <div className="wiiHex__cell" onClick={async () => {
                      await synthEngine.resumeAudio()
                      synthEngine.shiftTransposition(-1)
                      showKeyChangeAlert((synth.transposition || 0) - 1)
                    }}>▼</div>
                    <div className="wiiHex__cell">♭</div>
                  </div>
                </div>
                <div className="wiiOriginalKey" aria-label="Transposition">
                  Key {synth.transposition > 0 ? `+${synth.transposition}` : String(synth.transposition)}
                </div>
                <div className="wiiTransport" aria-label="Transport">
                  <Button
                    className="wiiTransport__btn"
                    type="button"
                   
                  />
                  <Button
                    className="wiiTransport__btn wiiTransport__btn--play"
                    type="button"
                    aria-label={synth.isPlaying ? 'Pause' : 'Play'}
                    onClick={async () => {
                      await synthEngine.resumeAudio()
                      if (synth.isPlaying) synthEngine.pause()
                      else synthEngine.play()
                    }}
                    disabled={!synth.midiName}
                  />
                  <Button
                    className="wiiTransport__btn"
                    type="button"

                    
                  />
                </div>
              </div>
            </Col>
              <Col xs={12} md="auto">
                <Button
                  className="wiiReserveBtn"
                  type="button"
                  onClick={async () => {
                    if (!synth.isPlaying) return
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
              </Col>
            <Col xs={12} md="auto">
              <div className="wiiFooterRight">
                
                <Button
                  className="wiiReserveBtn w-100"
                  type="button"
                  onClick={() => navigateScreen(SCREENS.queue)}
                >
                  現在の予約<hr className="wiiReserveBtn__hr" />
                  <span className="wiiReserveBtn__count">
                    <span className="wiiReserveBtn__num">{synth.queue.length}</span>曲
                  </span>
                </Button>
              </div>
            </Col>
          </Row>
        </footer>
      </Container>
    </div>
  )
}

export default App
