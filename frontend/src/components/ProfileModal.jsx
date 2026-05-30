import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { t } from '../lib/i18n'
import { X, KeyRound, Mail, Smartphone, Upload, UserRound, ImageOff } from 'lucide-react'
import api from '../lib/api'
import Avatar from './Avatar'

function ProfileSection({ profile, setProfile }) {
  const updateProfile = useAuthStore(s => s.updateProfile)
  const [form, setForm] = useState({ display_name: '', avatar_url: '' })
  const [file, setFile] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    setForm({
      display_name: profile?.display_name || '',
      avatar_url: profile?.avatar_url || '',
    })
  }, [profile?.display_name, profile?.avatar_url])

  const applyProfile = (nextProfile) => {
    setProfile(nextProfile)
    updateProfile(nextProfile)
  }

  const saveProfile = async () => {
    setMsg('')
    setErr('')
    setSaving(true)
    try {
      const res = await api.patch('/users/me', {
        display_name: form.display_name,
        avatar_url: form.avatar_url,
      })
      applyProfile(res.data)
      setMsg(t('profile_saved'))
    } catch (e) {
      setErr(e.response?.data?.error || t('error'))
    }
    setSaving(false)
  }

  const uploadAvatar = async () => {
    if (!file) return
    setMsg('')
    setErr('')
    setUploading(true)
    try {
      const body = new FormData()
      body.append('avatar', file)
      const res = await api.post('/users/me/avatar', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      applyProfile(res.data)
      setForm(s => ({ ...s, avatar_url: res.data.avatar_url || '' }))
      setFile(null)
      setMsg(t('avatar_uploaded'))
    } catch (e) {
      setErr(e.response?.data?.error || t('error'))
    }
    setUploading(false)
  }

  const clearAvatar = async () => {
    setForm(s => ({ ...s, avatar_url: '' }))
    setMsg('')
    setErr('')
    try {
      const res = await api.patch('/users/me', {
        display_name: form.display_name,
        avatar_url: '',
      })
      applyProfile(res.data)
      setMsg(t('profile_saved'))
    } catch (e) {
      setErr(e.response?.data?.error || t('error'))
    }
  }

  const displayName = form.display_name || profile?.username || ''

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-wind-300 text-sm font-medium">
        <UserRound size={14} />
        {t('profile_settings')}
      </div>

      <div className="flex items-center gap-3">
        <Avatar src={form.avatar_url} name={displayName} className="w-14 h-14" textClassName="text-lg" />
        <div className="min-w-0">
          <div className="text-wind-100 text-sm font-medium truncate">{displayName || profile?.username}</div>
          <div className="text-wind-500 text-xs truncate">@{profile?.username}</div>
        </div>
      </div>

      <div>
        <label className="text-wind-400 text-xs mb-1 block">{t('display_name_label')}</label>
        <input
          className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
          value={form.display_name}
          onChange={e => setForm(s => ({ ...s, display_name: e.target.value }))}
          maxLength={64}
        />
      </div>

      <div>
        <label className="text-wind-400 text-xs mb-1 block">{t('avatar_url')}</label>
        <input
          className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
          value={form.avatar_url}
          onChange={e => setForm(s => ({ ...s, avatar_url: e.target.value }))}
          placeholder="https://example.com/avatar.png"
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="flex-1 flex items-center gap-2 bg-wind-800 hover:bg-wind-700 text-wind-300 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors min-w-0">
          <Upload size={14} className="shrink-0" />
          <span className="truncate">{file ? file.name : t('choose_avatar')}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={e => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <button
          onClick={uploadAvatar}
          disabled={!file || uploading}
          className="bg-wind-600 hover:bg-wind-500 disabled:opacity-40 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        >
          {uploading ? t('loading') : t('upload')}
        </button>
      </div>

      {err && <div className="text-red-400 text-xs">{err}</div>}
      {msg && <div className="text-green-400 text-xs">{msg}</div>}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={saveProfile}
          disabled={saving}
          className="bg-wind-600 hover:bg-wind-500 disabled:opacity-40 text-white rounded-lg py-2 text-sm font-medium transition-colors"
        >
          {saving ? t('saving') : t('save_profile')}
        </button>
        <button
          onClick={clearAvatar}
          className="flex items-center justify-center gap-1.5 bg-wind-800 hover:bg-wind-700 text-wind-300 rounded-lg py-2 text-sm font-medium transition-colors"
        >
          <ImageOff size={14} />
          {t('clear_avatar')}
        </button>
      </div>
    </div>
  )
}

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

  useEffect(() => {
    api.get('/users/me').then(r => setProfile(r.data)).catch(() => {})
  }, [])

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
            <Avatar src={display.avatar_url} name={display.display_name || display.username} className="w-12 h-12" textClassName="text-lg" />
            <div className="min-w-0">
              <div className="text-wind-100 font-medium truncate">{display.display_name || display.username}</div>
              <div className="text-wind-500 text-xs truncate">@{display.username} · {display.role}</div>
            </div>
          </div>

          <ProfileSection profile={display} setProfile={setProfile} />

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
