const finitePositive = (value) => Number.isFinite(value) && value > 0

/**
 * Returns a shared font size that lets every lyric row fit its own available
 * width. Keeping one size for the visible group prevents adjacent lines from
 * visually jumping between unrelated sizes.
 */
export function fitLyricFontSize({ baseFontSize, rows, safetyPx = 0 }) {
    if (!finitePositive(baseFontSize) || !Array.isArray(rows) || !rows.length) {
        return baseFontSize
    }

    let scale = 1
    for (const row of rows) {
        const contentWidth = Number(row?.contentWidth)
        const availableWidth = Number(row?.availableWidth) - Math.max(0, Number(safetyPx) || 0)
        if (!finitePositive(contentWidth) || !finitePositive(availableWidth)) continue
        scale = Math.min(scale, availableWidth / contentWidth)
    }

    return baseFontSize * Math.max(0, Math.min(1, scale))
}

