import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('results BGM fade', () => {
    let audio
    let uiAudio
    let frames
    let now
    let nextId
    const frame = (time) => {
        now = time
        const callbacks = [...frames.values()]
        frames.clear()
        callbacks.forEach((callback) => callback(time))
    }

    beforeEach(async () => {
        vi.resetModules()
        frames = new Map()
        now = 0
        nextId = 0
        vi.stubGlobal('performance', { now: () => now })
        vi.stubGlobal('requestAnimationFrame', (callback) => {
            frames.set(++nextId, callback)
            return nextId
        })
        vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id))
        vi.stubGlobal('Audio', class {
            constructor() {
                audio = this
                this.paused = true
                this.currentTime = 0
                this.play = vi.fn(async () => { this.paused = false })
                this.pause = vi.fn(() => { this.paused = true })
            }
        })
        uiAudio = (await import('./audioEngine.js')).getUiAudioEngine()
        await uiAudio.playBgm('result.mp3', { loop: true })
        audio.currentTime = 8
    })
    afterEach(() => vi.unstubAllGlobals())

    it('shares one fade between button and cleanup, without replaying or rewinding', async () => {
        const done = uiAudio.stopBgm({ fadeMs: 1000, reset: false })
        expect(audio.loop).toBe(false)
        frame(500)
        expect(audio.volume).toBeCloseTo(0.45)
        expect(uiAudio.stopBgm({ fadeMs: 1000, reset: false })).toBe(done)
        frame(1000)
        await done
        expect(audio.pause).toHaveBeenCalledTimes(1)
        expect(audio.play).toHaveBeenCalledTimes(1)
        expect(audio.currentTime).toBe(8)
        await uiAudio.stopBgm({ fadeMs: 1000, reset: false })
        expect(frames.size).toBe(0)
        expect(audio.pause).toHaveBeenCalledTimes(1)
    })

    it('allows a later results session to play without being stopped by an old fade', async () => {
        const done = uiAudio.stopBgm({ fadeMs: 1000, reset: false })
        frame(400)
        await uiAudio.playBgm('result.mp3')
        await done
        frame(1400)
        expect(audio.paused).toBe(false)
        expect(audio.volume).toBeCloseTo(0.9)
        expect(audio.play).toHaveBeenCalledTimes(2)
    })
})
