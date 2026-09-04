import { useCallback, useEffect } from 'react'
import SingingPage from './pages/SingingPage.jsx'
import ResultsPage from './pages/ResultsPage.jsx'
import MessagePage from './pages/MessagePage.jsx'
import { useKaraokeStore } from '../state/karaokeStore.js'

function Karaoke({ onStop, onResultsNext, resultsExitError, resetKey, transitionPhase = 'idle', displayMode = 'full' }) {
  const view = useKaraokeStore((state) => state.karaokeView)
  const setView = useKaraokeStore((state) => state.setKaraokeView)
  const midiName = useKaraokeStore((state) => state.midiName)
  const queueIndex = useKaraokeStore((state) => state.queueIndex)
  const queueLength = useKaraokeStore((state) => state.queue.length)
  const playbackSessionId = useKaraokeStore((state) => state.playbackSessionId)

  const handleFinish = useCallback(() => {
    setView('results')
  }, [setView])

  useEffect(() => {
    // Queue edits/loading must not dismiss results or remount a finished song.
    if (useKaraokeStore.getState().karaokeView === 'results') return
    if (resetKey == null) return
    if (!queueLength && queueIndex < 0) {
      setView('message')
      return
    }
    setView('singing')
  }, [queueIndex, queueLength, resetKey, setView])

  useEffect(() => {
    if (useKaraokeStore.getState().karaokeView === 'results') return
    if (!queueLength && queueIndex < 0) return
    if (!midiName && !Number.isInteger(queueIndex)) return
    setView('singing')
  }, [midiName, queueIndex, queueLength, setView])

  return (
    <div className={`karaokeTransitionRoot karaokeTransitionRoot--${displayMode}`}>
      <div
        className={[
          'karaokeTransition',
          transitionPhase === 'in' ? 'karaokeTransition--in' : '',
          transitionPhase === 'out' ? 'karaokeTransition--out' : '',
        ].join(' ')}
      />
      {view === 'results' ? (
        <ResultsPage onNext={onResultsNext || onStop} exiting={transitionPhase !== 'idle'} exitError={resultsExitError} />
      ) : view === 'message' ? (
        <MessagePage />
      ) : (
        <SingingPage
          key={`${playbackSessionId}-${resetKey}`}
          onFinish={handleFinish}
          showInterludePrompt={displayMode !== 'parked'}
        />
      )}
    </div>
  )
}

export default Karaoke
