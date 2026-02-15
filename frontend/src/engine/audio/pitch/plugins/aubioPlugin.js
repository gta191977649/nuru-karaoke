import aubioModule from 'aubiojs'

class AubioPlugin {
  constructor() {
    this.id = 'aubio'
    this.name = 'AubioJS'
    this._detector = null
    this._inputLength = 0
    this._sampleRate = 0
    this._initializing = false
    this._ready = false
    this._aubioPromise = null
    this._aubioError = null
    this._tolerance = 0.5
  }

  configure(cfg) {
    const tol = Number(cfg?.aubioTolerance)
    if (Number.isFinite(tol)) {
      this._tolerance = tol
      if (this._detector?.setTolerance) this._detector.setTolerance(tol)
    }
  }

  _ensureDetector(length, sampleRate) {
    if (this._detector && this._inputLength === length && this._sampleRate === sampleRate) return
    if (this._initializing) return
    if (this._aubioError) return

    this._initializing = true
    this._inputLength = length
    this._sampleRate = sampleRate

    if (!this._aubioPromise) {
      try {
        const loader =
          typeof aubioModule === 'function'
            ? aubioModule
            : typeof aubioModule?.default === 'function'
              ? aubioModule.default
              : null
        if (!loader) {
          throw new Error('aubiojs default export not found')
        }
        this._aubioPromise = Promise.resolve(loader()).catch((err) => {
          this._aubioError = err
          console.warn('[AubioPlugin] init failed', err)
          return null
        })
      } catch (err) {
        this._aubioError = err
        this._aubioPromise = Promise.resolve(null)
      }
    }

    this._aubioPromise
      .then((aubio) => {
        if (!aubio) return
        const { Pitch } = aubio
        if (typeof Pitch !== 'function') {
          this._aubioError = new Error('aubiojs Pitch not available')
          return
        }
        const hop = Math.max(1, Math.floor(length / 8))
        this._detector = new Pitch('default', length, hop, sampleRate)
        if (this._detector?.setTolerance) this._detector.setTolerance(this._tolerance)
        this._ready = true
      })
      .finally(() => {
        this._initializing = false
      })
  }

  detect(frame) {
    const samples = frame?.samples
    const sampleRate = Number(frame?.sampleRate)
    if (!samples || !Number.isFinite(sampleRate)) return null

    this._ensureDetector(samples.length, sampleRate)
    if (!this._ready || !this._detector?.do) return null

    const f0Hz = this._detector.do(samples)
    return {
      f0Hz: Number.isFinite(f0Hz) ? f0Hz : null,
      midi: null,
      confidence: Number.isFinite(f0Hz) ? 1 : 0,
    }
  }

  reset() {
    this._detector = null
    this._inputLength = 0
    this._sampleRate = 0
    this._ready = false
  }
}

export { AubioPlugin }
