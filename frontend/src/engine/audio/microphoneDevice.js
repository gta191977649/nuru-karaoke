const DEVICE_CONSTRAINT_ERROR_NAMES = new Set([
  'OverconstrainedError',
  'ConstraintNotSatisfiedError',
])

export const isUnavailableMicrophoneError = (error) =>
  DEVICE_CONSTRAINT_ERROR_NAMES.has(String(error?.name || ''))

export async function requestMicrophoneStream(mediaDevices, audioConstraints = true) {
  if (!mediaDevices?.getUserMedia) {
    throw new Error('Microphone capture is not supported by this browser.')
  }

  try {
    return {
      stream: await mediaDevices.getUserMedia({ audio: audioConstraints }),
      usedDefaultDeviceFallback: false,
    }
  } catch (error) {
    const hasRequestedDevice = Boolean(
      audioConstraints &&
      typeof audioConstraints === 'object' &&
      audioConstraints.deviceId,
    )
    if (!hasRequestedDevice || !isUnavailableMicrophoneError(error)) throw error

    const fallbackConstraints = { ...audioConstraints }
    delete fallbackConstraints.deviceId
    return {
      stream: await mediaDevices.getUserMedia({ audio: fallbackConstraints }),
      usedDefaultDeviceFallback: true,
    }
  }
}

