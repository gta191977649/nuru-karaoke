import { useCallback, useEffect, useState } from 'react'
import { Form, Spinner } from 'react-bootstrap'

import { switchSharedMicDevice } from '../engine/audio/pitch/sharedPitchEngine.js'
import { useSettingsStore } from '../state/settingsStore.js'

function SettingsPage({ onBack }) {
  const guideMelodyEnabled = useSettingsStore((state) => state.guideMelodyEnabled)
  const autoGainEnabled = useSettingsStore((state) => state.autoGainEnabled)
  const microphoneDeviceId = useSettingsStore((state) => state.microphoneDeviceId)
  const setGuideMelodyEnabled = useSettingsStore((state) => state.setGuideMelodyEnabled)
  const setAutoGainEnabled = useSettingsStore((state) => state.setAutoGainEnabled)
  const setMicrophoneDeviceId = useSettingsStore((state) => state.setMicrophoneDeviceId)
  const [activeTab, setActiveTab] = useState('playback')
  const [microphones, setMicrophones] = useState([])
  const [isLoadingMicrophones, setIsLoadingMicrophones] = useState(false)
  const [microphoneMessage, setMicrophoneMessage] = useState('')

  const loadMicrophones = useCallback(async ({ requestPermission = false } = {}) => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMicrophones([])
      setMicrophoneMessage('このブラウザではマイク入力を選択できません。')
      return
    }

    setIsLoadingMicrophones(true)
    setMicrophoneMessage('')
    let permissionStream = null
    try {
      let devices = await navigator.mediaDevices.enumerateDevices()
      const hasVisibleInput = devices.some(
        (device) => device.kind === 'audioinput' && device.deviceId && device.label,
      )
      if (requestPermission && !hasVisibleInput && navigator.mediaDevices.getUserMedia) {
        permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        devices = await navigator.mediaDevices.enumerateDevices()
      }
      const inputs = devices.filter(
        (device) =>
          device.kind === 'audioinput' &&
          device.deviceId &&
          device.deviceId !== 'default' &&
          device.deviceId !== 'communications',
      )
      setMicrophones(inputs)
    } catch (error) {
      setMicrophones([])
      setMicrophoneMessage(error?.message || 'マイク一覧を取得できませんでした。')
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop())
      setIsLoadingMicrophones(false)
    }
  }, [])

  useEffect(() => {
    loadMicrophones()
    const mediaDevices = navigator.mediaDevices
    mediaDevices?.addEventListener?.('devicechange', loadMicrophones)
    return () => mediaDevices?.removeEventListener?.('devicechange', loadMicrophones)
  }, [loadMicrophones])

  const handleMicrophoneChange = async (event) => {
    const nextDeviceId = event.currentTarget.value
    setMicrophoneDeviceId(nextDeviceId)
    setMicrophoneMessage('')
    try {
      const didSwitch = await switchSharedMicDevice(nextDeviceId)
      setMicrophoneMessage(didSwitch ? 'マイク入力を切り替えました。' : '次回の演奏から使用します。')
    } catch (error) {
      setMicrophoneDeviceId('')
      setMicrophoneMessage(error?.message || 'マイク入力を切り替えられませんでした。')
    }
  }

  return (
    <div className="settingsPage">
      <header className="settingsPage__header">
        <button className="settingsPage__back wiiFind__backRed" type="button" onClick={onBack}>
          <span className="wiiFind__backIcon" aria-hidden="true">←</span>
          戻る
        </button>
        <div className="settingsPage__heading">
          <span className="settingsPage__eyebrow">SYSTEM SETTINGS</span>
          <h1>設定</h1>
        </div>
        <div className="settingsPage__headerSpacer" aria-hidden="true" />
      </header>

      <div className="settingsPage__tabs" role="tablist" aria-label="設定カテゴリー">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'playback'}
          className={`settingsPage__tab ${activeTab === 'playback' ? 'settingsPage__tab--active' : ''}`}
          onClick={() => setActiveTab('playback')}
        >
          <span className="settingsPage__tabIcon" aria-hidden="true">♪</span>
          演奏設定
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'microphone'}
          className={`settingsPage__tab ${activeTab === 'microphone' ? 'settingsPage__tab--active' : ''}`}
          onClick={() => {
            setActiveTab('microphone')
            loadMicrophones({ requestPermission: true })
          }}
        >
          <span className="settingsPage__tabIcon" aria-hidden="true">●</span>
          マイク設定
        </button>
      </div>

      <main className="settingsPage__content">
        {activeTab === 'playback' ? (
          <section className="settingsList" role="tabpanel">
            <div className="settingsList__item">
              <div className="settingsList__icon settingsList__icon--playback" aria-hidden="true">♪</div>
              <div className="settingsList__body">
                <div className="settingsList__label">ガイドメロディ</div>
                <div className="settingsList__description">
                  予約する曲のメロディガイドを標準で再生します。
                </div>
                
              </div>
              <div className="settingsList__control">
                <span className={`settingsList__state ${guideMelodyEnabled ? 'is-on' : 'is-off'}`}>
                  {guideMelodyEnabled ? 'ON' : 'OFF'}
                </span>
                <Form.Check
                  type="switch"
                  id="settings-guide-melody"
                  checked={guideMelodyEnabled}
                  onChange={(event) => setGuideMelodyEnabled(event.currentTarget.checked)}
                  aria-label="予約曲のガイドメロディ初期値を切り替える"
                />
              </div>
            </div>
            <div className="settingsList__item">
              <div className="settingsList__icon settingsList__icon--playback" aria-hidden="true">↕</div>
              <div className="settingsList__body">
                <div className="settingsList__label">自動音量調整</div>
                <div className="settingsList__description">
                  曲ごとの音量差を自動で補正し、大きすぎる音を抑えます。
                </div>
              </div>
              <div className="settingsList__control">
                <span className={`settingsList__state ${autoGainEnabled ? 'is-on' : 'is-off'}`}>
                  {autoGainEnabled ? 'ON' : 'OFF'}
                </span>
                <Form.Check
                  type="switch"
                  id="settings-auto-gain"
                  checked={autoGainEnabled}
                  onChange={(event) => setAutoGainEnabled(event.currentTarget.checked)}
                  aria-label="自動音量調整を切り替える"
                />
              </div>
            </div>
          </section>
        ) : (
          <section className="settingsList" role="tabpanel">
            <div className="settingsList__item">
              <div className="settingsList__icon settingsList__icon--microphone" aria-hidden="true">
                <span />
              </div>
              <div className="settingsList__body">
                <label className="settingsList__label" htmlFor="settings-microphone-device">
                  MIC入力デバイス
                </label>
                <div className="settingsList__description">
                  採点に使用するマイクを選択してください。
                </div>
                {microphoneMessage ? (
                  <div className="settingsList__message" role="status">{microphoneMessage}</div>
                ) : null}
              </div>
              <div className="settingsSelectWrap">
                  <Form.Select
                    id="settings-microphone-device"
                    className="settingsSelect"
                    value={microphoneDeviceId}
                    disabled={isLoadingMicrophones}
                    onChange={handleMicrophoneChange}
                  >
                    <option value="">システム既定のマイク</option>
                    {microphones.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `マイク ${index + 1}`}
                      </option>
                    ))}
                  </Form.Select>
                  {isLoadingMicrophones ? (
                    <Spinner className="settingsSelectWrap__spinner" animation="border" size="sm" />
                  ) : null}
                </div>
            </div>
            <div className="settingsList__item settingsList__item--disabled">
              <div className="settingsList__icon" aria-hidden="true">…</div>
              <div className="settingsList__body">
                <div className="settingsList__label">その他のマイク設定</div>
                <div className="settingsList__description">今後追加予定です。</div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default SettingsPage
