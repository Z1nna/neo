const AUTH_API_BASE = '/api/v1/auth'
const AUTH_STORAGE_KEY = 'neomarket-auth-session'

function parseJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function request(path, { method = 'GET', body, headers = {} } = {}) {
  return fetch(`${AUTH_API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (response) => {
    if (response.status === 204) return null

    const contentType = response.headers.get('content-type') || ''
    const payload = contentType.includes('application/json') ? await response.json() : null

    if (!response.ok) {
      throw new Error(payload?.message || payload?.detail || `Request failed with status ${response.status}`)
    }

    return payload
  })
}

export function getAuthSession() {
  return parseJson(localStorage.getItem(AUTH_STORAGE_KEY), null)
}

export function isAuthenticated() {
  return Boolean(getAuthSession()?.accessToken)
}

function saveAuthSession(payload) {
  const session = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type || 'Bearer',
    user: payload.user,
  }

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  if (payload.user?.id) {
    localStorage.setItem('b2b-seller-id', payload.user.id)
  }
  return session
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

export function buildApiHeaders() {
  const session = getAuthSession()
  if (!session?.accessToken) {
    return {}
  }

  return {
    Authorization: `${session.tokenType || 'Bearer'} ${session.accessToken}`,
    'X-User-Id': session.user?.id,
    'X-Seller-Id': session.user?.id,
  }
}

export function register(payload) {
  return request('/register/', {
    method: 'POST',
    body: payload,
  }).then(saveAuthSession)
}

export function login(payload) {
  return request('/login/', {
    method: 'POST',
    body: payload,
  }).then(saveAuthSession)
}

export function fetchMe() {
  return request('/me/', {
    headers: buildApiHeaders(),
  }).then((user) => {
    const current = getAuthSession()
    if (current) {
      saveAuthSession({
        access_token: current.accessToken,
        refresh_token: current.refreshToken,
        token_type: current.tokenType,
        user,
      })
    }
    return user
  })
}

export function updateMe(payload) {
  return request('/me/', {
    method: 'PATCH',
    body: payload,
    headers: buildApiHeaders(),
  }).then((user) => {
    const current = getAuthSession()
    if (current) {
      saveAuthSession({
        access_token: current.accessToken,
        refresh_token: current.refreshToken,
        token_type: current.tokenType,
        user,
      })
    }
    return user
  })
}
