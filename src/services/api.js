const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const API_BASE = RAW_API_BASE.endsWith('/') ? RAW_API_BASE.slice(0, -1) : RAW_API_BASE

function buildUrl(path) {
  if (!API_BASE) return path
  if (path.startsWith('/')) return `${API_BASE}${path}`
  return `${API_BASE}/${path}`
}

export { buildUrl }
