import { Button, Col, Row, Stack } from 'react-bootstrap'
import FindSongs from './FindSongs.jsx'
import ComfirnSong from './ComfirnSong.jsx'
import { synthEngine } from '../synth/SynthEngine.js'
import ViewSelectedSong from './ViewSelectedSong.jsx'

const SCREENS = {
  home: 'home',
  findSongs: 'findSongs',
  myRoom: 'myRoom',
  moreModes: 'moreModes',
  singWithGamepad: 'singWithGamepad',
  ticket: 'ticket',
  comfirmSongs: 'confirmSongs',
  karaoke: 'karaoke',
  queue: 'queue',
}

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
  if (screen !== SCREENS.home) {
    switch (screen) {
      case SCREENS.findSongs:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <FindSongs
              onBack={() => onNavigate(SCREENS.home)}
              onSelectSong={(song) => {
                onNavigate(SCREENS.comfirmSongs)
                synthEngine.setPendingSong(song)
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
            <WiiScreen title="More Modes" subtitle="TODO: scoring / game modes" onBack={() => onNavigate(SCREENS.home)} />
          </main>
        )
      case SCREENS.singWithGamepad:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <WiiScreen
              title="Sing with the Wii U GamePad!"
              subtitle="TODO: gamepad pairing/help screen"
              onBack={() => onNavigate(SCREENS.home)}
            />
          </main>
        )
      case SCREENS.ticket:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <WiiScreen title="Ticket" subtitle="TODO: subscription/ticket info" onBack={() => onNavigate(SCREENS.home)} />
          </main>
        )
      case SCREENS.comfirmSongs:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <ComfirnSong
              onBack={() => onNavigate(SCREENS.findSongs)}
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
        
      default:
        return (
          <main className="wiiHome__main" ref={mainRef}>
            <WiiScreen title="Unknown" subtitle="Unknown screen" onBack={() => onNavigate(SCREENS.home)} />
          </main>
        )
    }
  }

  return (
    <main className="wiiHome__main" ref={mainRef}>
      <Row className="g-3 g-md-4 align-items-stretch">
        <Col xs={12} lg={8}>
          <Stack gap={3}>
            <Button className="wiiBig wiiBig--findSongs" type="button" onClick={() => onNavigate(SCREENS.findSongs)}>
              <span className="wiiBig__magnifier" aria-hidden="true">
                <span className="wiiBig__lens" />
              </span>
              <span className="wiiBig__label">
                <span className="wiiBig__title">Find Songs</span>
                <span className="wiiBig__note" aria-hidden="true" />
              </span>
            </Button>

            <Row className="g-3">
              <Col xs={12} sm={6}>
                <Button className="wiiTile wiiTile--red w-100" type="button" onClick={() => onNavigate(SCREENS.myRoom)}>
                  My Room
                  <span className="wiiTile__corner wiiTile__corner--red" aria-hidden="true" />
                </Button>
              </Col>
              <Col xs={12} sm={6}>
                <Button className="wiiTile wiiTile--green w-100" type="button" onClick={() => onNavigate(SCREENS.moreModes)}>
                  <span className="wiiTile__stack">
                    <span>More</span>
                    <span>Modes</span>
                  </span>
                </Button>
              </Col>
            </Row>
          </Stack>
        </Col>

        <Col xs={12} lg={4}>
          <div className="wiiRight">
            <div className="wiiRight__mii" aria-hidden="true" ref={karaokeTargetRef} />
            <Stack gap={3}>
              <Button className="wiiCard wiiCard--sing" type="button" onClick={() => onNavigate(SCREENS.singWithGamepad)}>
                <div className="wiiCard__singIcons" aria-hidden="true">
                  ♪ ♫ ♬
                </div>
                <div className="wiiCard__singText">
                  <div className="wiiCard__singTitle">Sing with the</div>
                  <div className="wiiCard__singTitle">Wii U GamePad!</div>
                </div>
              </Button>

              <Button className="wiiCard wiiCard--ticket" type="button" onClick={() => onNavigate(SCREENS.ticket)}>
                <div className="wiiCard__ticketTop">Ticket</div>
                <div className="wiiCard__ticketMid">23</div>
                <div className="wiiCard__ticketBot">Hours Left</div>
              </Button>
            </Stack>
          </div>
        </Col>
      </Row>
    </main>
  )
}

export { SCREENS }
export default WiiHomeMain
