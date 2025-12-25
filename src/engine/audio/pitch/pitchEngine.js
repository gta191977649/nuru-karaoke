import { createDefaultPitchRegistry } from './registry.js'
import { getKaraokeAudioEngine } from '../../audioEngine.js'

const DEFAULT_CONFIG = {
  windowSize: 2048,
  hopSize: 128,
  rmsGate: 0.01,
  clarityGate: 0.3,
  smoothing: true,
  sampleRate: 44100,
}

class PitchEngine {
  constructor(options = {}) {
    this._audioContext = options.audioContext || null
    this._getAudioContext = options.getAudioContext || null

    this._worker = new Worker(new URL('./worker/pitchWorker.js', import.meta.url), { type: 'module' })
    this._worker.onmessage = (event) => {
      const msg = event.data
      if (msg?.type !== 'pitch') return
      for (const cb of this._listeners) cb(msg.result)
    }

    this._listeners = new Set()

    const registry = createDefaultPitchRegistry()
    this._detectors = registry.list().map((plugin) => ({ id: plugin.id, name: plugin.name }))

    this._config = { ...DEFAULT_CONFIG }
    this._algoId = 'pitchy'

    this._stream = null
    this._source = null
    this._workletNode = null
    this._monitorGain = null
    this._workletReady = null

    this._starting = null
    this._stopRequested = false
  }

  listDetectors() {
    return this._detectors.slice()
  }

  configureDetector(cfg) {
    this._config = { ...this._config, ...cfg }
    this._worker.postMessage({ type: 'config', cfg: this._config })
    this._postWorkletConfig()
  }

  setDetector(algoId) {
    if (!algoId || this._algoId === algoId) return
    this._algoId = algoId
    this._worker.postMessage({ type: 'setAlgo', algoId })
  }

  onPitch(cb) {
    if (typeof cb !== 'function') return () => {}
    this._listeners.add(cb)
    return () => this._listeners.delete(cb)
  }

  async startMic() {
    if (this._stream) return
    if (this._starting) {
      this._stopRequested = false
      return this._starting
    }

    this._stopRequested = false
    this._starting = (async () => {
      const audioContext = this._ensureAudioContext()
      await getKaraokeAudioEngine().resumeAudio()
      await this._ensureWorklet(audioContext)

      console.log('[PitchEngine] sampleRate', audioContext.sampleRate)

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: false,
        },
      })

      const source = audioContext.createMediaStreamSource(stream)
      const workletNode = new AudioWorkletNode(audioContext, 'pitch-frame-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      })

      workletNode.port.onmessage = (event) => {
        const msg = event.data
        if (msg?.type !== 'frame') return
        const samples = msg.samples
        if (!samples) return
        this._worker.postMessage(
          {
            type: 'frame',
            tAcSec: msg.tAcSec,
            samples,
            sampleRate: msg.sampleRate,
          },
          [samples.buffer],
        )
      }

      const monitorGain = audioContext.createGain()
      monitorGain.gain.value = 0

      source.connect(workletNode)
      workletNode.connect(monitorGain)
      monitorGain.connect(audioContext.destination)

      this._stream = stream
      this._source = source
      this._workletNode = workletNode
      this._monitorGain = monitorGain

      this.configureDetector(this._config)
      this.setDetector(this._algoId)

      if (this._stopRequested) {
        this._stopMicInternal()
      }
    })()

    try {
      await this._starting
    } finally {
      this._starting = null
    }
  }

  stopMic() {
    this._stopRequested = true
    if (this._starting && !this._stream) return
    this._stopMicInternal()
  }

  _ensureAudioContext() {
    if (this._audioContext) return this._audioContext

    let audioContext = null
    if (this._getAudioContext) {
      audioContext = this._getAudioContext()
    }

    if (!audioContext) {
      const audioEngine = getKaraokeAudioEngine()
      audioEngine.setSampleRate(this._config.sampleRate)
      audioContext = audioEngine.ensureAudioContext()
    }

    this._audioContext = audioContext
    return audioContext
  }

  async _ensureWorklet(audioContext) {
    if (this._workletReady) return this._workletReady
    this._workletReady = audioContext.audioWorklet.addModule(
      new URL('./worklet/pitchWorklet.js', import.meta.url),
    )
    return this._workletReady
  }

  _postWorkletConfig() {
    if (!this._workletNode) return
    this._workletNode.port.postMessage({
      type: 'config',
      windowSize: this._config.windowSize,
      hopSize: this._config.hopSize,
    })
  }

  _stopMicInternal() {
    if (!this._stream) return

    this._workletNode?.disconnect()
    this._source?.disconnect()
    this._monitorGain?.disconnect()

    this._workletNode = null
    this._source = null
    this._monitorGain = null

    this._stream.getTracks().forEach((track) => track.stop())
    this._stream = null
    this._stopRequested = false
  }
}

export { PitchEngine, DEFAULT_CONFIG }
