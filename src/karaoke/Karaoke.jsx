import { useState, useCallback } from 'react'
import SingingPage from './pages/SingingPage.jsx'
import ResultsPage from './pages/ResultsPage.jsx'

function Karaoke() {
  const [view, setView] = useState('singing') // 'singing' | 'results'
  const [resultsData, setResultsData] = useState(null)

  const handleFinish = useCallback((data) => {
    setResultsData(data)
    setView('results')
  }, [])

  const handleNext = useCallback(() => {
    setView('singing')
    setResultsData(null)
  }, [])

  if (view === 'results' && resultsData) {
    return (
      <ResultsPage
        score={resultsData.score}
        techniques={resultsData.techniques}
        songInfo={resultsData.songInfo}
        onNext={handleNext}
      />
    )
  }

  return <SingingPage onFinish={handleFinish} />
}

export default Karaoke
