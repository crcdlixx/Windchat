import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { t } from '../lib/i18n'
import { Wind } from 'lucide-react'
import api from '../lib/api'
import TurnstileWidget from '../components/TurnstileWidget'

export default function RegisterPage() {
  const register = useAuthStore(s => s.register)
  const [form, setForm] = useState({ username: '', password: '', displayName: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [siteKey, setSiteKey] = useState(null)
  const [turnstileToken, setTurnstileToken] = useState('')

  useEffect(() => {
    api.get('/auth/config').then(r => setSiteKey(r.data.turnstile_site_key)).catch(() => {})
  }, [])

  const handleTurnstile = useCallback((token) => setTurnstileToken(token), [])

  const handle = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(form.username, form.password, form.displayName, turnstileToken)
    } catch (err) {
      setError(err.response?.data?.error || t('register_failed'))
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
          <p className="text-wind-400 text-sm mt-1">{t('create_account')}</p>
        </div>

        <form onSubmit={handle} className="bg-wind-900 rounded-2xl p-6 space-y-4 shadow-xl">
          <div>
            <label className="block text-wind-300 text-sm mb-1">{t('username')}</label>
            <input
              className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 outline-none focus:ring-2 ring-wind-500"
              placeholder={t('username_hint')}
              autoComplete="username"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              required pattern="[a-zA-Z0-9_]{3,32}"
            />
          </div>
          <div>
            <label className="block text-wind-300 text-sm mb-1">{t('display_name')}</label>
            <input
              className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 outline-none focus:ring-2 ring-wind-500"
              placeholder={t('display_name_hint')}
              value={form.displayName}
              onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-wind-300 text-sm mb-1">{t('password')}</label>
            <input
              type="password"
              className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 outline-none focus:ring-2 ring-wind-500"
              placeholder={t('new_password_hint')}
              autoComplete="new-password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required minLength={8}
            />
          </div>
          <TurnstileWidget siteKey={siteKey} onToken={handleTurnstile} />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || (siteKey && !turnstileToken)}
            className="w-full bg-wind-600 hover:bg-wind-500 disabled:opacity-50 text-white rounded-lg py-2 font-medium transition-colors"
          >
            {loading ? t('registering') : t('register')}
          </button>
          <p className="text-wind-500 text-xs text-center">{t('key_notice')}</p>
        </form>

        <p className="text-center text-wind-500 text-sm mt-4">
          {t('have_account')}{' '}
          <Link to="/login" className="text-wind-400 hover:text-wind-300">{t('sign_in')}</Link>
        </p>
      </div>
    </div>
  )
}
