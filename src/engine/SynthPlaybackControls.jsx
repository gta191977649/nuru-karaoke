import React from 'react'
import { Button, Form } from 'react-bootstrap'
import { synthEngine } from './SynthEngine.js'
import { useKaraokeStore } from '../state/karaokeStore.js'

export default function SynthPlaybackControls() {
    const ready = useKaraokeStore((s) => s.ready)
    const midiName = useKaraokeStore((s) => s.midiName)
    const isPlaying = useKaraokeStore((s) => s.isPlaying)
    const duration = useKaraokeStore((s) => s.duration)
    const currentTime = useKaraokeStore((s) => s.currentTime)

    const canPlay = Boolean(midiName) && ready

    return (
        <div className="p-3 border rounded-3">
            <div className="fw-semibold mb-2">Playback</div>
            <div className="d-flex flex-wrap gap-2 mb-2">
                <Button
                    onClick={() => synthEngine.play()}
                    disabled={!canPlay || isPlaying}
                    variant="outline-primary"
                    type="button"
                >
                    Play
                </Button>
                <Button
                    onClick={() => synthEngine.pause()}
                    disabled={!canPlay || !isPlaying}
                    variant="outline-secondary"
                    type="button"
                >
                    Pause
                </Button>
                <Button
                    onClick={() => synthEngine.stop()}
                    disabled={!canPlay}
                    variant="outline-danger"
                    type="button"
                >
                    Stop
                </Button>
                <Button
                    onClick={() => synthEngine.panic()}
                    disabled={!ready}
                    variant="outline-secondary"
                    type="button"
                    title="Send All Notes Off / All Sound Off to all channels"
                >
                    Panic!
                </Button>
            </div>
            <Form.Range
                min={0}
                max={Math.max(0, duration)}
                step={0.01}
                value={Math.min(currentTime, Math.max(0, duration))}
                disabled={!canPlay || duration <= 0}
                onChange={(e) => synthEngine.seek(Number(e.currentTarget.value))}
            />
            <div className="small text-muted">
                {currentTime.toFixed(2)} / {duration.toFixed(2)} s
            </div>
        </div>
    )
}
