import { useEffect, useSyncExternalStore } from 'react'
import { synthEngine } from './SynthEngine.js'

function useSynthEngine() {
  useEffect(() => {
    synthEngine.ensureInitialized().catch((err) => {
      // keep state updates inside engine; this is a last-resort surface
      console.error(err)
    })
  }, [])

  return useSyncExternalStore(
    (cb) => synthEngine.subscribe(cb),
    () => synthEngine.getSnapshot(),
    () => synthEngine.getSnapshot(),
  )
}

export { useSynthEngine }
