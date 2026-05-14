import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { t } from '../lib/i18n'
import { X, KeyRound, Mail, Smartphone } from 'lucide-react'
import api from '../lib/api'

function PasswordSection() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const handleChange = async () => {
    setMsg(''); setErr('')
    if (form.next !== form.confirm) { setErr(t('password_mismatch')); return }
    try {
      await api.patch('/users/me/password', { current_password: form.current, new_password: form.next })
      setMsg(t('password_changed'))
      setTimeout(() => {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }, 1500)
    } catch (e) {
      setErr(e.response?.data?.error || t('error'))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-wind-300 text-sm font-medium">
        <KeyRound size={14} />
        {t('change_password')}
      </div>
      {[
        { key: 'current', label: t('current_password'), type: 'password' },
        { key: 'next', label: t('new_password'), type: 'password' },
        { key: 'confirm', label: t('confirm_password'), type: 'password' },
      ].map(f => (
        <div key={f.key}>
          <label className="text-wind-400 text-xs mb-1 block">{f.label}</label>
          <input
            type={f.type}
            className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
            value={form[f.key]}
            onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
          />
        </div>
      ))}
      {err && <div className="text-red-400 text-xs">{err}</div>}
      {msg && <div className="text-green-400 text-xs">{msg}</div>}
      <button
        onClick={handleChange}
        disabled={!form.current || !form.next || !form.confirm}
        className="w-full bg-wind-600 hover:bg-wind-500 disabled:opacity-40 text-white rounded-lg py-2 text-sm font-medium transition-colors"
      >
        {t('confirm')}
      </button>
    </div>
  )
}

function EmailSection({ user }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState(0)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [sending, setSending] = useState(false)

  const sendCode = async () => {
    setErr(''); setSending(true)
    try {
      await api.post('/auth/send-verification', { email })
      setStep(1)
      setMsg(t('code_sent'))
    } catch (e) {
      setErr(e.response?.data?.error || t('error'))
    }
    setSending(false)
  }

  const verify = async () => {
    setErr('')
    try {
      await api.post('/auth/verify-email', { code })
      setMsg(t('verified'))
      useAuthStore.getState().loadProfile()
    } catch (e) {
      setErr(e.response?.data?.error || t('error'))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-wind-300 text-sm font-medium">
        <Mail size={14} />
        {t('bind_email')}
      </div>
      {user.email_verified && (
        <div className="text-wind-400 text-xs">{user.email} — <span className="text-green-400">{t('verified')}</span></div>
      )}
      {step === 0 ? (
        <>
          <input
            type="email"
            className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
            placeholder={t('email_placeholder')}
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <button
            onClick={sendCode}
            disabled={!email || sending}
            className="w-full bg-wind-600 hover:bg-wind-500 disabled:opacity-40 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            {sending ? t('loading') : t('send_code')}
          </button>
        </>
      ) : (
        <>
          {msg && <div className="text-green-400 text-xs">{msg}</div>}
          <input
            type="text"
            className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
            placeholder={t('enter_totp_code')}
            value={code}
            onChange={e => setCode(e.target.value)}
            maxLength={6}
          />
          <button
            onClick={verify}
            disabled={code.length < 6}
            className="w-full bg-wind-600 hover:bg-wind-500 disabled:opacity-40 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            {t('verify')}
          </button>
        </>
      )}
      {err && <div className="text-red-400 text-xs">{err}</div>}
    </div>
  )
}

function TotpSection({ user }) {
  const [step, setStep] = useState(null)
  const [qrUri, setQrUri] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [disableForm, setDisableForm] = useState({ password: '', code: '' })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const setup = async () => {
    setErr('')
    try {
      const res = await api.post('/auth/totp/setup')
      setQrUri(res.data.uri)
      setSecret(res.data.secret)
      setStep('setup')
    } catch (e) {
      setErr(e.response?.data?.error || t('error'))
    }
  }

  const confirm = async () => {
    setErr('')
    try {
      await api.post('/auth/totp/verify', { code })
      setMsg(t('totp_enabled'))
      setStep(null)
      useAuthStore.getState().loadProfile()
    } catch (e) {
      setErr(e.response?.data?.error || t('error'))
    }
  }

  const disable = async () => {
    setErr('')
    try {
      await api.post('/auth/totp/disable', { password: disableForm.password, code: disableForm.code })
      setMsg(t('totp_disabled'))
      setStep(null)
      useAuthStore.getState().loadProfile()
    } catch (e) {
      setErr(e.response?.data?.error || t('error'))
    }
  }

  // Dynamic import for QR code (qrcode.react already installed)
  const [QRCode, setQRCode] = useState(null)
  if (!QRCode) {
    import('qrcode.react').then(m => setQRCode(() => m.QRCodeSVG))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-wind-300 text-sm font-medium">
        <Smartphone size={14} />
        {t('totp_section')}
      </div>
      <div className="text-wind-400 text-xs">
        {user.totp_enabled ? <span className="text-green-400">{t('totp_enabled')}</span> : t('totp_disabled')}
      </div>

      {!user.totp_enabled && step !== 'setup' && (
        <button onClick={setup} className="w-full bg-wind-600 hover:bg-wind-500 text-white rounded-lg py-2 text-sm font-medium transition-colors">
          {t('enable_totp')}
        </button>
      )}

      {step === 'setup' && (
        <div className="space-y-3">
          <div className="text-wind-400 text-xs">{t('scan_qr')}</div>
          {QRCode && qrUri && (
            <div className="bg-white rounded-xl p-3 w-fit mx-auto">
              <QRCode value={qrUri} size={160} />
            </div>
          )}
          <div className="text-wind-600 text-xs font-mono break-all">{secret}</div>
          <input
            type="text"
            className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
            placeholder={t('enter_totp_code')}
            value={code}
            onChange={e => setCode(e.target.value)}
            maxLength={6}
          />
          <button
            onClick={confirm}
            disabled={code.length < 6}
            className="w-full bg-wind-600 hover:bg-wind-500 disabled:opacity-40 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            {t('verify')}
          </button>
        </div>
      )}

      {user.totp_enabled && step !== 'disable' && (
        <button onClick={() => setStep('disable')} className="w-full bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg py-2 text-sm font-medium transition-colors">
          {t('disable_totp')}
        </button>
      )}

      {step === 'disable' && (
        <div className="space-y-3">
          <input
            type="password"
            className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
            placeholder={t('current_password')}
            value={disableForm.password}
            onChange={e => setDisableForm(s => ({ ...s, password: e.target.value }))}
          />
          <input
            type="text"
            className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
            placeholder={t('enter_totp_code')}
            value={disableForm.code}
            onChange={e => setDisableForm(s => ({ ...s, code: e.target.value }))}
            maxLength={6}
          />
          <button
            onClick={disable}
            disabled={!disableForm.password || disableForm.code.length < 6}
            className="w-full bg-red-900/30 hover:bg-red-900/50 disabled:opacity-40 text-red-400 rounded-lg py-2 text-sm font-medium transition-colors"
          >
            {t('confirm')}
          </button>
        </div>
      )}

      {msg && <div className="text-green-400 text-xs">{msg}</div>}
      {err && <div className="text-red-400 text-xs">{err}</div>}
    </div>
  )
}

export default function ProfileModal({ onClose }) {
  const user = useAuthStore(s => s.user)
  const [profile, setProfile] = useState(null)

  useState(() => {
    api.get('/users/me').then(r => setProfile(r.data)).catch(() => {})
  })

  const display = profile || user || {}

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-wind-900 rounded-2xl w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-wind-800 shrink-0">
          <h2 className="text-wind-100 font-semibold">{t('profile')}</h2>
          <button onClick={onClose} className="text-wind-500 hover:text-wind-300"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-6">
          {/* User info */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-wind-600 flex items-center justify-center text-white text-lg font-bold shrink-0">
              {(display.display_name || display.username || '?')[0].toUpperCase()}
            </div>
            <div>
              <div className="text-wind-100 font-medium">{display.display_name || display.username}</div>
              <div className="text-wind-500 text-xs">@{display.username} · {display.role}</div>
            </div>
          </div>

          <div className="border-t border-wind-800" />
          <PasswordSection />

          <div className="border-t border-wind-800" />
          <EmailSection user={display} />

          <div className="border-t border-wind-800" />
          <TotpSection user={display} />
        </div>
      </div>
    </div>
  )
}
