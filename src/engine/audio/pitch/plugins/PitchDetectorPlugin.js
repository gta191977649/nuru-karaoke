class PitchDetectorPlugin {
  constructor() {
    this.id = ''
    this.name = ''
  }

  configure(_cfg) {}

  detect(_frame) {
    return null
  }

  reset() {}
}

export { PitchDetectorPlugin }
