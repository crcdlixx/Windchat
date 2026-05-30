import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { t } from '../lib/i18n'
import { ShieldCheck, Users, Server, Settings, FileText, UsersRound } from 'lucide-react'
import Avatar from './Avatar'

function AdminStats() {
  const [stats, setStats] = useState(null)
  useEffect(() => { api.get('/admin/stats').then(r => setStats(r.data)) }, [])

  if (!stats) return <div className="p-6 text-wind-500">{t('loading')}</div>

  return (
    <div className="p-6">
      <h2 className="text-wind-100 text-lg font-semibold mb-4">{t('server_overview')}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: t('total_users'), value: stats.users },
          { label: t('active_groups'), value: stats.groups },
          { label: t('active_messages'), value: stats.active_messages },
          { label: t('storage_used'), value: `${(stats.storage_bytes / 1024).toFixed(1)} KB` },
        ].map(s => (
          <div key={s.label} className="bg-wind-800 rounded-xl p-4">
            <div className="text-wind-500 text-xs mb-1">{s.label}</div>
            <div className="text-wind-100 text-2xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>
      <div className={`rounded-xl p-4 ${stats.integrity?.valid ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'}`}>
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className={stats.integrity?.valid ? 'text-green-400' : 'text-red-400'} />
          <span className="text-sm font-medium" style={{ color: stats.integrity?.valid ? '#4ade80' : '#f87171' }}>
            {t('code_integrity')}: {stats.integrity?.valid ? t('integrity_ok') : t('integrity_tampered')}
          </span>
        </div>
        <div className="text-wind-600 text-xs mt-1 font-mono">{stats.integrity?.current}</div>
      </div>
    </div>
  )
}

function AdminUsers() {
  const [users, setUsers] = useState([])
  const [query, setQuery] = useState('')

  const load = (q) => api.get('/admin/users', { params: { q } }).then(r => setUsers(r.data))
  useEffect(() => { load('') }, [])

  const ban = async (id, reason) => {
    await api.post(`/admin/users/${id}/ban`, { reason })
    load(query)
  }
  const unban = async (id) => {
    await api.post(`/admin/users/${id}/unban`)
    load(query)
  }

  return (
    <div className="p-6">
      <h2 className="text-wind-100 text-lg font-semibold mb-4">{t('user_management')}</h2>
      <div className="mb-4">
        <input
          className="bg-wind-800 text-wind-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500 w-full max-w-xs"
          placeholder={t('search_username')}
          value={query}
          onChange={e => { setQuery(e.target.value); load(e.target.value) }}
        />
      </div>
      <div className="space-y-1">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 bg-wind-800 rounded-xl px-4 py-2.5">
            <Avatar src={u.avatar_url} name={u.display_name || u.username} className="w-8 h-8" textClassName="text-sm" />
            <div className="flex-1 min-w-0">
              <div className="text-wind-200 text-sm font-medium">{u.username}</div>
              <div className="text-wind-500 text-xs">{u.role} · {u.is_banned ? `${t('banned')} ${u.ban_reason}` : t('active')}</div>
            </div>
            {u.is_banned ? (
              <button onClick={() => unban(u.id)} className="text-xs text-green-400 hover:bg-green-400/10 px-2 py-1 rounded-lg transition-colors">
                {t('unban')}
              </button>
            ) : (
              <button
                onClick={() => { const r = prompt(t('ban_reason_prompt')); if (r !== null) ban(u.id, r) }}
                className="text-xs text-red-400 hover:bg-red-400/10 px-2 py-1 rounded-lg transition-colors"
              >
                {t('ban')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AdminSettings() {
  const [settings, setSettings] = useState({})
  const [saved, setSaved] = useState(false)

  useEffect(() => { api.get('/admin/settings').then(r => setSettings(r.data)) }, [])

  const save = async () => {
    await api.patch('/admin/settings', settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const f = (k, v) => setSettings(s => ({ ...s, [k]: v }))

  return (
    <div className="p-6 max-w-xl">
      <h2 className="text-wind-100 text-lg font-semibold mb-4">{t('server_settings')}</h2>
      <div className="space-y-4">
        {[
          { key: 'server_name', label: t('server_name'), type: 'text' },
          { key: 'max_file_size_mb', label: t('max_file_size'), type: 'number' },
          { key: 'default_message_ttl_seconds', label: t('default_ttl'), type: 'number' },
          { key: 'max_message_ttl_seconds', label: t('max_ttl'), type: 'number' },
          { key: 'max_storage_kb', label: t('max_storage_kb'), type: 'number' },
        ].map(f2 => (
          <div key={f2.key}>
            <label className="text-wind-400 text-xs mb-1 block">{f2.label}</label>
            <input
              type={f2.type}
              className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
              value={settings[f2.key] || ''}
              onChange={e => f(f2.key, e.target.value)}
            />
          </div>
        ))}

        {[
          { key: 'registration_open', label: t('open_registration') },
          { key: 'maintenance_mode', label: t('maintenance_mode') },
          { key: 'require_email', label: t('require_email') },
          { key: 'require_totp', label: t('require_totp') },
        ].map(tog => (
          <label key={tog.key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-wind-500"
              checked={settings[tog.key] === 'true'}
              onChange={e => f(tog.key, e.target.checked ? 'true' : 'false')}
            />
            <span className="text-wind-300 text-sm">{tog.label}</span>
          </label>
        ))}

        <button
          onClick={save}
          className="w-full bg-wind-600 hover:bg-wind-500 text-white rounded-lg py-2 text-sm font-medium transition-colors"
        >
          {saved ? t('saved') : t('save')}
        </button>
      </div>
    </div>
  )
}

function AdminAudit() {
  const [log, setLog] = useState([])
  useEffect(() => { api.get('/admin/audit').then(r => setLog(r.data)) }, [])
  return (
    <div className="p-6">
      <h2 className="text-wind-100 text-lg font-semibold mb-4">{t('audit_log')}</h2>
      <div className="space-y-1 font-mono text-xs">
        {log.map(e => (
          <div key={e.id} className="flex items-center gap-3 bg-wind-800 rounded-lg px-3 py-2 text-wind-400">
            <span className="text-wind-600 shrink-0">{new Date(e.created_at).toLocaleString()}</span>
            <span className="text-wind-300">{e.actor_username || 'system'}</span>
            <span className="text-wind-500">{e.action}</span>
            <span className="text-wind-600 truncate">{e.target_type}:{e.target_id}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminView() {
  const navClass = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${isActive ? 'bg-wind-700 text-wind-100' : 'text-wind-400 hover:text-wind-200 hover:bg-wind-800'}`

  return (
    <div className="flex h-full">
      <div className="w-48 bg-wind-900 border-r border-wind-800 p-3 space-y-0.5 shrink-0">
        <div className="text-wind-500 text-xs px-3 py-1 mb-2 font-medium">{t('admin')}</div>
        <NavLink to="/admin" end className={navClass}><Server size={14} />{t('server_overview')}</NavLink>
        <NavLink to="/admin/users" className={navClass}><Users size={14} />{t('user_management')}</NavLink>
        <NavLink to="/admin/settings" className={navClass}><Settings size={14} />{t('server_settings')}</NavLink>
        <NavLink to="/admin/audit" className={navClass}><FileText size={14} />{t('audit_log')}</NavLink>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <Routes>
          <Route index element={<AdminStats />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="audit" element={<AdminAudit />} />
        </Routes>
      </div>
    </div>
  )
}
