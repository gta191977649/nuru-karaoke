export const SINGING_ASPECT_RATIO = 16 / 9

// Bounds are in renderer pixels; displayAspect includes any outer CSS scaling.
// Counter-scale the content so the final displayed scene remains exactly 16:9.
export function getSingingViewport(width, height, displayAspect = width / height, designWidth = width) {
  const contentWidth = displayAspect > SINGING_ASPECT_RATIO
    ? width * SINGING_ASPECT_RATIO / displayAspect : width
  const contentHeight = displayAspect < SINGING_ASPECT_RATIO
    ? height * displayAspect / SINGING_ASPECT_RATIO : height
  return {
    x: (width - contentWidth) / 2,
    y: (height - contentHeight) / 2,
    width: contentWidth,
    height: contentHeight,
    scaleX: contentWidth / designWidth,
    scaleY: contentHeight / (designWidth / SINGING_ASPECT_RATIO),
  }
}
