import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  active: false,
  startMic: vi.fn(),
  stopMic: vi.fn(),
  ensureDebugAnalyser: vi.fn(() => null),
}))

vi.mock('./pitchEngine.js', () => ({
  PitchEngine: class {
    startMic = mock.startMic
    stopMic = mock.stopMic
    ensureDebugAnalyser = mock.ensureDebugAnalyser
    isMicActive = () => mock.active
    getActiveInputDeviceId = () => mock.active ? 'mic-a' : ''
  },
}))

vi.mock('../../../state/settingsStore.js', () => ({
  getSettingsStoreState: () => ({ microphoneDeviceId: 'mic-a' }),
}))

describe('shared microphone startup', () => {
  beforeEach(() => {
    vi.resetModules()
    mock.active = false
    mock.startMic.mockReset()
    mock.stopMic.mockReset()
    mock.ensureDebugAnalyser.mockReset().mockReturnValue(null)
  })

  it('makes concurrent users wait for one stream and stops it after both release', async () => {
    let finishStart
    mock.startMic.mockImplementation(() => new Promise((resolve) => {
      finishStart = () => {
        mock.active = true
        resolve('mic-a')
      }
    }))
    mock.stopMic.mockImplementation(() => { mock.active = false })
    const { startSharedMic, stopSharedMic } = await import('./sharedPitchEngine.js')
    const first = startSharedMic()
    const second = startSharedMic()
    expect(mock.startMic).toHaveBeenCalledTimes(1)
    finishStart()
    expect(await Promise.all([first, second])).toEqual(['mic-a', 'mic-a'])
    stopSharedMic()
    expect(mock.stopMic).not.toHaveBeenCalled()
    stopSharedMic()
    expect(mock.stopMic).toHaveBeenCalledTimes(1)
  })
})
