import { useEffect } from 'react'
import { synthEngine } from './SynthEngine.js'
import GlobalSynthLoadingModal from '../components/GlobalSynthLoadingModal.jsx'
import { useSettingsStore } from '../state/settingsStore.js'

function SynthProvider({ children }) {
  const autoGainEnabled = useSettingsStore((state) => state.autoGainEnabled)

  useEffect(() => {
    synthEngine.ensureInitialized().catch((e) => {
      // handled via engine status; avoid throwing during render
      console.error(e)
    })
  }, [])

  useEffect(() => {
    synthEngine.setAutoGainEnabled(autoGainEnabled)
  }, [autoGainEnabled])

  return (
    <>
      <GlobalSynthLoadingModal onRetry={() => synthEngine.ensureInitialized()} />
      {children}
    </>
  )
}

export default SynthProvider

