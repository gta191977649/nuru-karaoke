import { useCallback, useEffect } from 'react'
import SingingPage from './pages/SingingPage.jsx'
import ResultsPage from './pages/ResultsPage.jsx'
import MessagePage from './pages/MessagePage.jsx'
import { useKaraokeStore } from '../state/karaokeStore.js'

function Karaoke({ onStop, resetKey, transitionPhase = 'idle' }) {
  const view = useKaraokeStore((state) => state.karaokeView)
  const setView = useKaraokeStore((state) => state.setKaraokeView)
  const midiName = useKaraokeStore((state) => state.midiName)
  const queueIndex = useKaraokeStore((state) => state.queueIndex)
  const queueLength = useKaraokeStore((state) => state.queue.length)

  const handleFinish = useCallback(() => {
    setView('results')
  }, [setView])

  useEffect(() => {
    if (resetKey == null) return
    if (!queueLength && queueIndex < 0) {
      setView('message')
      return
    }
    setView('singing')
  }, [queueIndex, queueLength, resetKey, setView])

  useEffect(() => {
    if (!queueLength && queueIndex < 0) return
    if (!midiName && !Number.isInteger(queueIndex)) return
    setView('singing')
  }, [midiName, queueIndex, queueLength, setView])

  return (
    <div className="karaokeTransitionRoot">
      <div
        className={[
          'karaokeTransition',
          transitionPhase === 'in' ? 'karaokeTransition--in' : '',
          transitionPhase === 'out' ? 'karaokeTransition--out' : '',
        ].join(' ')}
      />
      {view === 'results' ? (
        <ResultsPage onNext={onStop} />
      ) : view === 'message' ? (
        <MessagePage />
      ) : (
        <SingingPage
          key={`${midiName}-${queueIndex}-${resetKey}`}
          onFinish={handleFinish}
        />
      )}
    </div>
  )
}

export default Karaoke
