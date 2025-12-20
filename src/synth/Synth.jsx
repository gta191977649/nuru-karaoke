import { useMemo, useState } from 'react'
import { Button, Col, Container, Form, Row } from 'react-bootstrap'
import { synthEngine } from './SynthEngine.js'
import { useSynthEngine } from './useSynthEngine.js'

function Synth({ onNavigateHome }) {
  const state = useSynthEngine()
  const [midiUrl, setMidiUrl] = useState('')

  const canPlay = useMemo(() => Boolean(state.midiName) && state.ready, [state.midiName, state.ready])

  return (
    <Container className="py-3" style={{ maxWidth: 860 }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 m-0">SynthEngine</h1>
        <div className="d-flex gap-2">
          <Button variant="secondary" onClick={onNavigateHome} type="button">
            Back
          </Button>
          <Button
            variant="outline-primary"
            onClick={() => synthEngine.resumeAudio()}
            disabled={!state.ready}
            type="button"
          >
            Resume Audio
          </Button>
        </div>
      </div>

      <div className="mb-3">
        <div className="small text-muted">Status</div>
        <div>{state.status}</div>
      </div>

      <Row className="g-3">
        <Col xs={12}>
          <div className="p-3 border rounded-3">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-semibold">SoundFont</div>
                <div className="small text-muted">{state.soundFontName}</div>
              </div>
            </div>
          </div>
        </Col>

        <Col xs={12}>
          <div className="p-3 border rounded-3">
            <div className="fw-semibold mb-2">MIDI</div>
            <Row className="g-2 align-items-center">
              <Col xs={12} md>
                <Form.Control
                  placeholder="MIDI URL (e.g. /songs/demo.mid)"
                  value={midiUrl}
                  onChange={(e) => setMidiUrl(e.target.value)}
                />
              </Col>
              <Col xs="auto">
                <Button
                  onClick={async () => {
                    await synthEngine.resumeAudio()
                    await synthEngine.loadMidiFromUrl(midiUrl)
                  }}
                  disabled={!midiUrl || !state.ready}
                  type="button"
                >
                  Load URL
                </Button>
              </Col>
              <Col xs={12} md="auto">
                <Form.Control
                  type="file"
                  accept=".mid,.midi"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    await synthEngine.resumeAudio()
                    await synthEngine.loadMidiFromFile(file)
                  }}
                  disabled={!state.ready}
                />
              </Col>
            </Row>
            <div className="small text-muted mt-2">Loaded: {state.midiName || '—'}</div>
          </div>
        </Col>

        <Col xs={12}>
          <div className="p-3 border rounded-3">
            <div className="fw-semibold mb-2">Playback</div>
            <div className="d-flex flex-wrap gap-2 mb-2">
              <Button onClick={() => synthEngine.play()} disabled={!canPlay || state.isPlaying} type="button">
                Play
              </Button>
              <Button
                onClick={() => synthEngine.pause()}
                disabled={!canPlay || !state.isPlaying}
                variant="secondary"
                type="button"
              >
                Pause
              </Button>
              <Button onClick={() => synthEngine.stop()} disabled={!canPlay} variant="outline-danger" type="button">
                Stop
              </Button>
            </div>
            <Form.Range
              min={0}
              max={Math.max(0, state.duration)}
              step={0.01}
              value={Math.min(state.currentTime, Math.max(0, state.duration))}
              disabled={!canPlay || state.duration <= 0}
              onChange={(e) => synthEngine.seek(Number(e.currentTarget.value))}
            />
            <div className="small text-muted">
              {state.currentTime.toFixed(2)} / {state.duration.toFixed(2)} s
            </div>
          </div>
        </Col>

        <Col xs={12} md={6}>
          <div className="p-3 border rounded-3">
            <div className="fw-semibold mb-2">Effects</div>
            <Form.Label className="small">Reverb ({state.reverbGain.toFixed(2)})</Form.Label>
            <Form.Range
              min={0}
              max={2}
              step={0.01}
              value={state.reverbGain}
              disabled={!state.ready}
              onChange={(e) => synthEngine.setReverbGain(Number(e.currentTarget.value))}
            />
            <Form.Label className="small">Chorus ({state.chorusGain.toFixed(2)})</Form.Label>
            <Form.Range
              min={0}
              max={2}
              step={0.01}
              value={state.chorusGain}
              disabled={!state.ready}
              onChange={(e) => synthEngine.setChorusGain(Number(e.currentTarget.value))}
            />

            <div className="d-flex align-items-center justify-content-between mt-3">
              <div>
                <div className="small text-muted">Transposition</div>
                <div className="fw-semibold">
                  {state.transposition > 0 ? `+${state.transposition}` : String(state.transposition)} semitones
                </div>
              </div>
              <div className="d-flex gap-2">
                <Button
                  variant="outline-secondary"
                  type="button"
                  disabled={!state.ready}
                  onClick={() => synthEngine.shiftTransposition(-1)}
                >
                  -1
                </Button>
                <Button
                  variant="outline-secondary"
                  type="button"
                  disabled={!state.ready}
                  onClick={() => synthEngine.setTransposition(0)}
                >
                  0
                </Button>
                <Button
                  variant="outline-secondary"
                  type="button"
                  disabled={!state.ready}
                  onClick={() => synthEngine.shiftTransposition(1)}
                >
                  +1
                </Button>
              </div>
            </div>
          </div>
        </Col>

        <Col xs={12} md={6}>
          <div className="p-3 border rounded-3">
            <div className="fw-semibold mb-2">Lyrics</div>
            <Form.Control
              type="file"
              accept=".lrc,text/plain"
              disabled={!state.ready}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                await synthEngine.loadLrcFromFile(file)
              }}
            />
            <div className="small text-muted mt-2">Loaded: {state.lrcName || '—'}</div>
            <Form.Label className="small mt-2">Offset (ms): {state.lyricOffsetMs}</Form.Label>
            <Form.Range
              min={-3000}
              max={3000}
              step={10}
              value={state.lyricOffsetMs}
              disabled={!state.ready}
              onChange={(e) => synthEngine.setLyricOffsetMs(Number(e.currentTarget.value))}
            />
          </div>
        </Col>

        <Col xs={12}>
          <div className="p-3 border rounded-3">
            <div className="fw-semibold mb-2">Channels</div>
            <Row className="g-2">
              {state.enabledChannels.map((enabled, idx) => (
                <Col key={idx} xs={12} sm={6} md={4} lg={3}>
                  <Form.Check
                    type="switch"
                    id={`ch-${idx + 1}`}
                    checked={enabled}
                    disabled={!state.ready}
                    onChange={(e) => synthEngine.setChannelEnabled(idx, e.currentTarget.checked)}
                    label={`Ch ${idx + 1}: ${state.channelInstrumentNames[idx]}`}
                  />
                </Col>
              ))}
            </Row>
          </div>
        </Col>
      </Row>
    </Container>
  )
}

export default Synth
