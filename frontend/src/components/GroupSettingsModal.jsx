import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useClickOutside } from '../lib/hooks'
import { t } from '../lib/i18n'
import { getOrCreateGroupKey } from '../lib/crypto'
import { X, Trash2, VolumeX, UserMinus, UserPlus, Search, QrCode, Download } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import Avatar from './Avatar'

export default function GroupSettingsModal({ groupId, onClose }) {
  const user = useAuthStore(s => s.user)
  const loadGroups = useChatStore(s => s.loadGroups)
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [tab, setTab] = useState('info')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({})

  // 邀请搜索状态
  const [inviteQuery, setInviteQuery] = useState('')
  const [inviteResults, setInviteResults] = useState([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [invitedIds, setInvitedIds] = useState(new Set())
  const [joinUrl, setJoinUrl] = useState(`${window.location.origin}/join/group/${groupId}`)

  const closeModal = useCallback(onClose, [onClose])
  const modalRef = useClickOutside(closeModal)

  const downloadQR = () => {
    const canvas = document.querySelector('#group-qr-canvas')
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `windchat-group-${groupId}.png`
    a.click()
  }

  useEffect(() => {
    api.get(`/groups/${groupId}`).then(r => {
      setGroup(r.data)
      setForm({ name: r.data.name, description: r.data.description, type: r.data.type, message_ttl_seconds: r.data.message_ttl_seconds })
    })
    api.get(`/groups/${groupId}/members`).then(r => setMembers(r.data))
    getOrCreateGroupKey(groupId).then(key => {
      setJoinUrl(`${window.location.origin}/join/group/${groupId}#key=${encodeURIComponent(key)}`)
    }).catch(() => {})
  }, [groupId])

  const myRole = members.find(m => m.id === user?.id)?.role
  const memberIds = new Set(members.map(m => m.id))

  // 搜索用户（防抖）
  useEffect(() => {
    if (inviteQuery.length < 2) { setInviteResults([]); return }
    const t2 = setTimeout(async () => {
      setInviteLoading(true)
      try {
        const res = await api.get('/users/search', { params: { q: inviteQuery } })
        // 过滤掉已是成员的用户
        setInviteResults(res.data.filter(u => !memberIds.has(u.id)))
      } catch {}
      setInviteLoading(false)
    }, 300)
    return () => clearTimeout(t2)
  }, [inviteQuery, members])

  const handleInvite = async (userId) => {
    try {
      await api.post(`/groups/${groupId}/invite`, { user_id: userId })
      setInvitedIds(s => new Set([...s, userId]))
      // 刷新成员列表
      const res = await api.get(`/groups/${groupId}/members`)
      setMembers(res.data)
      setInviteResults(prev => prev.filter(u => u.id !== userId))
    } catch (err) {
      alert(err.response?.data?.error || t('error'))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try { await api.patch(`/groups/${groupId}`, form); await loadGroups(); onClose() } catch {}
    setSaving(false)
  }

  const handleDissolve = async () => {
    if (!confirm(t('dissolve_confirm'))) return
    await api.delete(`/groups/${groupId}`)
    await loadGroups(); navigate('/'); onClose()
  }

  const handleClearMessages = async () => {
    if (!confirm(t('clear_messages_confirm'))) return
    await api.delete(`/groups/${groupId}/messages`)
  }

  const handleKick = async (userId) => {
    await api.delete(`/groups/${groupId}/members/${userId}`)
    setMembers(m => m.filter(x => x.id !== userId))
  }

  const handleMute = async (userId) => {
    await api.post(`/groups/${groupId}/members/${userId}/mute`, { duration_minutes: 60 })
    setMembers(m => m.map(x => x.id === userId ? { ...x, is_muted: true } : x))
  }

  const roleLabel = (r) => r === 'owner' ? t('owner') : r === 'moderator' ? t('moderator') : t('member')

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div ref={modalRef} className="bg-wind-900 rounded-2xl w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-wind-800 shrink-0">
          <h2 className="text-wind-100 font-semibold">{group?.name || t('group_settings')}</h2>
          <button onClick={onClose} className="text-wind-500 hover:text-wind-300"><X size={18} /></button>
        </div>

        {/* Tab 切换 */}
        <div className="flex px-4 gap-2 pt-2 shrink-0">
          {[
            { key: 'info',    label: t('info') },
            { key: 'members', label: `${t('members')}${members.length ? ` (${members.length})` : ''}` },
            { key: 'invite',  label: t('invite') },
          ].map(tb => (
            <button key={tb.key} onClick={() => setTab(tb.key)}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${tab === tb.key ? 'bg-wind-700 text-wind-100' : 'text-wind-400 hover:text-wind-200'}`}
            >{tb.label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4">

          {/* ── 信息 tab ── */}
          {tab === 'info' && (
            <div className="space-y-3">
              <div>
                <label className="text-wind-400 text-xs mb-1 block">{t('group_name')}</label>
                <input
                  className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500"
                  value={form.name || ''}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  disabled={myRole !== 'owner'}
                />
              </div>
              <div>
                <label className="text-wind-400 text-xs mb-1 block">{t('description')}</label>
                <textarea
                  className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500 resize-none"
                  rows={2} value={form.description || ''}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  disabled={myRole !== 'owner'}
                />
              </div>
              {/* 二维码 - 公开/密码群组显示 */}
              {(group?.type === 'public' || group?.type === 'password') && (
                <div className="bg-wind-800/50 rounded-xl p-4 flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 text-wind-300 text-sm font-medium">
                    <QrCode size={14} />
                    {t('qrcode_title')}
                  </div>
                  <div className="bg-wind-950 rounded-xl p-3">
                    <QRCodeCanvas
                      id="group-qr-canvas"
                      value={joinUrl}
                      size={160}
                      bgColor="#172554"
                      fgColor="#60a5fa"
                      level="M"
                      marginSize={2}
                    />
                  </div>
                  <p className="text-wind-500 text-xs">{t('qrcode_hint')}</p>
                  <button onClick={downloadQR}
                    className="flex items-center gap-1.5 text-xs text-wind-300 hover:text-wind-100 bg-wind-800 hover:bg-wind-700 px-3 py-1.5 rounded-lg transition-colors">
                    <Download size={12} />
                    {t('download_qrcode')}
                  </button>
                </div>
              )}
              {myRole === 'owner' && (
                <>
                  <div>
                    <label className="text-wind-400 text-xs mb-1 block">{t('visibility')}</label>
                    <select className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm"
                      value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                      <option value="private">{t('private')}</option>
                      <option value="public">{t('public')}</option>
                      <option value="password">{t('password_protected')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-wind-400 text-xs mb-1 block">{t('message_ttl')}</label>
                    <select className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm"
                      value={form.message_ttl_seconds}
                      onChange={e => setForm(f => ({ ...f, message_ttl_seconds: parseInt(e.target.value) }))}>
                      {[300, 1800, 3600, 21600, 86400].map(v => (
                        <option key={v} value={v}>{t(`ttl_${v === 300 ? '5m' : v === 1800 ? '30m' : v === 3600 ? '1h' : v === 21600 ? '6h' : '24h'}`)}</option>
                      ))}
                    </select>
                  </div>
                  <button onClick={handleSave} disabled={saving}
                    className="w-full bg-wind-600 hover:bg-wind-500 text-white rounded-lg py-2 text-sm font-medium transition-colors">
                    {saving ? t('saving') : t('save_changes')}
                  </button>
                  <div className="border-t border-wind-800 pt-3 space-y-2">
                    <button onClick={handleClearMessages}
                      className="w-full flex items-center gap-2 justify-center text-orange-400 hover:bg-orange-400/10 rounded-lg py-2 text-sm transition-colors">
                      <Trash2 size={14} />{t('clear_messages')}
                    </button>
                    <button onClick={handleDissolve}
                      className="w-full flex items-center gap-2 justify-center text-red-400 hover:bg-red-400/10 rounded-lg py-2 text-sm transition-colors">
                      <X size={14} />{t('dissolve_group')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── 成员 tab ── */}
          {tab === 'members' && (
            <div className="space-y-1">
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-wind-800">
                  <Avatar src={m.avatar_url} name={m.display_name || m.username} className="w-8 h-8" textClassName="text-sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-wind-200 text-sm truncate">{m.display_name || m.username}</div>
                    <div className="text-wind-500 text-xs">{roleLabel(m.role)}{m.is_muted ? ` · ${t('muted')}` : ''}</div>
                  </div>
                  {(myRole === 'owner' || myRole === 'moderator') && m.id !== user?.id && m.role !== 'owner' && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => handleMute(m.id)} className="p-1 text-wind-600 hover:text-orange-400" title={t('mute_1h')}>
                        <VolumeX size={13} />
                      </button>
                      <button onClick={() => handleKick(m.id)} className="p-1 text-wind-600 hover:text-red-400" title={t('kick')}>
                        <UserMinus size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── 邀请 tab ── */}
          {tab === 'invite' && (
            <div>
              {myRole !== 'owner' && myRole !== 'moderator' ? (
                <div className="text-center text-wind-600 text-sm py-8">{t('no_permission')}</div>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-wind-800 rounded-lg px-3 py-2 mb-3">
                    <Search size={13} className="text-wind-500 shrink-0" />
                    <input
                      className="bg-transparent text-wind-200 text-sm outline-none flex-1 placeholder-wind-600"
                      placeholder={t('search_users')}
                      value={inviteQuery}
                      onChange={e => setInviteQuery(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1">
                    {inviteLoading && (
                      <div className="text-center text-wind-500 text-sm py-3">{t('loading')}</div>
                    )}
                    {!inviteLoading && inviteQuery.length >= 2 && inviteResults.length === 0 && (
                      <div className="text-center text-wind-600 text-sm py-3">{t('no_result')}</div>
                    )}
                    {!inviteLoading && inviteQuery.length < 2 && (
                      <div className="text-center text-wind-500 text-xs py-4">{t('search_users')}</div>
                    )}
                    {inviteResults.map(u => (
                      <div key={u.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-wind-800">
                        <Avatar src={u.avatar_url} name={u.display_name || u.username} className="w-8 h-8" textClassName="text-sm" />
                        <div className="flex-1 min-w-0">
                          <div className="text-wind-200 text-sm truncate">{u.display_name || u.username}</div>
                          <div className="text-wind-500 text-xs">@{u.username}</div>
                        </div>
                        <button
                          onClick={() => handleInvite(u.id)}
                          disabled={invitedIds.has(u.id)}
                          className="flex items-center gap-1 text-xs bg-wind-600 hover:bg-wind-500 disabled:opacity-50 disabled:cursor-default text-white px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
                        >
                          <UserPlus size={12} />
                          {invitedIds.has(u.id) ? t('invited') : t('invite')}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
