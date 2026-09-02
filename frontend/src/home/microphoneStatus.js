const FALLBACK_DEVICE_NAME = 'マイク入力デバイス'

export function resolveMicrophoneStatus(devices, selectedDeviceId = '') {
  const inputs = Array.from(devices || []).filter((device) => device?.kind === 'audioinput')
  if (!inputs.length) {
    return {
      available: false,
      resolvedDeviceId: '',
      deviceName: '',
    }
  }

  const selectedId = String(selectedDeviceId || '').trim()
  const selected = selectedId
    ? inputs.find((device) => device.deviceId === selectedId)
    : null
  const systemDefault = inputs.find((device) => device.deviceId === 'default')
  const physicalInputs = inputs.filter(
    (device) => device.deviceId !== 'default' && device.deviceId !== 'communications',
  )
  const defaultPhysicalInput = systemDefault?.groupId
    ? physicalInputs.find((device) => device.groupId === systemDefault.groupId)
    : null
  const resolvedInput = selected || defaultPhysicalInput || physicalInputs[0] || null
  const displayInput = selected || systemDefault || resolvedInput || inputs[0]

  return {
    available: true,
    resolvedDeviceId: String(resolvedInput?.deviceId || ''),
    deviceName: String(displayInput?.label || '').trim() || FALLBACK_DEVICE_NAME,
  }
}

export { FALLBACK_DEVICE_NAME }
