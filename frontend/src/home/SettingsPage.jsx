import { useCallback, useEffect, useRef, useState } from 'react'
import { Form, Spinner } from 'react-bootstrap'

import {
  sharedPitchEngine,
  startSharedMic,
  stopSharedMic,
  switchSharedMicDevice,
} from '../engine/audio/pitch/sharedPitchEngine.js'
import {
  MicrophoneCalibrationError,
  runMicrophoneLatencyCalibration,
} from '../engine/audio/latencyCalibration.js'
import microphoneLatencyBeepUrl from '../assets/sfx/mic-latency-beep.wav'
import {
  normalizeMicrophoneDeviceKey,
  useSettingsStore,
} from '../state/settingsStore.js'

function SettingsPage({ onBack }) {
  const guideMelodyEnabled = useSettingsStore((state) => state.guideMelodyEnabled)
  const autoGainEnabled = useSettingsStore((state) => state.autoGainEnabled)
  const karaokeBackgroundVideoEnabled = useSettingsStore(
    (state) => state.karaokeBackgroundVideoEnabled,
  )
  const microphoneDeviceId = useSettingsStore((state) => state.microphoneDeviceId)
  const microphoneLatencyByDevice = useSettingsStore(
    (state) => state.microphoneLatencyByDevice,
  )
  const setGuideMelodyEnabled = useSettingsStore((state) => state.setGuideMelodyEnabled)
  const setAutoGainEnabled = useSettingsStore((state) => state.setAutoGainEnabled)
  const setKaraokeBackgroundVideoEnabled = useSettingsStore(
    (state) => state.setKaraokeBackgroundVideoEnabled,
  )
  const setMicrophoneDeviceId = useSettingsStore((state) => state.setMicrophoneDeviceId)
  const setMicrophoneLatencyCalibration = useSettingsStore(
    (state) => state.setMicrophoneLatencyCalibration,
  )
  const clearMicrophoneLatencyCalibration = useSettingsStore(
    (state) => state.clearMicrophoneLatencyCalibration,
  )
  const [activeTab, setActiveTab] = useState('playback')
  const [microphones, setMicrophones] = useState([])
  const [isLoadingMicrophones, setIsLoadingMicrophones] = useState(false)
  const [microphoneMessage, setMicrophoneMessage] = useState('')
  const [calibrationStatus, setCalibrationStatus] = useState('ready')
  const [calibrationExpanded, setCalibrationExpanded] = useState(false)
  const [calibrationDeviceId, setCalibrationDeviceId] = useState('')
  const [resolvedDefaultDeviceId, setResolvedDefaultDeviceId] = useState('')
  const [calibrationProgress, setCalibrationProgress] = useState({
    completed: 0,
    total: 5,
    inputLevel: 0,
  })
  const [calibrationError, setCalibrationError] = useState('')
  const calibrationAbortRef = useRef(null)

  const calibrationKey = normalizeMicrophoneDeviceKey(
    calibrationDeviceId || microphoneDeviceId || resolvedDefaultDeviceId,
  )
  const calibrationRecord = microphoneLatencyByDevice?.[calibrationKey] || null
  const isCalibrating = calibrationStatus === 'measuring'

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
      if (requestPermission && navigator.mediaDevices.getUserMedia) {
        permissionStream = await navigator.mediaDevices.getUserMedia({
          audio: microphoneDeviceId
            ? { deviceId: { exact: microphoneDeviceId } }
            : true,
        })
        if (!microphoneDeviceId) {
          const resolvedDeviceId = permissionStream.getAudioTracks?.()[0]?.getSettings?.().deviceId
          setResolvedDefaultDeviceId(String(resolvedDeviceId || ''))
        }
        devices = await navigator.mediaDevices.enumerateDevices()
      } else if (requestPermission && !hasVisibleInput) {
        setMicrophoneMessage('マイクの使用許可を確認できませんでした。')
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
  }, [microphoneDeviceId])

  useEffect(() => {
    loadMicrophones()
    const mediaDevices = navigator.mediaDevices
    mediaDevices?.addEventListener?.('devicechange', loadMicrophones)
    return () => mediaDevices?.removeEventListener?.('devicechange', loadMicrophones)
  }, [loadMicrophones])

  useEffect(() => () => calibrationAbortRef.current?.abort(), [])

  const handleMicrophoneChange = async (event) => {
    const nextDeviceId = event.currentTarget.value
    setMicrophoneDeviceId(nextDeviceId)
    setCalibrationDeviceId('')
    setResolvedDefaultDeviceId('')
    setCalibrationStatus('ready')
    setCalibrationError('')
    setMicrophoneMessage('')
    try {
      const didSwitch = await switchSharedMicDevice(nextDeviceId)
      setMicrophoneMessage(didSwitch ? 'マイク入力を切り替えました。' : '次回の演奏から使用します。')
    } catch (error) {
      setMicrophoneDeviceId('')
      setMicrophoneMessage(error?.message || 'マイク入力を切り替えられませんでした。')
    }
  }

  const startCalibration = async () => {
    calibrationAbortRef.current?.abort()
    const controller = new AbortController()
    calibrationAbortRef.current = controller
    setCalibrationExpanded(true)
    setCalibrationStatus('measuring')
    setCalibrationError('')
    setCalibrationProgress({ completed: 0, total: 5, inputLevel: 0 })
    let micStarted = false
    try {
      const resolvedDeviceId = await startSharedMic()
      micStarted = true
      const result = await runMicrophoneLatencyCalibration({
        pitchEngine: sharedPitchEngine,
        beepUrl: microphoneLatencyBeepUrl,
        signal: controller.signal,
        onProgress: setCalibrationProgress,
      })
      const deviceId = resolvedDeviceId || microphoneDeviceId || 'default'
      setCalibrationDeviceId(deviceId)
      if (!microphoneDeviceId) setResolvedDefaultDeviceId(deviceId)
      setMicrophoneLatencyCalibration(deviceId, {
        latencyMs: result.latencyMs,
        measuredAt: new Date().toISOString(),
        sampleCount: result.sampleCount,
        spreadMs: result.spreadMs,
      })
      setCalibrationProgress((progress) => ({ ...progress, completed: progress.total }))
      setCalibrationStatus('success')
    } catch (error) {
      if (error instanceof MicrophoneCalibrationError && error.code === 'cancelled') {
        setCalibrationStatus('ready')
      } else {
        setCalibrationError(
          error?.message || '測定に失敗しました。マイクとスピーカーを確認してください。',
        )
        setCalibrationStatus('error')
      }
    } finally {
      if (micStarted) stopSharedMic()
      if (calibrationAbortRef.current === controller) calibrationAbortRef.current = null
    }
  }

  const cancelCalibration = () => calibrationAbortRef.current?.abort()

  const resetCalibration = () => {
    clearMicrophoneLatencyCalibration(calibrationKey)
    setCalibrationStatus('ready')
    setCalibrationError('')
  }

  const measuredAtTime = Date.parse(calibrationRecord?.measuredAt || '')
  const measuredAtLabel = Number.isFinite(measuredAtTime)
    ? new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(measuredAtTime))
    : ''

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
            <div className="settingsList__item">
              <div className="settingsList__icon settingsList__icon--playback" aria-hidden="true">▶</div>
              <div className="settingsList__body">
                <div className="settingsList__label">KARAOKE背景動画</div>
                <div className="settingsList__description">
                  通信速度が遅い環境では、オンにしないことをおすすめします。
                </div>
              </div>
              <div className="settingsList__control">
                <span className={`settingsList__state ${karaokeBackgroundVideoEnabled ? 'is-on' : 'is-off'}`}>
                  {karaokeBackgroundVideoEnabled ? 'ON' : 'OFF'}
                </span>
                <Form.Check
                  type="switch"
                  id="settings-karaoke-background-video"
                  checked={karaokeBackgroundVideoEnabled}
                  onChange={(event) => setKaraokeBackgroundVideoEnabled(event.currentTarget.checked)}
                  aria-label="KARAOKE背景動画を切り替える"
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
                    disabled={isLoadingMicrophones || isCalibrating}
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
            <div className="settingsList__item settingsList__item--latency">
              <div className="settingsList__icon settingsList__icon--latency" aria-hidden="true">ms</div>
              <div className="settingsList__body">
                <div className="settingsList__label">マイク遅延補正</div>
                <div className="settingsList__description">
                  スピーカーから検査音を再生し、採点タイミングを自動調整します。
                </div>
                {calibrationRecord ? (
                  <div className="settingsList__message settingsList__message--success">
                    {calibrationRecord.latencyMs} ms 補正適用中
                  </div>
                ) : null}
              </div>
              <button
                className="settingsLatency__openButton"
                type="button"
                disabled={isCalibrating}
                aria-expanded={calibrationExpanded}
                onClick={() => setCalibrationExpanded((expanded) => !expanded)}
              >
                {calibrationExpanded ? '閉じる' : calibrationRecord ? '確認・再測定' : '設定する'}
              </button>
            </div>
            {calibrationExpanded ? (
              <div className="settingsLatency" role="region" aria-label="マイク遅延補正">
                {isCalibrating ? (
                  <>
                    <div className="settingsLatency__statusTitle">検査音を確認しています…</div>
                    <div className="settingsLatency__pulseRow" aria-label={`測定 ${calibrationProgress.completed}/${calibrationProgress.total}`}>
                      {Array.from({ length: calibrationProgress.total }, (_, index) => (
                        <span
                          key={index}
                          className={`settingsLatency__pulse ${index < calibrationProgress.completed ? 'is-complete' : index === calibrationProgress.completed ? 'is-active' : ''}`}
                        />
                      ))}
                    </div>
                    <div className="settingsLatency__level" aria-label="マイク入力レベル">
                      <span style={{ width: `${Math.min(100, calibrationProgress.inputLevel * 500)}%` }} />
                    </div>
                    <p>測定中はマイクとスピーカーを動かさないでください。</p>
                    <button className="settingsLatency__secondaryButton" type="button" onClick={cancelCalibration}>
                      キャンセル
                    </button>
                  </>
                ) : calibrationStatus === 'error' ? (
                  <>
                    <div className="settingsLatency__statusTitle settingsLatency__statusTitle--error">測定できませんでした</div>
                    <p role="alert">{calibrationError}</p>
                    <button className="settingsLatency__primaryButton" type="button" onClick={startCalibration}>
                      もう一度測定
                    </button>
                  </>
                ) : calibrationRecord ? (
                  <>
                    <div className="settingsLatency__result">
                      <span>マイク遅延</span>
                      <strong>{calibrationRecord.latencyMs}<small> ms</small></strong>
                      <em>補正適用中</em>
                    </div>
                    <p>
                      {calibrationRecord.sampleCount}回の有効測定・ばらつき {calibrationRecord.spreadMs} ms
                      {measuredAtLabel ? ` ／ ${measuredAtLabel}` : ''}
                    </p>
                    <p className="settingsLatency__notice">
                      スピーカー、ヘッドホン、USB端子やBluetooth接続を変更した場合は再測定してください。
                    </p>
                    <div className="settingsLatency__actions">
                      <button className="settingsLatency__primaryButton" type="button" onClick={startCalibration}>
                        再測定する
                      </button>
                      <button className="settingsLatency__secondaryButton" type="button" onClick={resetCalibration}>
                        補正をリセット
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="settingsLatency__statusTitle">測定の準備</div>
                    <ol className="settingsLatency__steps">
                      <li>スピーカーをオンにして、音量を聞こえる大きさにします。</li>
                      <li>マイクのスイッチを入れ、スピーカーの方向へ向けます。</li>
                      <li>周囲を静かにして「測定を開始」を押します。</li>
                    </ol>
                    <p className="settingsLatency__notice">
                      ヘッドホン使用中は検査音をマイクで拾えないため測定できません。
                    </p>
                    <button className="settingsLatency__primaryButton" type="button" onClick={startCalibration}>
                      測定を開始
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </section>
        )}
      </main>
    </div>
  )
}

export default SettingsPage
