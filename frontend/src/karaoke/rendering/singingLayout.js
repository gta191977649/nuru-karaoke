// CSS pixels, matching Karaoke.css. Media queries and vw/vh use the viewport,
// while flex sizing uses the actual player panel (including its parked size).
export function getSingingLayout(width, height, viewportWidth, viewportHeight, rem = 16) {
  const compact = viewportWidth <= 980
  const padding = compact ? 14 : 20
  const side = compact ? 24 : 50
  const bottomPadding = compact ? 24 : 40
  const topHeight = Math.max(
    (height - padding * 2 - bottomPadding) * 0.6 + padding * 2,
    Math.max(0, width - padding * 2) * 220 / 800 + padding * 2 + 140,
  )
  return {
    width, height, side, bottomPadding, topHeight,
    melody: { x: padding, y: padding + 40, width: Math.max(1, width - padding * 2), height: Math.max(1, topHeight - padding * 2 - 140) },
    lyricWidth: Math.max(1, width - side * 2),
    lyricFontSize: (viewportWidth <= 720 ? 2.9 : compact ? 3.5 : 4) * rem,
    lyricCenterY: topHeight + (height - topHeight - bottomPadding) / 2,
    introTop: Math.max(72, Math.min(120, viewportHeight * 0.12)),
    introWidth: Math.max(1, Math.min(1120, width - 80)),
  }
}

export function coverSize(sourceWidth, sourceHeight, width, height) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  return { width: sourceWidth * scale, height: sourceHeight * scale }
}
