import { describe, expect, it } from 'vitest'
import { resolveMicrophoneStatus } from './microphoneStatus.js'

describe('resolveMicrophoneStatus', () => {
  const input = (deviceId, label) => ({ kind: 'audioinput', deviceId, label })

  it('shows the selected microphone name', () => {
    expect(resolveMicrophoneStatus([
      input('default', '既定 - 内蔵マイク'),
      input('usb-mic', 'USB Vocal Microphone'),
    ], 'usb-mic')).toEqual({
      available: true,
      resolvedDeviceId: 'usb-mic',
      deviceName: 'USB Vocal Microphone',
    })
  })

  it('uses the system default when a saved device is no longer present', () => {
    expect(resolveMicrophoneStatus([
      input('default', '既定のマイク'),
      input('built-in', '内蔵マイク'),
    ], 'missing')).toEqual({
      available: true,
      resolvedDeviceId: 'built-in',
      deviceName: '既定のマイク',
    })
  })

  it('uses a Japanese fallback while device labels are protected', () => {
    expect(resolveMicrophoneStatus([input('default', '')])).toEqual({
      available: true,
      resolvedDeviceId: '',
      deviceName: 'マイク入力デバイス',
    })
  })

  it('reports an unavailable microphone when there are no audio inputs', () => {
    expect(resolveMicrophoneStatus([
      { kind: 'audiooutput', deviceId: 'speaker', label: 'スピーカー' },
    ])).toEqual({
      available: false,
      resolvedDeviceId: '',
      deviceName: '',
    })
  })

  it('maps the system default alias to its physical input by group', () => {
    expect(resolveMicrophoneStatus([
      { ...input('default', '既定のマイク'), groupId: 'group-a' },
      { ...input('mic-a', 'マイク A'), groupId: 'group-a' },
      { ...input('mic-b', 'マイク B'), groupId: 'group-b' },
    ])).toMatchObject({
      available: true,
      resolvedDeviceId: 'mic-a',
    })
  })
})
