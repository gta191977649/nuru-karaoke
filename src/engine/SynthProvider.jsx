import { useEffect } from 'react'
import { synthEngine } from './SynthEngine.js'

function SynthProvider({ children }) {
  useEffect(() => {
    synthEngine.ensureInitialized().catch(() => {
      // handled via engine status; avoid throwing during render
    })
  }, [])

  return children
}

export default SynthProvider

