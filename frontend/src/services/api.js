const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const DEFAULT_API_BASE = import.meta.env.DEV
  ? 'http://localhost:8000'
  : 'https://raku-sound.okamei.net'
const EFFECTIVE_API_BASE = RAW_API_BASE || DEFAULT_API_BASE
const API_BASE = EFFECTIVE_API_BASE.endsWith('/')
  ? EFFECTIVE_API_BASE.slice(0, -1)
  : EFFECTIVE_API_BASE

function buildUrl(path) {
  if (!API_BASE) return path
  if (path.startsWith('/')) return `${API_BASE}${path}`
  return `${API_BASE}/${path}`
}

export { buildUrl }
