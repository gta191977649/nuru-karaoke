import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib'
import defaultSoundFontUrl from '../../soundfont/sc55.sf2'

// Backend contract: output, synth controls, transport, prepare(), dispose().
export class BuiltinBackend {
  id = 'builtin'
  async initialize(context, onProgress) {
    await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}builtin-synth/processor.js?v=clean-transitions-1`)
    this.synth = new WorkletSynthesizer(context)
    await this.synth.isReady
    onProgress({ stage: 'soundfont-download', text: '音色ライブラリをダウンロードしています…' })
    const response = await fetch(defaultSoundFontUrl)
    if (!response.ok) throw new Error(`SoundFont HTTP ${response.status}`)
    const buffer = await response.arrayBuffer()
    onProgress({ stage: 'soundfont-load', text: '音色ライブラリを読み込んでいます…' })
    await this.synth.soundBankManager.addSoundBank(buffer, 'main')
    this.transport = new Sequencer(this.synth)
    this.transport.loopCount = -1
    this.output = this.synth
    return this
  }
  async prepare(buffer, name) {
    this.transport.loadNewSongList([{ binary: buffer, fileName: name }])
    await this.transport.getMIDI()
  }
  beginLoad() {
    this.transport.pause()
    this.synth.stopAll(true)
    // The worklet clears audio before loadNewSongList in the same ordered port.
    // Never block song reservation on an unrelated snapshot response.
  }
  dispose() {
    this.transport?.pause()
    this.synth?.stopAll(true)
    this.synth?.disconnect()
    this.synth?.destroy?.()
  }
}
