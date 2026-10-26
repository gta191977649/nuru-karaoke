import { BlurFilter, Container, Graphics, MeshSimple, Rectangle, Texture } from 'pixi.js'
import { label } from './singingPrimitives.js'
import { createCubeFaceGeometry, projectCubeFace } from './cubeGeometry.js'
import { createScoreAnimation } from './singingScoreAnimation.js'

// A CSS-compatible perspective cube, projected as four textured WebGL quads.
// Coalesce per-note scores with the same 1s turn / 2s calculate / 3s hold timing.
export function createScoreCube(app, parent) {
  const root = new Container()
  parent.addChild(root)
  root.position.set(100, 80)
  const faces = []
  let scoreTexture, calculationTexture
  let shown = 0, ready = false, textureKey = ''
  const animation = createScoreAnimation()
  // Original CSS: text-shadow: 2px 2px 0 #000 (a hard shadow, not a stroke).
  const scoreShadow = { color: 0x000000, alpha: 1, distance: Math.sqrt(8), angle: Math.PI / 4, blur: 0 }
  function makeTexture(calculating) {
    const face = new Container()
    // The halo belongs to the face texture, including its transparent padding.
    // It therefore uses the same perspective and visibility as the rotating face.
    const glow = new Graphics().rect(0, 0, 100, 100).fill({ color: 0x00a8ff, alpha: 0.5 })
    const blur = new BlurFilter({ strength: 7.5, quality: 4 })
    glow.filters = [blur]
    face.addChild(glow)
    face.addChild(new Graphics().rect(0, 0, 100, 100).fill(0x00a8ff).stroke({ color: 0xffffff, alpha: 0.5, width: 2 }))
    if (calculating) {
      const value = label(face, '集計中', 24, { dropShadow: scoreShadow })
      value.anchor.set(0.5); value.position.set(50, 50)
    } else {
      const title = label(face, '現在得点', 12.8, { fill: 0xcceeff })
      title.anchor.set(0.5); title.position.set(50, ready ? 18 : 25)
      const value = label(face, ready ? String(Math.round(shown)) : '集計中', ready ? 40 : 18.4, { fontFamily: ready ? 'Impact, sans-serif' : 'Hiragino Sans, Meiryo, sans-serif', dropShadow: scoreShadow })
      value.anchor.set(0.5); value.position.set(50, ready ? 48 : 46)
      face.addChild(new Graphics().moveTo(10, ready ? 73 : 62).lineTo(90, ready ? 73 : 62).stroke({ color: 0xffffff, width: 2 }))
      const unit = label(face, '100', 16); unit.anchor.set(0.5); unit.position.set(50, ready ? 86 : 75)
    }
    const texture = app.renderer.generateTexture({ target: face, frame: new Rectangle(-15, -15, 130, 130), resolution: app.renderer.resolution })
    face.destroy({ children: true })
    blur.destroy()
    return texture
  }
  for (let i = 0; i < 4; i++) {
    const mesh = new MeshSimple({ texture: Texture.EMPTY, ...createCubeFaceGeometry() })
    root.addChild(mesh); faces.push(mesh)
  }
  return {
    update(s, now, alpha) {
      const frame = animation.update(s, now)
      shown = frame.score
      ready = frame.ready
      const rotation = frame.rotation
      const key = `${shown}:${ready}`
      if (textureKey !== key) {
        textureKey = key
        const old = scoreTexture
        scoreTexture = makeTexture(false)
        calculationTexture ||= makeTexture(true)
        faces.forEach((face, i) => { face.texture = i % 2 ? calculationTexture : scoreTexture })
        old?.destroy(true)
      }
      root.alpha = alpha
      faces.forEach((face, index) => {
        const angle = index * Math.PI / 2 - rotation
        face.visible = Math.cos(angle) > 0.001
        const vertices = face.vertices
        projectCubeFace(vertices, angle)
        face.vertices = vertices
      })
    },
    destroy() { scoreTexture?.destroy(true); calculationTexture?.destroy(true) },
  }
}


