import { useCallback, useEffect } from 'react'
import SingingPage from './pages/SingingPage.jsx'
import ResultsPage from './pages/ResultsPage.jsx'
import { useKaraokeStore } from '../state/karaokeStore.js'

function Karaoke({ onStop, resetKey, transitionPhase = 'idle' }) {
  const view = useKaraokeStore((state) => state.karaokeView)
  const setView = useKaraokeStore((state) => state.setKaraokeView)
  const midiName = useKaraokeStore((state) => state.midiName)
  const queueIndex = useKaraokeStore((state) => state.queueIndex)

  const handleFinish = useCallback(() => {
    setView('results')
  }, [setView])

  useEffect(() => {
    if (resetKey == null) return
    setView('singing')
  }, [resetKey, setView])

  useEffect(() => {
    if (!midiName && !Number.isInteger(queueIndex)) return
    setView('singing')
  }, [midiName, queueIndex, setView])

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
      ) : (
        <SingingPage onFinish={handleFinish} />
      )}
    </div>
  )
}

export default Karaoke
