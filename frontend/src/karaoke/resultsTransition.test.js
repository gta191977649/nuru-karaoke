import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasNextResultsSong, runKaraokeTransition, startResultsCountdown } from './resultsTransition.js'

describe('results countdown', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('only identifies a next song after excluding the current entry', () => {
        expect(hasNextResultsSong({ queue: [], queueIndex: -1 })).toBe(false)
        expect(hasNextResultsSong({ queue: ['A'], queueIndex: 0 })).toBe(false)
        expect(hasNextResultsSong({ queue: ['A', 'B'], queueIndex: 0 })).toBe(true)
        expect(hasNextResultsSong({ queue: ['A', 'B'], queueIndex: 1 })).toBe(true)
        expect(hasNextResultsSong({ queue: ['A', 'B'], queueIndex: -1 })).toBe(false)
    })

    it('shows seconds and fires once at exactly ten seconds', () => {
        const onTick = vi.fn()
        const onTimeout = vi.fn()
        startResultsCountdown({ durationMs: 10000, onTick, onTimeout })
        expect(onTick).toHaveBeenLastCalledWith(10)
        vi.advanceTimersByTime(1000)
        expect(onTick).toHaveBeenLastCalledWith(9)
        vi.advanceTimersByTime(8999)
        expect(onTimeout).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(onTimeout).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(20000)
        expect(onTimeout).toHaveBeenCalledTimes(1)
    })

    it('cancels when leaving/removing the next song and allows a fresh deadline', () => {
        const onTimeout = vi.fn()
        const options = { durationMs: 10000, onTick: vi.fn(), onTimeout }
        const cancel = startResultsCountdown(options)
        vi.advanceTimersByTime(5000)
        cancel()
        vi.advanceTimersByTime(10000)
        expect(onTimeout).not.toHaveBeenCalled()
        startResultsCountdown(options)
        vi.advanceTimersByTime(9999)
        expect(onTimeout).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(onTimeout).toHaveBeenCalledTimes(1)
    })

    it('uses the deadline even if timer delivery is delayed', () => {
        let now = 0
        const onTimeout = vi.fn()
        startResultsCountdown({ durationMs: 10000, onTick: vi.fn(), onTimeout, now: () => now })
        now = 12000
        vi.advanceTimersByTime(250)
        expect(onTimeout).toHaveBeenCalledTimes(1)
    })
})

describe('exclusive results transition', () => {
    it('deduplicates manual/timeout requests and waits for the fade before advancing', async () => {
        let finishFade
        const before = vi.fn(() => new Promise((resolve) => { finishFade = resolve }))
        const action = vi.fn()
        const setPhase = vi.fn()
        const lock = { current: false }
        const options = { lock, setPhase, fadeMs: 1000, before, action, wait: vi.fn().mockResolvedValue() }
        const first = runKaraokeTransition(options)
        expect(await runKaraokeTransition(options)).toBe(false)
        expect(before).toHaveBeenCalledTimes(1)
        expect(action).not.toHaveBeenCalled()
        finishFade()
        expect(await first).toBe(true)
        expect(action).toHaveBeenCalledTimes(1)
        expect(setPhase.mock.calls.flat()).toEqual(['in', 'out', 'idle'])
        expect(lock.current).toBe(false)
    })

    it('releases the transition after failure so manual retry succeeds', async () => {
        const options = {
            lock: { current: false }, setPhase: vi.fn(), fadeMs: 1000,
            wait: vi.fn().mockResolvedValue(), action: vi.fn().mockRejectedValueOnce(new Error('load failed')).mockResolvedValue(),
        }
        await expect(runKaraokeTransition(options)).rejects.toThrow('load failed')
        expect(options.lock.current).toBe(false)
        expect(options.setPhase).toHaveBeenLastCalledWith('idle')
        expect(await runKaraokeTransition(options)).toBe(true)
    })
})
