import { createDefaultPitchRegistry } from './registry.js'
import { DEFAULT_CONFIG, getKaraokeAudioEngine } from '../../audioEngine.js'

class PitchEngine {
  constructor(options = {}) {
    this._audioContext = options.audioContext || null
    this._getAudioContext = options.getAudioContext || null

    this._listeners = new Set()
    this._debugListeners = new Set()

    const registry = createDefaultPitchRegistry({ includeCrepe: false })
    this._detectors = registry.list().map((plugin) => ({ id: plugin.id, name: plugin.name }))

    this._config = { ...DEFAULT_CONFIG }
    this._algoId = DEFAULT_CONFIG.pitchAlgoId || 'pitchy'

    this._stream = null
    this._source = null
    this._workletNode = null
    this._monitorGain = null
    this._workletReady = null
    this._debugAnalyser = null
    this._debugHpf = null
    this._debugGain = null
    this._debugConnected = false

    this._starting = null
    this._stopRequested = false
  }

  listDetectors() {
    return this._detectors.slice()
  }

  getAudioContext() {
    return this._audioContext || (this._getAudioContext ? this._getAudioContext() : null)
  }

  configureDetector(cfg) {
    this._config = { ...this._config, ...cfg }
    this._postWorkletConfig()
  }

  setDetector(algoId) {
    if (!algoId || this._algoId === algoId) return
    this._algoId = algoId
    this._postWorkletConfig()
  }

  ensureDebugAnalyser(options = {}) {
    if (!this._source) return null
    const audioContext = this._ensureAudioContext()

    if (!this._debugAnalyser) {
      this._debugAnalyser = audioContext.createAnalyser()
    }
    if (!this._debugHpf) {
      this._debugHpf = audioContext.createBiquadFilter()
      this._debugHpf.type = 'highpass'
    }
    if (!this._debugGain) {
      this._debugGain = audioContext.createGain()
      this._debugGain.gain.value = 0
      this._debugGain.connect(audioContext.destination)
    }
    if (!this._debugConnected) {
      this._source.connect(this._debugHpf)
      this._debugHpf.connect(this._debugAnalyser)
      this._debugAnalyser.connect(this._debugGain)
      this._debugConnected = true
    }

    const fftSize = Number(options.fftSize)
    if (Number.isFinite(fftSize) && fftSize >= 32) {
      this._debugAnalyser.fftSize = fftSize
    }
    const smoothing = Number(options.smoothingTimeConstant)
    if (Number.isFinite(smoothing)) {
      this._debugAnalyser.smoothingTimeConstant = Math.max(0, Math.min(1, smoothing))
    }

    const hpfCutoff = Number.isFinite(options.hpfCutoffHz)
      ? Number(options.hpfCutoffHz)
      : DEFAULT_CONFIG.hpfCutoffHz
    const hpfEnabled = options.enableHpf !== false
    this._debugHpf.frequency.value = hpfEnabled ? Math.max(0, hpfCutoff) : 0

    return this._debugAnalyser
  }

  onPitch(cb) {
    if (typeof cb !== 'function') return () => {}
    this._listeners.add(cb)
    return () => this._listeners.delete(cb)
  }

  onDebug(cb) {
    if (typeof cb !== 'function') return () => {}
    this._debugListeners.add(cb)
    return () => this._debugListeners.delete(cb)
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
          noiseSuppression: false,
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
        if (!msg?.type) return
        if (msg.type === 'pitch') {
          const result = msg.result
          if (!result) return
          if (result.algoId && result.algoId !== this._algoId) return
          for (const cb of this._listeners) cb(result)
          return
        }
        if (msg.type === 'pipeline-debug') {
          for (const cb of this._debugListeners) cb(msg)
        }
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
      algoId: this._algoId,
      windowSize: this._config.windowSize,
      hopSize: this._config.hopSize,
      hpfCutoffHz: this._config.hpfCutoffHz,
      rmsGate: this._config.rmsGate,
      smoothing: this._config.smoothing,
      f0MinHz: this._config.f0MinHz,
      f0MaxHz: this._config.f0MaxHz,
      medianWindowSize: this._config.medianWindowSize,
      maxJumpSemitones: this._config.maxJumpSemitones,
      holdFrames: this._config.holdFrames,
      yinConfidenceGate: this._config.yinConfidenceGate,
      yinProbOutputUnvoiced: this._config.yinProbOutputUnvoiced,
      yinProbPreciseTime: this._config.yinProbPreciseTime,
      clarityGate: this._config.clarityGate,
      enableDcRemoval: this._config.enableDcRemoval,
      enableHpf: this._config.enableHpf,
      enableRmsGate: this._config.enableRmsGate,
      enableF0Validate: this._config.enableF0Validate,
      enableTemporalSmooth: this._config.enableTemporalSmooth,
      debugPipeline: this._config.debugPipeline,
      debugPipelineStride: this._config.debugPipelineStride,
    })
  }

  _stopMicInternal() {
    if (!this._stream) return

    this._workletNode?.disconnect()
    this._source?.disconnect()
    this._monitorGain?.disconnect()
    if (this._debugHpf) {
      try {
        this._source?.disconnect(this._debugHpf)
      } catch (err) {
        console.warn('[PitchEngine] debug analyser disconnect failed', err)
      }
    }
    this._debugAnalyser?.disconnect()
    this._debugHpf?.disconnect()
    this._debugGain?.disconnect()
    this._debugAnalyser = null
    this._debugHpf = null
    this._debugGain = null
    this._debugConnected = false

    this._workletNode = null
    this._source = null
    this._monitorGain = null

    this._stream.getTracks().forEach((track) => track.stop())
    this._stream = null
    this._stopRequested = false
  }
}

export { PitchEngine }
