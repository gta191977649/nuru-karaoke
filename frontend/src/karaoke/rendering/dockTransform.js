export function getDockTransform(base, target) {
  // The canvas fills the target; Pixi draws its own aspect-ratio black bars.
  return {
    x: target.left - base.left,
    y: target.top - base.top,
    sx: target.width / base.width,
    sy: target.height / base.height,
  }
}
