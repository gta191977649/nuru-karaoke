import { useState, useCallback } from 'react'
import SingingPage from './pages/SingingPage.jsx'
import ResultsPage from './pages/ResultsPage.jsx'
import { usePlayerScoreStore } from '../state/playerScoreStore.js'

function Karaoke() {
  const [view, setView] = useState('singing') // 'singing' | 'results'
  const resetPlayerScore = usePlayerScoreStore((store) => store.resetPlayerScore)

  const handleFinish = useCallback((data) => {
    setView('results')
  }, [])

  const handleNext = useCallback(() => {
    setView('singing')
    resetPlayerScore()
  }, [resetPlayerScore])

  if (view === 'results') {
    return <ResultsPage onNext={handleNext} />
  }

  return <SingingPage onFinish={handleFinish} />
}

export default Karaoke
