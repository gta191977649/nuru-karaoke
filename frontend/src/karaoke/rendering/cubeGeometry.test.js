import { describe, expect, it } from 'vitest'
import { createCubeFaceGeometry, projectCubeFace } from './cubeGeometry.js'

describe('cube face joins with padded glow textures', () => {
  it.each([0, 5, 20, 45, 70, 85, 90])('shares the same projected edge at %s degrees', (degrees) => {
    const front = createCubeFaceGeometry()
    const side = createCubeFaceGeometry()
    const angle = -degrees * Math.PI / 180
    projectCubeFace(front.vertices, angle)
    projectCubeFace(side.vertices, angle + Math.PI / 2)
    // Front right edge and side left edge are the same physical cube edge,
    // including the endpoints where the padding starts.
    for (let row = 0; row < 4; row++) {
      for (let component = 0; component < 2; component++) {
        expect(front.vertices[(row * 4 + 2) * 2 + component])
          .toBeCloseTo(side.vertices[(row * 4 + 1) * 2 + component], 5)
      }
    }
  })

  it('keeps the 100px face separate from its 15px transparent halo', () => {
    const face = createCubeFaceGeometry()
    expect(face.uvs[10]).toBeCloseTo(15 / 130)
    expect(face.uvs[12]).toBeCloseTo(115 / 130)
    expect(face.indices).toHaveLength(54)
  })
})
