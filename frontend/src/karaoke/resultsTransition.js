// Match _advanceQueue: it removes the current entry, then selects from what remains.
export function hasNextResultsSong({ queue, queueIndex }) {
    return Number.isInteger(queueIndex) && queueIndex >= 0 && queueIndex < queue.length && queue.length > 1
}

export function startResultsCountdown({ durationMs, onTick, onTimeout, now = Date.now }) {
    const deadline = now() + durationMs
    let timer
    let cancelled = false
    const cancel = () => {
        cancelled = true
        clearTimeout(timer)
    }
    const tick = () => {
        if (cancelled) return
        const remaining = Math.max(0, deadline - now())
        onTick(Math.ceil(remaining / 1000))
        if (remaining === 0) {
            cancel()
            onTimeout()
        } else {
            timer = setTimeout(tick, Math.min(remaining, 250))
        }
    }
    tick()
    return cancel
}

export async function runKaraokeTransition({ lock, setPhase, fadeMs, before, action, wait }) {
    if (lock.current) return false
    lock.current = true
    try {
        setPhase('in')
        await Promise.all([wait(fadeMs), before?.()])
        await action()
        setPhase('out')
        await wait(fadeMs)
        return true
    } finally {
        setPhase('idle')
        lock.current = false
    }
}
