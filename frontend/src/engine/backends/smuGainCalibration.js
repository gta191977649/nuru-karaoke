// Measured with the pinned WASM, three local library MIDIs (9-1, 8-1, 7-1),
// first 20s, active RMS gate -50 dBFS. Median reference + 2 dB conservative
// bias: the realtime controller can boost the remainder without an opening jump.
export const SMU_GAIN_REFERENCE_DB = Object.freeze({ fast: -28.2, exact: -31.1 })
