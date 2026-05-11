const AUTH_API_BASE = '/api/v1/auth'
const AUTH_STORAGE_KEY = 'neomarket-auth-session'
const GUEST_SESSION_KEY = 'neomarket-guest-session-id'

function parseJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function requestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${AUTH_API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (response.status === 204) return null

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    throw new Error(payload?.message || payload?.detail || `Request failed with status ${response.status}`)
  }

  return payload
}

export function getGuestSessionId() {
  let sessionId = localStorage.getItem(GUEST_SESSION_KEY)
  if (!sessionId) {
    sessionId = requestId()
    localStorage.setItem(GUEST_SESSION_KEY, sessionId)
  }
  return sessionId
}

export function getAuthSession() {
  return parseJson(localStorage.getItem(AUTH_STORAGE_KEY), null)
}

export function getAccessToken() {
  return getAuthSession()?.accessToken || null
}

export function getCurrentUser() {
  return getAuthSession()?.user || null
}

export function isAuthenticated() {
  return Boolean(getAccessToken())
}

export function saveAuthSession(payload) {
  const session = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type || 'Bearer',
    user: payload.user,
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  if (payload.user?.id) {
    localStorage.setItem('userId', payload.user.id)
    localStorage.setItem('b2b-seller-id', payload.user.id)
  }
  return session
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

export function buildApiHeaders({ useGuestSession = false } = {}) {
  const session = getAuthSession()
  const headers = {}

  if (session?.accessToken) {
    headers.Authorization = `${session.tokenType || 'Bearer'} ${session.accessToken}`
    if (session.user?.id) {
      headers['X-User-Id'] = session.user.id
      headers['X-Seller-Id'] = session.user.id
    }
  } else if (useGuestSession) {
    headers['X-Session-Id'] = getGuestSessionId()
  }

  return headers
}

export async function register(payload) {
  const data = await request('/register/', { method: 'POST', body: payload })
  return saveAuthSession(data)
}

export async function login(payload) {
  const data = await request('/login/', { method: 'POST', body: payload })
  return saveAuthSession(data)
}

export async function refreshSession() {
  const session = getAuthSession()
  if (!session?.refreshToken) {
    throw new Error('Refresh token is missing')
  }

  const data = await request('/refresh/', {
    method: 'POST',
    body: { refresh_token: session.refreshToken },
  })

  return saveAuthSession({
    ...data,
    user: session.user,
  })
}

export async function fetchMe() {
  const data = await request('/me/', {
    headers: buildApiHeaders(),
  })

  const current = getAuthSession()
  if (current) {
    saveAuthSession({
      access_token: current.accessToken,
      refresh_token: current.refreshToken,
      token_type: current.tokenType,
      user: data,
    })
  }
  return data
}

export async function updateMe(payload) {
  const data = await request('/me/', {
    method: 'PATCH',
    body: payload,
    headers: buildApiHeaders(),
  })

  const current = getAuthSession()
  if (current) {
    saveAuthSession({
      access_token: current.accessToken,
      refresh_token: current.refreshToken,
      token_type: current.tokenType,
      user: data,
    })
  }
  return data
}
