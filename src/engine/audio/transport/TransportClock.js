class TransportClock {
  constructor() {
    this._startAcTime = null
  }

  start(acTimeSec) {
    const t = Number(acTimeSec)
    this._startAcTime = Number.isFinite(t) ? t : 0
  }

  reset() {
    this._startAcTime = null
  }

  getSongTime(acTimeSec, latencyCompSec = 0) {
    if (this._startAcTime == null) return 0
    const now = Number(acTimeSec)
    if (!Number.isFinite(now)) return 0
    const latency = Number(latencyCompSec)
    const offset = Number.isFinite(latency) ? latency : 0
    return Math.max(0, now - this._startAcTime + offset)
  }
}

export { TransportClock }
