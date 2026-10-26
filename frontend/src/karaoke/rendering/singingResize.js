// CSS transforms change getBoundingClientRect(), not the renderer's layout size.
// Let CSS animate the existing surface; rebuild text only once resizing settles.
export function createSingingResize(app, scene, host, viewport = window) {
  let timer
  let previous = ''
  const signature = () => `${host.clientWidth}:${host.clientHeight}:${viewport.innerWidth}:${viewport.innerHeight}`
  const resize = () => {
    timer = undefined
    const width = host.clientWidth
    const height = host.clientHeight
    if (width <= 0 || height <= 0 || previous === signature()) return
    previous = signature()
    app.renderer.resize(width, height)
    // Pixi autoDensity writes inline pixel sizes when its backing buffer changes.
    app.canvas.style.width = '100%'
    app.canvas.style.height = '100%'
    scene.resize(width, height)
  }
  return {
    resize,
    schedule() {
      if (previous === signature()) return
      clearTimeout(timer)
      timer = setTimeout(resize, 100)
    },
    destroy() { clearTimeout(timer) },
  }
}
