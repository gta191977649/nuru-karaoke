import { useEffect, useState } from 'react'
import { Mic, TriangleAlert } from 'lucide-react'
import { useSettingsStore } from '../state/settingsStore.js'
import { resolveMicrophoneStatus } from './microphoneStatus.js'

function MicrophoneStatusButton({ onOpenSettings }) {
  const selectedDeviceId = useSettingsStore((state) => state.microphoneDeviceId)
  const [status, setStatus] = useState({ state: 'loading', deviceName: '' })

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices
    let cancelled = false
    const refreshDevices = async () => {
      if (!mediaDevices?.enumerateDevices) {
        if (!cancelled) setStatus({ state: 'unavailable', deviceName: '' })
        return
      }

      try {
        const result = resolveMicrophoneStatus(
          await mediaDevices.enumerateDevices(),
          selectedDeviceId,
        )
        if (cancelled) return
        setStatus({
          state: result.available ? 'available' : 'unavailable',
          deviceName: result.deviceName,
        })
      } catch {
        if (!cancelled) setStatus({ state: 'unavailable', deviceName: '' })
      }
    }
    const initialRefreshTimer = window.setTimeout(refreshDevices, 0)
    mediaDevices?.addEventListener?.('devicechange', refreshDevices)
    return () => {
      cancelled = true
      window.clearTimeout(initialRefreshTimer)
      mediaDevices?.removeEventListener?.('devicechange', refreshDevices)
    }
  }, [selectedDeviceId])

  const unavailable = status.state === 'unavailable'
  const loading = status.state === 'loading'
  const title = unavailable
    ? 'マイクが検出されません。クリックしてマイク設定を開きます。'
    : loading
      ? 'マイク入力を確認しています。'
      : `${status.deviceName}。クリックしてマイク設定を開きます。`

  return (
    <button
      className={`homeMicStatus${unavailable ? ' homeMicStatus--warning' : ''}`}
      type="button"
      onClick={onOpenSettings}
      title={title}
      aria-label={title}
    >
      <span className="homeMicStatus__icon" aria-hidden="true">
        {unavailable ? <TriangleAlert /> : <Mic />}
      </span>
      <span className="homeMicStatus__text">
        {unavailable
          ? 'マイクが検出されません。クリックしてマイク設定へ'
          : loading
            ? 'マイクを確認中…'
            : status.deviceName}
      </span>
    </button>
  )
}

export default MicrophoneStatusButton
