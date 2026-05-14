import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../lib/api'
import {
  createAndStoreSignalIdentity,
  exportKeyBundle,
  generateIdentityKeys,
  hasLocalSignalIdentity,
} from '../lib/crypto'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      async login(username, password, turnstileToken) {
        const body = { username, password }
        if (turnstileToken) body.turnstile_token = turnstileToken
        const res = await api.post('/auth/login', body)
        if (res.data.requires_totp) {
          return { requires_totp: true, challenge_token: res.data.challenge_token }
        }
        const { accessToken, refreshToken, user } = res.data
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
        set({ accessToken, refreshToken, user })
        await get().ensureSignalIdentity()
        return user
      },

      async completeTotpChallenge(challengeToken, totpCode) {
        const res = await api.post('/auth/totp-challenge', {
          challenge_token: challengeToken,
          totp_code: totpCode,
        })
        const { accessToken, refreshToken, user } = res.data
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
        set({ accessToken, refreshToken, user })
        await get().ensureSignalIdentity()
        return user
      },

      async register(username, password, displayName, turnstileToken) {
        const { identityKeyPair, registrationId, signedPreKey, oneTimePrekeys } = await generateIdentityKeys()
        const bundle = await exportKeyBundle(identityKeyPair, registrationId, signedPreKey, oneTimePrekeys)
        const body = {
          username,
          password,
          display_name: displayName || username,
          identity_key: bundle.identity_key,
          signed_prekey: bundle.signed_prekey,
          one_time_prekeys: bundle.one_time_prekeys,
        }
        if (turnstileToken) body.turnstile_token = turnstileToken
        const res = await api.post('/auth/register', body)
        const { accessToken, refreshToken, user } = res.data
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`

        // Store private keys locally (never leaves device)
        localStorage.setItem(`wc_identity_${user.id}`, JSON.stringify(bundle.local_private))
        set({ accessToken, refreshToken, user })
        return user
      },

      async refresh() {
        const { refreshToken } = get()
        if (!refreshToken) throw new Error('No refresh token')
        const res = await api.post('/auth/refresh', { refreshToken })
        const { accessToken: newAccess, refreshToken: newRefresh } = res.data
        api.defaults.headers.common['Authorization'] = `Bearer ${newAccess}`
        set({ accessToken: newAccess, refreshToken: newRefresh })
        return newAccess
      },

      async logout() {
        const { refreshToken } = get()
        try { await api.post('/auth/logout', { refreshToken }) } catch {}
        delete api.defaults.headers.common['Authorization']
        set({ accessToken: null, refreshToken: null, user: null })
      },

      setUser(user) { set({ user }) },

      async ensureSignalIdentity() {
        const { user } = get()
        if (!user?.id) throw new Error('Not signed in')
        if (hasLocalSignalIdentity(user.id)) {
          try {
            const status = await api.get('/keys/me/status')
            if (status.data?.complete) return
          } catch {}
        }

        const bundle = await createAndStoreSignalIdentity(user.id)
        await api.put('/keys/identity', {
          identity_key: bundle.identity_key,
          signed_prekey: bundle.signed_prekey,
          one_time_prekeys: bundle.one_time_prekeys,
        })
      },

      async loadProfile() {
        const res = await api.get('/users/me')
        set({ user: res.data })
        return res.data
      },
    }),
    {
      name: 'windchat-auth',
      partialize: s => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: s.user }),
    }
  )
)

if (typeof window !== 'undefined') {
  window.addEventListener('windchat:auth-tokens', (event) => {
    const { accessToken, refreshToken } = event.detail || {}
    if (!accessToken || !refreshToken) return
    useAuthStore.setState({ accessToken, refreshToken })
  })

  window.addEventListener('windchat:auth-cleared', () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null })
  })
}
