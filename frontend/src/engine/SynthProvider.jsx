import { useEffect } from 'react'
import { synthEngine } from './SynthEngine.js'
import GlobalSynthLoadingModal from '../components/GlobalSynthLoadingModal.jsx'
import { useSettingsStore } from '../state/settingsStore.js'

function SynthProvider({ children }) {
  const autoGainEnabled = useSettingsStore((state) => state.autoGainEnabled)
  const smuEqPreset = useSettingsStore(state => state.smuEqPreset)
  const smuEqLocked = useSettingsStore(state => state.smuEqLocked)
  useEffect(() => { synthEngine.setSmuEq(smuEqPreset, smuEqLocked) }, [smuEqPreset, smuEqLocked])

  useEffect(() => {
    synthEngine.ensureInitialized().catch((e) => {
      // handled via engine status; avoid throwing during render
      console.error(e)
    })
  }, [])

  useEffect(() => {
    const unlock = () => { void synthEngine.getAudioContext()?.resume().catch(() => {}) }
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('keydown', unlock, true)
    return () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
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

