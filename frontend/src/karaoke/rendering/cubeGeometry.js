// Keep real face edges as vertices. A single padded quad interpolates UVs
// across the perspective projection and moves its visible edge off the cube.
const coordinates = [-65, -50, 50, 65]

export function createCubeFaceGeometry() {
  const vertices = new Float32Array(32)
  const uvs = new Float32Array(32)
  const indices = []
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const i = row * 4 + col
      uvs[i * 2] = (coordinates[col] + 65) / 130
      uvs[i * 2 + 1] = (coordinates[row] + 65) / 130
      if (row < 3 && col < 3) indices.push(i, i + 1, i + 5, i, i + 5, i + 4)
    }
  }
  return { vertices, uvs, indices: new Uint32Array(indices) }
}

export function projectCubeFace(vertices, angle) {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = coordinates[col]
      const y = coordinates[row]
      const z = -x * sine + 50 * cosine
      const perspective = 800 / (800 - z)
      const i = (row * 4 + col) * 2
      vertices[i] = (x * cosine + 50 * sine) * perspective
      vertices[i + 1] = y * perspective
    }
  }
}
