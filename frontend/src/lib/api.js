import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
})

let refreshPromise = null
let redirectingToLogin = false

function getStoredAuth() {
  try {
    return JSON.parse(localStorage.getItem('windchat-auth') || '{}')
  } catch {
    return {}
  }
}

function updateStoredTokens(accessToken, refreshToken) {
  const parsed = getStoredAuth()
  if (parsed.state) {
    parsed.state.accessToken = accessToken
    parsed.state.refreshToken = refreshToken
    localStorage.setItem('windchat-auth', JSON.stringify(parsed))
  }
  window.dispatchEvent(new CustomEvent('windchat:auth-tokens', {
    detail: { accessToken, refreshToken },
  }))
}

function clearStoredAuth() {
  localStorage.removeItem('windchat-auth')
  window.dispatchEvent(new CustomEvent('windchat:auth-cleared'))
}

// Attach stored token on startup
const stored = getStoredAuth()
if (stored?.state?.accessToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${stored.state.accessToken}`
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const stored = getStoredAuth()
      const refreshToken = stored?.state?.refreshToken
      if (!refreshToken) throw new Error('no refresh token')

      const res = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken })
      const { accessToken, refreshToken: newRefresh } = res.data
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
      updateStoredTokens(accessToken, newRefresh)
      return accessToken
    })().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

// Refresh interceptor
api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    if (err.response?.status === 403 && original && !original._retry) {
      original._retry = true
      try {
        const accessToken = await refreshAccessToken()
        original.headers['Authorization'] = `Bearer ${accessToken}`
        return api(original)
      } catch {
        clearStoredAuth()
        if (!redirectingToLogin) {
          redirectingToLogin = true
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(err)
  }
)

export default api
