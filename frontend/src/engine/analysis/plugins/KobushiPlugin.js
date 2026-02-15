import { TechniquePlugin, techniqueRegistry } from '../TechniqueRegistry.js'

class KobushiPlugin extends TechniquePlugin {
    constructor() {
        super('kobushi', 'Kobushi')
        this.isActive = false
        this.cooldown = 0
        this.lastDetectTime = 0
    }

    analyze(time, f0Cents, historyBuffer, activeTechniques) {
        // 1. Exclusivity Rule: Kobushi sections do not overlap with vibrato sections.
        // If Vibrato is detected, we cannot detect Kobushi.
        if (activeTechniques && activeTechniques.vibrato) {
            this.isActive = false
            return null
        }

        // Cooldown check
        if (this.cooldown > 0) {
            this.cooldown -= 0.1 // Decrement approx by time step
            this.isActive = false
            return null
        }

        // Need significant history for pattern matching (approx 0.5s - 1s)
        if (!Number.isFinite(f0Cents) || historyBuffer.length < 20) {
            return null
        }

        // Algorithm implementation based on:
        // Peak feature gradient V > 1000 cent/sec.
        // Structure: 5-length vector (Start, LeftSub, Main, RightSub, End).
        // Main Peak Height > 150 cents. (Ideally localized)

        // Step A: Extract "Feature Points" (Peaks/Valleys)
        // We simplify the curve into extrema.
        // We iterate history to find local min/max.

        // Get recent window (~0.6s)
        const windowSec = 0.6
        const now = historyBuffer[historyBuffer.length - 1].t
        const windowStart = now - windowSec

        const points = []
        for (let i = historyBuffer.length - 1; i >= 0; i--) {
            const p = historyBuffer[i]
            if (p.t < windowStart) break
            if (Number.isFinite(p.v)) points.push(p)
        }
        points.reverse() // ordered by time asc

        if (points.length < 10) return null

        // Find local extrema (peaks and valleys)
        // A point i is a peak if v[i-1] < v[i] > v[i+1]
        // A point i is a valley if v[i-1] > v[i] < v[i+1]
        // We smooth slightly to avoid noise? Or trust strictly.
        // Let's perform a tiny simple smoothing or just use raw if input is clean.
        // The previous pipeline has "Post f0 Validate" so it might be okay.
        // For safety, let's use raw but strict inequality.

        const extrema = []

        // Helper to add extrema: { t, v, type: 'peak'|'valley' }
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1]
            const curr = points[i]
            const next = points[i + 1]

            if (curr.v > prev.v && curr.v > next.v) {
                extrema.push({ ...curr, type: 'peak', idx: i })
            } else if (curr.v < prev.v && curr.v < next.v) {
                extrema.push({ ...curr, type: 'valley', idx: i })
            }
        }

        // Need at least one peak for Kobushi
        if (extrema.length === 0) return null

        // Evaluate Gradient Condition (feature point definition)
        // "We define a peak as a feature point with a gradient from the previous feature point of more than V"
        // This implies we filter the extrema list.
        // This is recursive. Let's simplify: 
        // We accept an extremum as a "significant feature" if the slope from the previous extremum is steep.
        // BUT the paper implies constructing a vector of 5 points.

        // Pattern Search:
        // We look for a sequence of 3 extrema (Valley, Peak, Valley) OR (Peak, Valley, Peak) ??
        // Rule: "A kobushi section has only one peak... (main peak). In front of and behind... low peak (sub-peak) of OPPOSITE sign."
        // "Opposite sign" implies: If Main is UP (Peak), sub-peaks are DOWN (Valleys).
        // So the pattern is: Valley -> Peak -> Valley. (LeftSub -> Main -> RightSub)
        // Wait, "Start" and "End" are the boundaries (flat regions?).

        // Let's assume Main Peak is type 'peak' (going up).
        // Pattern: Start(flat) -> LeftSub(valley/dip) -> Main(peak) -> RightSub(valley/dip) -> End(flat).
        // Or simpler: just Main Peak surrounded by Dips.

        // Let's iterate through all extrema to find a candidate Main Peak.
        const V_GRADIENT = 1000 // cents/sec

        for (let i = 0; i < extrema.length; i++) {
            const main = extrema[i]

            // Kobushi is typically a quick turn.
            // Let's focus on Main Peak. It must be valid.
            // Check surrounding context.

            // Find Left Neighbor (could be LeftSub)
            const left = i > 0 ? extrema[i - 1] : null

            // Find Right Neighbor (could be RightSub)
            const right = i < extrema.length - 1 ? extrema[i + 1] : null

            if (!left || !right) continue

            // Check Alternating Signs (Peak vs Valley)
            if (main.type === left.type || main.type === right.type) {
                // Should verify standard extrema property implies alternation, 
                // but noise might cause double peaks.
                // If we have Peak -> Peak, it's not a Kobushi pattern usually.
                continue
            }

            // Calculate Extent / Height
            // The prompt says: Pi = fi - baseline...
            // Simplified: Height from the baseline connected by Start and End.
            // We need "Start" and "End".
            // Let's try to define Start/End as the points *before* LeftSub and *after* RightSub?
            // OR, if sub-peaks don't exist, Start/End are just the bases.

            // Robust Approach:
            // Measure Peak prominence relative to neighbors.
            // Height from Left Valley: abs(main.v - left.v)
            // Height from Right Valley: abs(main.v - right.v)

            const heightLeft = Math.abs(main.v - left.v)
            const heightRight = Math.abs(main.v - right.v)

            // Condition: Main Peak Height > 150 cents
            // We take the minimal height (must be prominent on BOTH sides? or just overall?)
            // Usually Kobushi returns to roughly original pitch.
            // So height on both sides should be significant.

            const MIN_HEIGHT = 150

            if (heightLeft < MIN_HEIGHT || heightRight < MIN_HEIGHT) continue

            // Gradient Check
            // "Gradient from previous feature point > V"
            // Slope = dV / dT
            const slopeLeft = Math.abs((main.v - left.v) / (main.t - left.t))
            const slopeRight = Math.abs((main.v - right.v) / (main.t - right.t))

            // Check if *at least one* side is very steep (the "feature determination")
            // Or strictly the approach phase?
            // Prompt: "feature point with a gradient from the *previous* feature point"
            // checks P_curr vs P_prev.
            if (slopeLeft < V_GRADIENT && slopeRight < V_GRADIENT) continue

            // If we reach here, we have a candidate:
            // A Peak/Valley flanked by opposite extrema, with height > 150 and steep slope.
            // This is a strong Kobushi Candidate.

            // Check for duplicates (don't re-detect same peak)
            // usage of this.lastDetectTime
            // If main.t is very close to last detected event time, skip.
            if (Math.abs(main.t - this.lastDetectTime) < 0.3) continue

            // We found one!
            this.lastDetectTime = main.t
            this.isActive = true
            this.cooldown = 0.4

            return {
                type: 'kobushi',
                t: main.t,
                height: Math.max(heightLeft, heightRight)
            }
        }

        this.isActive = false
        return null
    }

    reset() {
        this.cooldown = 0
        this.lastDetectTime = 0
        this.isActive = false
    }
}

techniqueRegistry.register(new KobushiPlugin())
