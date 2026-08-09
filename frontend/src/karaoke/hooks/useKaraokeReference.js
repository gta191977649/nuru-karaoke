import { useEffect, useState } from 'react'
import { synthEngine } from '../../engine/SynthEngine.js'
import { extractReferenceMelodyFromMidiData } from '../../engine/audio/midi/referenceMelody.js'

function useKaraokeReference({ ready, midiName, midiUrl, queueIndex }) {
  const [reference, setReference] = useState(null)

  useEffect(() => {
    if (!ready || !midiName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReference(null)
      return
    }
    let active = true
    synthEngine
      .getMidiData()
      .then((midiData) => {
        if (!active) return
        if (midiData) setReference(extractReferenceMelodyFromMidiData(midiData, { channel: 0 }))
        else setReference(null)
      })
      .catch(() => {
        if (active) setReference(null)
      })
    return () => {
      active = false
    }
  }, [ready, midiName, midiUrl, queueIndex])

  return reference
}

export { useKaraokeReference }
