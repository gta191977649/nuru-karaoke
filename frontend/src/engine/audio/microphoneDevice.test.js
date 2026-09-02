import { describe, expect, it, vi } from 'vitest'
import {
  isUnavailableMicrophoneError,
  requestMicrophoneStream,
} from './microphoneDevice.js'

describe('requestMicrophoneStream', () => {
  it('retries with the default input when an exact device no longer exists', async () => {
    const fallbackStream = { id: 'default-stream' }
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('device missing'), { name: 'OverconstrainedError' }))
      .mockResolvedValueOnce(fallbackStream)

    const result = await requestMicrophoneStream(
      { getUserMedia },
      { deviceId: { exact: 'stale-device-id' }, echoCancellation: false },
    )

    expect(result).toEqual({
      stream: fallbackStream,
      usedDefaultDeviceFallback: true,
    })
    expect(getUserMedia).toHaveBeenNthCalledWith(1, {
      audio: { deviceId: { exact: 'stale-device-id' }, echoCancellation: false },
    })
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      audio: { echoCancellation: false },
    })
  })

  it('does not hide permission errors', async () => {
    const error = Object.assign(new Error('permission denied'), { name: 'NotAllowedError' })
    const getUserMedia = vi.fn().mockRejectedValue(error)

    await expect(requestMicrophoneStream(
      { getUserMedia },
      { deviceId: { exact: 'device-id' } },
    )).rejects.toBe(error)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })
})

describe('isUnavailableMicrophoneError', () => {
  it('supports the current and legacy constraint error names', () => {
    expect(isUnavailableMicrophoneError({ name: 'OverconstrainedError' })).toBe(true)
    expect(isUnavailableMicrophoneError({ name: 'ConstraintNotSatisfiedError' })).toBe(true)
    expect(isUnavailableMicrophoneError({ name: 'NotFoundError' })).toBe(false)
  })
})

