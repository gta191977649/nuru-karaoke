const DROP_NOTE = 255

const XG_TO_GS_DRUM_MAP = new Uint8Array(128)
const XG_TO_GS_DRUM_DROP = new Uint8Array(128)

for (let i = 0; i < 128; i++) {
  XG_TO_GS_DRUM_MAP[i] = i
}

const markDropRange = (start, end) => {
  for (let i = start; i <= end; i++) {
    XG_TO_GS_DRUM_MAP[i] = DROP_NOTE
    XG_TO_GS_DRUM_DROP[i] = 1
  }
}

markDropRange(60, 69)
markDropRange(70, 127)

const KEEP_NOTES = [
  35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 75, 76, 77,
]

for (const note of KEEP_NOTES) {
  XG_TO_GS_DRUM_MAP[note] = note
  XG_TO_GS_DRUM_DROP[note] = 0
}

const REMAP_NOTES = [
  [33, 36],
  [34, 36],
  [57, 49],
  [59, 51],
]

for (const [from, to] of REMAP_NOTES) {
  XG_TO_GS_DRUM_MAP[from] = to
  XG_TO_GS_DRUM_DROP[from] = 0
}

const isXgReset = (data) => {
  const offset = data[0] === 0xf0 ? 1 : 0
  return (
    data.length - offset >= 7 &&
    data[offset] === 0x43 &&
    data[offset + 2] === 0x4c &&
    data[offset + 3] === 0x00 &&
    data[offset + 4] === 0x00 &&
    data[offset + 5] === 0x7e &&
    data[offset + 6] === 0x00
  )
}

const isGsReset = (data) => {
  const offset = data[0] === 0xf0 ? 1 : 0
  return (
    data.length - offset >= 9 &&
    data[offset] === 0x41 &&
    data[offset + 2] === 0x42 &&
    data[offset + 3] === 0x12 &&
    data[offset + 4] === 0x40 &&
    data[offset + 5] === 0x00 &&
    data[offset + 6] === 0x7f &&
    data[offset + 7] === 0x00
  )
}

const isGmReset = (data) => {
  const offset = data[0] === 0xf0 ? 1 : 0
  return data.length - offset >= 4 && data[offset] === 0x7e && data[offset + 2] === 0x09
}

const GS_RESET_EVENT = {
  type: 'sysex',
  data: new Uint8Array([0xf0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7]),
}

function createXgDrumToGsMapper() {
  const bankMSB = new Int16Array(16).fill(-1)
  const bankLSB = new Int16Array(16).fill(-1)
  const hasBankMSB = new Uint8Array(16)
  const hasBankLSB = new Uint8Array(16)
  const bankPairSeen = new Uint8Array(16)
  const drumChannels = new Uint8Array(16)
  const brushChannels = new Uint8Array(16)

  let globalMode = 'unknown'
  let detectedBy = null
  let bankSelectPairs = 0
  let enabled = true
  let preferGsPlayback = true
  let gsResetSent = false

  const outOne = [null]
  const outEmpty = []

  const snapshotState = () => ({
    globalMode,
    detectedBy,
    xgBankSelectPairs: bankSelectPairs,
    drumChannels: Array.from(drumChannels, Boolean),
    brushChannels: Array.from(brushChannels, Boolean),
    bankMSB: Array.from(bankMSB),
    bankLSB: Array.from(bankLSB),
  })

  const updateMode = (nextMode, reason) => {
    if (globalMode === nextMode) return false
    globalMode = nextMode
    if (reason) detectedBy = reason
    return true
  }

  const updateBankPair = (channel) => {
    if (!bankPairSeen[channel] && hasBankMSB[channel] && hasBankLSB[channel]) {
      bankPairSeen[channel] = 1
      bankSelectPairs += 1
      if (bankSelectPairs >= 2 && globalMode !== 'xg') {
        return updateMode('xg', 'bank')
      }
    }
    return false
  }

  const updateDrumFlags = (channel, msbValue) => {
    const nextDrum = msbValue === 127 || msbValue === 126
    const changed = drumChannels[channel] !== Number(nextDrum)
    drumChannels[channel] = nextDrum ? 1 : 0
    brushChannels[channel] = nextDrum && bankLSB[channel] === 40 ? 1 : 0
    return changed
  }

  const process = (event) => {
    let stateChanged = false

    if (event?.type === 'sysex' && event.data) {
      if (isXgReset(event.data)) {
        stateChanged = updateMode('xg', 'sysex') || stateChanged
        if (preferGsPlayback) {
          if (!gsResetSent) {
            gsResetSent = true
            outOne[0] = GS_RESET_EVENT
            if (process.onStateChange && stateChanged) process.onStateChange(snapshotState())
            return outOne
          }
          if (process.onStateChange && stateChanged) process.onStateChange(snapshotState())
          return outEmpty
        }
      } else if (isGsReset(event.data) || isGmReset(event.data)) {
        if (globalMode !== 'xg') stateChanged = updateMode('gs/gm', 'sysex') || stateChanged
      }
    }

    if (event?.type === 'cc') {
      const channel = event.channel ?? 0
      if (event.controller === 0) {
        const value = event.value ?? 0
        bankMSB[channel] = value
        hasBankMSB[channel] = 1
        stateChanged = updateDrumFlags(channel, value) || stateChanged
        stateChanged = updateBankPair(channel) || stateChanged
      } else if (event.controller === 32) {
        const value = event.value ?? 0
        bankLSB[channel] = value
        hasBankLSB[channel] = 1
        if (drumChannels[channel]) brushChannels[channel] = value === 40 ? 1 : 0
        stateChanged = updateBankPair(channel) || stateChanged
      }
    }

    if (process.onStateChange && stateChanged) {
      process.onStateChange(snapshotState())
    }

    if (!enabled || globalMode !== 'xg') {
      outOne[0] = event
      return outOne
    }

    if (event?.type === 'note_on' || event?.type === 'note_off') {
      const channel = event.channel ?? 0
      if (!drumChannels[channel]) {
        outOne[0] = event
        return outOne
      }
      const note = event.note ?? 0
      if (XG_TO_GS_DRUM_DROP[note]) return outEmpty
      event.note = XG_TO_GS_DRUM_MAP[note]
    }

    outOne[0] = event
    return outOne
  }

  process.reset = () => {
    bankMSB.fill(-1)
    bankLSB.fill(-1)
    hasBankMSB.fill(0)
    hasBankLSB.fill(0)
    bankPairSeen.fill(0)
    drumChannels.fill(0)
    brushChannels.fill(0)
    globalMode = 'unknown'
    detectedBy = null
    bankSelectPairs = 0
    gsResetSent = false
    if (process.onStateChange) process.onStateChange(snapshotState())
  }

  process.setEnabled = (nextEnabled) => {
    enabled = Boolean(nextEnabled)
  }

  process.setPreferGsPlayback = (nextPrefer) => {
    preferGsPlayback = Boolean(nextPrefer)
  }

  process.getState = () => snapshotState()

  return process
}

export { XG_TO_GS_DRUM_MAP, XG_TO_GS_DRUM_DROP, createXgDrumToGsMapper }
