import { Button, Container, ListGroup, Tab, Tabs } from 'react-bootstrap'
import { synthEngine } from '../engine/SynthEngine.js'
import { useSynthEngine } from '../engine/useSynthEngine.js'
import useAlertStore from '../state/alertStore.js'

function ViewSelectedSong({ onBack, onOpenKaraoke }) {
  const state = useSynthEngine()

  const reserved = state.queue.map((song, idx) => ({ song, idx }))
  const history = state.history || []
  const showAlert = useAlertStore((store) => store.showAlert)

  return (
    <Container className="py-3" style={{ maxWidth: 860 }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 m-0">現在の予約</h1>
        <div className="d-flex gap-2">
          <Button variant="secondary" type="button" onClick={onBack}>
            Back
          </Button>
          <Button
            variant="outline-danger"
            type="button"
            disabled={!state.queue.length}
            onClick={() => synthEngine.clearQueue()}
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="mb-3 text-muted small">已予約: {reserved.length} / 历史: {history.length}</div>

      <Tabs defaultActiveKey="reserved" className="mb-3">
        <Tab eventKey="reserved" title="已予約">
          <ListGroup>
            {reserved.length ? (
              reserved.map(({ song, idx }, listIndex) => {
                const isCurrent = idx === state.queueIndex
                const nextIndex = state.queueIndex >= 0 ? state.queueIndex + 1 : 0
                const canBump = idx > nextIndex
                return (
                  <ListGroup.Item key={`${song.title}-${idx}`} className="d-flex align-items-center gap-3">
                    <div className="flex-grow-1">
                      <div className="fw-semibold">
                        {listIndex + 1}. {song.title}
                      </div>
                      <div className="text-muted small">{song.artist}</div>
                    </div>
                    {isCurrent ? (
                      <span className="badge text-bg-primary">Now Playing</span>
                    ) : (
                      canBump ? (
                        <Button
                          variant="outline-primary"
                          size="sm"
                          type="button"
                          onClick={() => {
                            synthEngine.bumpQueueNext(idx)
                            showAlert({
                              message: `${song.title} を割り込みしました`,
                              variant: 'info',
                              timeoutMs: 3000,
                            })
                          }}
                        >
                          割り込み
                        </Button>
                      ) : null
                    )}
                    {!isCurrent ? (
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        type="button"
                        onClick={() => synthEngine.removeFromQueue(idx)}
                      >
                        キャンセル
                      </Button>
                    ) : null}
                  </ListGroup.Item>
                )
              })
            ) : (
              <ListGroup.Item className="text-muted">No songs queued.</ListGroup.Item>
            )}
          </ListGroup>
        </Tab>
        <Tab eventKey="history" title="历史">
          <ListGroup>
            {history.length ? (
              history.map((song, idx) => (
                <ListGroup.Item key={`${song.title}-history-${idx}`} className="d-flex align-items-center gap-3">
                  <div className="flex-grow-1">
                    <div className="fw-semibold">
                      {idx + 1}. {song.title}
                    </div>
                    <div className="text-muted small">{song.artist}</div>
                  </div>
                  <span className="badge text-bg-secondary">Played</span>
                </ListGroup.Item>
              ))
            ) : (
              <ListGroup.Item className="text-muted">No history yet.</ListGroup.Item>
            )}
          </ListGroup>
        </Tab>
      </Tabs>
    </Container>
  )
}

export default ViewSelectedSong
