import { useEffect } from 'react'
import { synthEngine } from './SynthEngine.js'

function SynthProvider({ children }) {
  useEffect(() => {
    synthEngine.ensureInitialized().catch((e) => {
      // handled via engine status; avoid throwing during render
      console.error(e)
    })
  }, [])

  return children
}

export default SynthProvider

