/**
 * @typedef {Object} PitchFrame
 * @property {Float32Array} samples
 * @property {number} sampleRate
 */

/**
 * @typedef {Object} PitchResult
 * @property {number} tAcSec
 * @property {number | null} f0Hz
 * @property {number | null} midi
 * @property {number} confidence
 * @property {number} rms
 * @property {string} algoId
 */

/**
 * @typedef {Object} PitchDetectorConfig
 * @property {number} windowSize
 * @property {number} hopSize
 * @property {number} rmsGate
 * @property {boolean} smoothing
 */

export {}
