import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { t } from '../lib/i18n'
import { Wind } from 'lucide-react'
import api from '../lib/api'
import TurnstileWidget from '../components/TurnstileWidget'

export default function LoginPage() {
  const login = useAuthStore(s => s.login)
  const completeTotpChallenge = useAuthStore(s => s.completeTotpChallenge)
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [siteKey, setSiteKey] = useState(null)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [totpChallenge, setTotpChallenge] = useState(null) // { challenge_token }
  const [totpCode, setTotpCode] = useState('')

  useEffect(() => {
    api.get('/auth/config').then(r => setSiteKey(r.data.turnstile_site_key)).catch(() => {})
  }, [])

  const handleTurnstile = useCallback((token) => setTurnstileToken(token), [])

  const handle = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(form.username, form.password, turnstileToken)
      if (result?.requires_totp) {
        setTotpChallenge({ challenge_token: result.challenge_token })
      }
    } catch (err) {
      setError(err.response?.data?.error || t('login_failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleTotp = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await completeTotpChallenge(totpChallenge.challenge_token, totpCode, form.password)
    } catch (err) {
      setError(err.response?.data?.error || t('login_failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-wind-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-wind-600 flex items-center justify-center mb-3">
            <Wind size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-wind-100">{t('app_name')}</h1>
          <p className="text-wind-400 text-sm mt-1">{t('tagline')}</p>
        </div>

        {totpChallenge ? (
          <form onSubmit={handleTotp} className="bg-wind-900 rounded-2xl p-6 space-y-4 shadow-xl">
            <p className="text-wind-300 text-sm">{t('totp_required')}</p>
            <div>
              <label className="block text-wind-300 text-sm mb-1">{t('totp_code')}</label>
              <input
                className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 outline-none focus:ring-2 ring-wind-500 placeholder-wind-600 tracking-widest text-center text-lg"
                placeholder="000000"
                maxLength={6}
                autoComplete="one-time-code"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full bg-wind-600 hover:bg-wind-500 disabled:opacity-50 text-white rounded-lg py-2 font-medium transition-colors"
            >
              {loading ? t('signing_in') : t('verify')}
            </button>
            <button type="button" onClick={() => setTotpChallenge(null)} className="w-full text-wind-500 text-sm hover:text-wind-400">
              ← {t('sign_in')}
            </button>
          </form>
        ) : (
          <form onSubmit={handle} className="bg-wind-900 rounded-2xl p-6 space-y-4 shadow-xl">
            <div>
              <label className="block text-wind-300 text-sm mb-1">{t('username')}</label>
              <input
                className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 outline-none focus:ring-2 ring-wind-500 placeholder-wind-600"
                placeholder={t('username_hint')}
                autoComplete="username"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-wind-300 text-sm mb-1">{t('password')}</label>
              <input
                type="password"
                className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 outline-none focus:ring-2 ring-wind-500 placeholder-wind-600"
                placeholder="••••••••"
                autoComplete="current-password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
              />
            </div>
            <TurnstileWidget siteKey={siteKey} onToken={handleTurnstile} />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || (siteKey && !turnstileToken)}
              className="w-full bg-wind-600 hover:bg-wind-500 disabled:opacity-50 text-white rounded-lg py-2 font-medium transition-colors"
            >
              {loading ? t('signing_in') : t('sign_in')}
            </button>
          </form>
        )}

        <p className="text-center text-wind-500 text-sm mt-4">
          {t('no_account')}{' '}
          <Link to="/register" className="text-wind-400 hover:text-wind-300">{t('register')}</Link>
        </p>
      </div>
    </div>
  )
}
