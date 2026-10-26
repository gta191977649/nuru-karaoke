import { Text } from 'pixi.js'

const uiFamily = 'Hiragino Sans, Meiryo, sans-serif'

export function label(parent, text, size, options = {}) {
  const result = new Text({ text, style: { fontFamily: uiFamily, fontSize: size, fill: 0xffffff, fontWeight: 'bold', ...options } })
  parent.addChild(result)
  return result
}

export function clear(parent) {
  for (const child of parent.removeChildren()) child.destroy({ children: true })
}

