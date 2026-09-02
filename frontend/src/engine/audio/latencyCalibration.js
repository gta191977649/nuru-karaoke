const DEFAULT_ATTEMPTS = 5
const MIN_VALID_ATTEMPTS = 3
const MIN_LATENCY_SEC = 0.02
const MAX_LATENCY_SEC = 1
const MIN_CORRELATION = 0.32
const MIN_INPUT_PEAK = 0.003

class MicrophoneCalibrationError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MicrophoneCalibrationError'
    this.code = code
  }
}

const median = (values) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function downsampleAverage(input, factor) {
  if (factor <= 1) return Float32Array.from(input)
  const length = Math.floor(input.length / factor)
  const output = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    let sum = 0
    const offset = index * factor
    for (let inner = 0; inner < factor; inner += 1) sum += input[offset + inner]
    output[index] = sum / factor
  }
  return output
}

function removeMean(input) {
  if (!input.length) return new Float32Array(0)
  let sum = 0
  for (const value of input) sum += value
  const mean = sum / input.length
  const output = new Float32Array(input.length)
  for (let index = 0; index < input.length; index += 1) output[index] = input[index] - mean
  return output
}

function normalizedCorrelationAt(recording, template, offset, templateEnergy) {
  let dot = 0
  let recordingSum = 0
  let recordingSquareSum = 0
  for (let index = 0; index < template.length; index += 1) {
    const sample = recording[offset + index]
    dot += sample * template[index]
    recordingSum += sample
    recordingSquareSum += sample * sample
  }
  const recordingEnergy = recordingSquareSum - (recordingSum * recordingSum) / template.length
  if (recordingEnergy <= 1e-12 || templateEnergy <= 1e-12) return 0
  return dot / Math.sqrt(recordingEnergy * templateEnergy)
}

function findSignalDelay({ recording, template, sampleRate, scheduledOffsetSec }) {
  const factor = Math.max(1, Math.round(sampleRate / 12000))
  const reducedRecording = downsampleAverage(recording, factor)
  const reducedTemplate = removeMean(downsampleAverage(template, factor))
  const reducedRate = sampleRate / factor
  let templateEnergy = 0
  for (const value of reducedTemplate) templateEnergy += value * value

  const searchStart = Math.max(
    0,
    Math.floor((scheduledOffsetSec + MIN_LATENCY_SEC) * reducedRate),
  )
  const searchEnd = Math.min(
    reducedRecording.length - reducedTemplate.length,
    Math.ceil((scheduledOffsetSec + MAX_LATENCY_SEC) * reducedRate),
  )
  let bestOffset = -1
  let bestCorrelation = -1
  for (let offset = searchStart; offset <= searchEnd; offset += 1) {
    const correlation = normalizedCorrelationAt(
      reducedRecording,
      reducedTemplate,
      offset,
      templateEnergy,
    )
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation
      bestOffset = offset
    }
  }

  if (bestOffset < 0) return null
  return {
    latencySec: bestOffset / reducedRate - scheduledOffsetSec,
    correlation: bestCorrelation,
  }
}

function buildContinuousRecording(chunks, sampleRate) {
  if (!chunks.length) return null
  const startTimeSec = Math.min(...chunks.map((chunk) => Number(chunk.tAcSec)))
  const endTimeSec = Math.max(
    ...chunks.map((chunk) => Number(chunk.tAcSec) + chunk.samples.length / sampleRate),
  )
  if (!Number.isFinite(startTimeSec) || !Number.isFinite(endTimeSec)) return null
  const output = new Float32Array(Math.ceil((endTimeSec - startTimeSec) * sampleRate) + 1)
  let peak = 0
  for (const chunk of chunks) {
    const offset = Math.max(0, Math.round((Number(chunk.tAcSec) - startTimeSec) * sampleRate))
    output.set(chunk.samples.subarray(0, output.length - offset), offset)
    for (const value of chunk.samples) peak = Math.max(peak, Math.abs(value))
  }
  return { samples: output, startTimeSec, peak }
}

function analyzeLatencyRecording({ chunks, template, sampleRate, scheduledTimesSec }) {
  const recording = buildContinuousRecording(chunks, sampleRate)
  if (!recording || recording.peak < MIN_INPUT_PEAK) {
    throw new MicrophoneCalibrationError(
      'input-too-quiet',
      'マイクが検査音を検出できませんでした。音量とマイクの向きを確認してください。',
    )
  }

  const attempts = scheduledTimesSec.map((scheduledTimeSec) => {
    const match = findSignalDelay({
      recording: recording.samples,
      template,
      sampleRate,
      scheduledOffsetSec: scheduledTimeSec - recording.startTimeSec,
    })
    return { scheduledTimeSec, ...match }
  })
  const credible = attempts.filter(
    (attempt) =>
      Number.isFinite(attempt.latencySec) &&
      attempt.latencySec >= MIN_LATENCY_SEC &&
      attempt.latencySec <= MAX_LATENCY_SEC &&
      attempt.correlation >= MIN_CORRELATION,
  )
  if (credible.length < MIN_VALID_ATTEMPTS) {
    throw new MicrophoneCalibrationError(
      'unstable-signal',
      '検査音を安定して検出できませんでした。周囲を静かにして、もう一度お試しください。',
    )
  }

  const initialMedian = median(credible.map((attempt) => attempt.latencySec))
  const deviations = credible.map((attempt) => Math.abs(attempt.latencySec - initialMedian))
  const mad = median(deviations) || 0
  const outlierLimit = Math.max(0.03, mad * 3)
  const accepted = credible.filter(
    (attempt) => Math.abs(attempt.latencySec - initialMedian) <= outlierLimit,
  )
  if (accepted.length < MIN_VALID_ATTEMPTS) {
    throw new MicrophoneCalibrationError(
      'unstable-signal',
      '測定結果のばらつきが大きすぎます。マイクとスピーカーを動かさずに再試行してください。',
    )
  }

  const latencySec = median(accepted.map((attempt) => attempt.latencySec))
  const minLatency = Math.min(...accepted.map((attempt) => attempt.latencySec))
  const maxLatency = Math.max(...accepted.map((attempt) => attempt.latencySec))
  return {
    latencyMs: Math.round(latencySec * 1000),
    sampleCount: accepted.length,
    spreadMs: Math.round((maxLatency - minLatency) * 1000),
    attempts,
    peak: recording.peak,
  }
}

function waitUntilAudioTime(audioContext, targetTimeSec, signal, onTick) {
  return new Promise((resolve, reject) => {
    let timer = null
    const finish = () => {
      if (timer != null) clearInterval(timer)
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    const abort = () => {
      if (timer != null) clearInterval(timer)
      signal?.removeEventListener('abort', abort)
      reject(new MicrophoneCalibrationError('cancelled', '測定をキャンセルしました。'))
    }
    if (signal?.aborted) return abort()
    signal?.addEventListener('abort', abort, { once: true })
    timer = setInterval(() => {
      onTick?.(audioContext.currentTime)
      if (audioContext.currentTime >= targetTimeSec) finish()
    }, 40)
  })
}

async function runMicrophoneLatencyCalibration({
  pitchEngine,
  beepUrl,
  signal,
  onProgress,
  attempts = DEFAULT_ATTEMPTS,
}) {
  if (!pitchEngine) throw new MicrophoneCalibrationError('no-microphone', 'マイクを利用できません。')
  const audioContext = pitchEngine.getAudioContext?.()
  if (!audioContext) throw new MicrophoneCalibrationError('audio-unavailable', '音声機能を開始できません。')

  const response = await fetch(beepUrl)
  if (!response.ok) throw new MicrophoneCalibrationError('beep-load-failed', '検査音を読み込めませんでした。')
  const decoded = await audioContext.decodeAudioData(await response.arrayBuffer())
  const template = Float32Array.from(decoded.getChannelData(0))
  const chunks = []
  const sources = []
  const scheduledTimesSec = []
  let inputLevel = 0
  const unsubscribe = pitchEngine.onPcmFrame((frame) => {
    chunks.push(frame)
    let peak = 0
    for (const value of frame.samples) peak = Math.max(peak, Math.abs(value))
    inputLevel = Math.max(peak, inputLevel * 0.88)
  })

  try {
    const firstStartSec = audioContext.currentTime + 0.25
    // Keep every search window isolated from the following pulse. The maximum
    // accepted latency is one second, so intervals must be longer than that.
    const intervalSec = 1.25
    for (let index = 0; index < attempts; index += 1) {
      const source = audioContext.createBufferSource()
      source.buffer = decoded
      source.connect(audioContext.destination)
      const startTime = firstStartSec + index * intervalSec
      source.start(startTime)
      sources.push(source)
      scheduledTimesSec.push(startTime)
    }

    const finishTimeSec = scheduledTimesSec.at(-1) + MAX_LATENCY_SEC + decoded.duration + 0.1
    await waitUntilAudioTime(audioContext, finishTimeSec, signal, (currentTimeSec) => {
      const completed = scheduledTimesSec.filter(
        (scheduledTimeSec) => currentTimeSec >= scheduledTimeSec + MAX_LATENCY_SEC,
      ).length
      onProgress?.({ completed, total: attempts, inputLevel })
    })

    return analyzeLatencyRecording({
      chunks,
      template,
      sampleRate: audioContext.sampleRate,
      scheduledTimesSec,
    })
  } finally {
    unsubscribe()
    for (const source of sources) {
      try {
        source.stop()
      } catch {
        // A source that has already ended does not need further cleanup.
      }
      source.disconnect()
    }
  }
}

export {
  DEFAULT_ATTEMPTS,
  MicrophoneCalibrationError,
  analyzeLatencyRecording,
  findSignalDelay,
  median,
  runMicrophoneLatencyCalibration,
}
