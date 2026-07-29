/**
 * @typedef {Object} PitchFrame
 * @property {Float32Array} samples
 * @property {number} sampleRate
 */

/**
 * @typedef {Object} PitchResult
 * @property {number} tAcSec
 * @property {number | null} f0Hz
 * @property {number | null} rawF0Hz
 * @property {number | null} midi
 * @property {number | null} rawMidi
 * @property {number} confidence
 * @property {number} rawConfidence
 * @property {number} rms
 * @property {string} algoId
 * @property {boolean} smoothingReset
 * @property {number} smoothingResetCount
 * @property {number | null} smoothingResetCents
 */

/**
 * @typedef {Object} PitchDetectorConfig
 * @property {number} windowSize
 * @property {number} hopSize
 * @property {number} rmsGate
 * @property {boolean} smoothing
 */

export {}
