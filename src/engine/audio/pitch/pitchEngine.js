import { createDefaultPitchRegistry } from './registry.js'

const DEFAULT_CONFIG = {
  windowSize: 2048,
  hopSize: 128,
  rmsGate: 0.01,
  smoothing: false,
}

class PitchEngine {
  constructor(options = {}) {
    this._audioContext = options.audioContext || null
    this._getAudioContext = options.getAudioContext || null
    this._ownsContext = false

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

    this._pending = null
    this._pendingLength = 0

    this._stream = null
    this._source = null
    this._processor = null
    this._monitorGain = null
  }

  listDetectors() {
    return this._detectors.slice()
  }

  configureDetector(cfg) {
    this._config = { ...this._config, ...cfg }
    this._worker.postMessage({ type: 'config', cfg: this._config })
    const shouldReset = Number(cfg?.windowSize) || Number(cfg?.hopSize)
    if (shouldReset) this._resetPending()
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
    let audioContext = this._audioContext
    if (!audioContext && this._getAudioContext) {
      audioContext = this._getAudioContext()
    }
    if (!audioContext) {
      audioContext = new AudioContext()
      this._audioContext = audioContext
      this._ownsContext = true
    }

    await audioContext.resume()

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })

    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(1024, 1, 1)
    const monitorGain = audioContext.createGain()
    monitorGain.gain.value = 0

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      if (!input?.length) return
      this._appendSamples(input)
      this._flushFrames(audioContext.sampleRate, audioContext.currentTime)
    }

    source.connect(processor)
    processor.connect(monitorGain)
    monitorGain.connect(audioContext.destination)

    this._stream = stream
    this._source = source
    this._processor = processor
    this._monitorGain = monitorGain

    this.configureDetector(this._config)
    this.setDetector(this._algoId)
  }

  stopMic() {
    if (!this._stream) return
    this._processor?.disconnect()
    this._source?.disconnect()
    this._monitorGain?.disconnect()

    this._processor = null
    this._source = null
    this._monitorGain = null

    this._stream.getTracks().forEach((track) => track.stop())
    this._stream = null
    this._resetPending()

    if (this._ownsContext) {
      this._audioContext?.close()
      this._audioContext = null
      this._ownsContext = false
    }
  }

  _resetPending() {
    this._pending = null
    this._pendingLength = 0
  }

  _ensurePendingCapacity(nextLength) {
    if (!this._pending || this._pending.length < nextLength) {
      const nextSize = Math.max(nextLength, this._pending ? this._pending.length * 2 : 0)
      const next = new Float32Array(nextSize || nextLength)
      if (this._pending && this._pendingLength > 0) {
        next.set(this._pending.subarray(0, this._pendingLength))
      }
      this._pending = next
    }
  }

  _appendSamples(input) {
    const nextLength = this._pendingLength + input.length
    this._ensurePendingCapacity(nextLength)
    this._pending.set(input, this._pendingLength)
    this._pendingLength = nextLength
  }

  _flushFrames(sampleRate, acTime) {
    const windowSize = Math.max(1024, Number(this._config.windowSize) || DEFAULT_CONFIG.windowSize)
    const hopSize = Math.max(1, Number(this._config.hopSize) || DEFAULT_CONFIG.hopSize)

    while (this._pendingLength >= windowSize) {
      const frame = new Float32Array(windowSize)
      frame.set(this._pending.subarray(0, windowSize))

      const remaining = this._pendingLength - hopSize
      if (remaining > 0) {
        this._pending.copyWithin(0, hopSize, this._pendingLength)
      }
      this._pendingLength = Math.max(0, remaining)

      this._worker.postMessage(
        {
          type: 'frame',
          tAcSec: acTime,
          samples: frame,
          sampleRate,
        },
        [frame.buffer],
      )
    }
  }
}

export { PitchEngine }
