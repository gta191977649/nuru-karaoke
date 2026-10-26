export function waitForPlayback(promise, timeoutMs, message) {
  let timer
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs)
  })]).finally(() => clearTimeout(timer))
}

export async function fetchPlaybackResource(url, timeoutMs = 30000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    // Consume the body inside the deadline too; headers alone are insufficient.
    return await response.arrayBuffer()
  } catch (error) {
    if (controller.signal.aborted) throw new Error('曲の読み込みがタイムアウトしました。もう一度お試しください。')
    throw error
  } finally { clearTimeout(timer) }
}
