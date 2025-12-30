import { DEFAULT_CONFIG } from '../../../audioEngine.js'
import {
  applyHpfInPlace,
  createHpfState,
  removeDcOffsetInPlace,
  updateHpfState,
} from '../utils/dspUtils.js'

class PitchFrameProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._windowSize = DEFAULT_CONFIG.windowSize
    this._hopSize = DEFAULT_CONFIG.hopSize
    this._hpfCutoffHz = Number(DEFAULT_CONFIG.hpfCutoffHz) || 0
    this._hpfState = createHpfState(this._hpfCutoffHz, sampleRate)
    this._buffer = new Float32Array(this._windowSize * 4)
    this._bufferLength = 0

    this.port.onmessage = (event) => {
      const msg = event.data
      if (msg?.type !== 'config') return
      const nextWindow = Math.max(256, Number(msg.windowSize) || this._windowSize)
      const nextHop = Math.max(1, Number(msg.hopSize) || this._hopSize)
      const nextCutoff = Number.isFinite(Number(msg.hpfCutoffHz))
        ? Number(msg.hpfCutoffHz)
        : this._hpfCutoffHz
      const needsReset = nextWindow !== this._windowSize
      this._windowSize = nextWindow
      this._hopSize = nextHop
      this._hpfCutoffHz = nextCutoff
      this._hpfState = updateHpfState(this._hpfState, this._hpfCutoffHz, sampleRate)
      if (needsReset) {
        this._buffer = new Float32Array(this._windowSize * 4)
        this._bufferLength = 0
      }
    }
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const channel = input[0]
    if (!channel.length) return true

    this._append(channel)
    this._flush()
    return true
  }

  _append(samples) {
    const nextLength = this._bufferLength + samples.length
    if (nextLength > this._buffer.length) {
      const nextSize = Math.max(nextLength, this._buffer.length * 2)
      const next = new Float32Array(nextSize)
      if (this._bufferLength > 0) {
        next.set(this._buffer.subarray(0, this._bufferLength))
      }
      this._buffer = next
    }
    this._buffer.set(samples, this._bufferLength)
    this._bufferLength = nextLength
  }

  _flush() {
    while (this._bufferLength >= this._windowSize) {
      const frame = new Float32Array(this._windowSize)
      frame.set(this._buffer.subarray(0, this._windowSize))
      this._conditionFrame(frame)

      const remaining = this._bufferLength - this._hopSize
      if (remaining > 0) {
        this._buffer.copyWithin(0, this._hopSize, this._bufferLength)
      }
      this._bufferLength = Math.max(0, remaining)

      this.port.postMessage(
        {
          type: 'frame',
          tAcSec: currentTime,
          samples: frame,
          sampleRate,
        },
        [frame.buffer],
      )
    }
  }

  _conditionFrame(frame) {
    if (!frame?.length) return
    removeDcOffsetInPlace(frame)
    this._hpfState = applyHpfInPlace(frame, this._hpfState)
  }
}

registerProcessor('pitch-frame-processor', PitchFrameProcessor)
