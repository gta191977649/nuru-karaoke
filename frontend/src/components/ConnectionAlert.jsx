import { useEffect } from 'react'
import { SFX } from '../config/sfxConfig.js'
import { getUiAudioEngine } from '../engine/audioEngine.js'

function ConnectionAlert({ isOpen, onClose, status = 'success', message }) {
    useEffect(() => {
        if (!isOpen) return
        const uiAudio = getUiAudioEngine()

        if (status === 'success') {
            uiAudio.playSfx(SFX.SUCCESS).catch(() => { })
        } else if (status === 'error') {
            uiAudio.playSfx(SFX.FAIL).catch(() => { })
        }
    }, [isOpen, status])

    if (!isOpen) return null

    const resolvedMessage = message || (status === 'loading'
        ? '通信中...'
        : status === 'error'
            ? '通信に失敗しました。'
            : 'インターネットに接続成功しました。')

    return (
        <div className="wiiAlertOverlay" onClick={onClose}>
            <div className="wiiAlertBox" onClick={(e) => e.stopPropagation()}>
                <div className="wiiAlertHeader">
                    インターネット通信
                </div>
                <div className="wiiAlertBody">
                    <div>{resolvedMessage}</div>
                    <div className="wiiAlertIcon">
                        {status === 'loading' ? '…' : status === 'error' ? '!' : '♪'}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ConnectionAlert
