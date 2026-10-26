import { describe, expect, it, vi } from 'vitest'
import { withBuiltinTransitions } from './builtinTransitions.js'
import { BuiltinBackend } from './BuiltinBackend.js'

describe('builtin transition boundaries', () => {
  it('pauses and clears old audio without waiting for a snapshot reply', () => {
    const order = []
    const backend = new BuiltinBackend()
    backend.transport = { pause: () => order.push('pause') }
    backend.synth = { stopAll: force => order.push(`stop:${force}`),
      getSnapshot: vi.fn(() => new Promise(() => {})) }
    expect(backend.beginLoad()).toBeUndefined()
    expect(order).toEqual(['pause', 'stop:true'])
    expect(backend.synth.getSnapshot).not.toHaveBeenCalled()
  })
  it('leaves ordinary pause/play/controller messages unchanged', () => {
    const received = []
    const Base = class { constructor() { this.core = { handleMessage: message => received.push(message) } } }
    const Wrapped = withBuiltinTransitions(Base)
    const instance = new Wrapped({})
    for (const type of ['pause', 'play', 'setPlaybackRate']) instance.core.handleMessage({ type: 'sequencerSpecific', data: { type } })
    instance.core.handleMessage({ type: 'stopAll', channelNumber: 2, data: 1 })
    expect(received).toHaveLength(4)
  })
})
