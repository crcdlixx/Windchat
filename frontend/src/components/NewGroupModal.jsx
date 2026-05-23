import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChatStore } from '../stores/chatStore'
import { useAuthStore } from '../stores/authStore'
import { t } from '../lib/i18n'
import api from '../lib/api'
import { getOrCreateGroupKey, storeGroupKey } from '../lib/crypto'
import { X, Lock, Globe, Eye } from 'lucide-react'

export default function NewGroupModal({ onClose }) {
  const navigate = useNavigate()
  const loadGroups = useChatStore(s => s.loadGroups)
  const backupVault = useAuthStore(s => s.backupVault)
  const [form, setForm] = useState({
    name: '', description: '', type: 'private',
    password: '', is_temporary: false, duration_hours: 24,
    message_ttl_seconds: 3600,
  })
  const [error, setError] = useState('')
  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    try {
      const res = await api.post('/groups', form)
      const groupKey = await getOrCreateGroupKey(res.data.id)
      storeGroupKey(res.data.id, groupKey)
      await backupVault()
      await loadGroups()
      navigate(`/chat/group/${res.data.id}#key=${encodeURIComponent(groupKey)}`)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || t('error'))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-wind-900 rounded-2xl w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <div className="flex items-center justify-between p-4 border-b border-wind-800 sticky top-0 bg-wind-900">
          <h2 className="text-wind-100 font-semibold">{t('create_group')}</h2>
          <button onClick={onClose} className="text-wind-500 hover:text-wind-300"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-wind-400 text-xs mb-1 block">{t('group_name_required')}</label>
            <input
              className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
              placeholder={t('group_name')}
              value={form.name}
              onChange={e => f('name', e.target.value)}
              required maxLength={128}
            />
          </div>
          <div>
            <label className="text-wind-400 text-xs mb-1 block">{t('description')}</label>
            <input
              className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
              placeholder={t('description_optional')}
              value={form.description}
              onChange={e => f('description', e.target.value)}
            />
          </div>

          <div>
            <label className="text-wind-400 text-xs mb-1 block">{t('visibility')}</label>
            <div className="grid grid-cols-3 gap-1">
              {[
                { value: 'private',  label: t('private'),            icon: <Eye   size={12} /> },
                { value: 'public',   label: t('public'),             icon: <Globe size={12} /> },
                { value: 'password', label: t('password_protected'), icon: <Lock  size={12} /> },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => f('type', opt.value)}
                  className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs transition-colors
                    ${form.type === opt.value ? 'bg-wind-600 text-white' : 'bg-wind-800 text-wind-400 hover:bg-wind-700'}`}
                >
                  {opt.icon}{opt.label}
                </button>
              ))}
            </div>
          </div>

          {form.type === 'password' && (
            <div>
              <label className="text-wind-400 text-xs mb-1 block">{t('group_password')}</label>
              <input
                type="password"
                className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
                value={form.password}
                onChange={e => f('password', e.target.value)}
                required
              />
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-wind-500"
              checked={form.is_temporary}
              onChange={e => f('is_temporary', e.target.checked)}
            />
            <span className="text-wind-300 text-sm">{t('temporary_group')}</span>
          </label>

          {form.is_temporary && (
            <div>
              <label className="text-wind-400 text-xs mb-1 block">{t('expires_hours')}</label>
              <input
                type="number"
                className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
                min={1} max={720}
                value={form.duration_hours}
                onChange={e => f('duration_hours', parseInt(e.target.value))}
              />
            </div>
          )}

          <div>
            <label className="text-wind-400 text-xs mb-1 block">{t('message_ttl')}</label>
            <select
              className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
              value={form.message_ttl_seconds}
              onChange={e => f('message_ttl_seconds', parseInt(e.target.value))}
            >
              {[300, 1800, 3600, 21600, 86400].map(v => (
                <option key={v} value={v}>{t(`ttl_${v === 300 ? '5m' : v === 1800 ? '30m' : v === 3600 ? '1h' : v === 21600 ? '6h' : '24h'}`)}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-wind-600 hover:bg-wind-500 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            {t('create_group_btn')}
          </button>
        </form>
      </div>
    </div>
  )
}
