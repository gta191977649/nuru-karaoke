import { buildUrl } from './api.js'

async function login(usernameOrEmail, password) {
  const response = await fetch(buildUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username_or_email: usernameOrEmail, password }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || 'Login failed')
  }
  return response.json()
}

async function register(username, email, password) {
  const response = await fetch(buildUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, email, password }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || 'Register failed')
  }
  return response.json()
}

async function refreshToken() {
  const response = await fetch(buildUrl('/api/auth/refresh'), {
    method: 'POST',
    credentials: 'include',
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || 'Refresh failed')
  }
  return response.json()
}

async function logout() {
  await fetch(buildUrl('/api/auth/logout'), {
    method: 'POST',
    credentials: 'include',
  })
}

async function fetchMe(accessToken) {
  const response = await fetch(buildUrl('/api/user/me'), {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || 'Failed to load user')
  }
  return response.json()
}

export { login, register, refreshToken, logout, fetchMe }
