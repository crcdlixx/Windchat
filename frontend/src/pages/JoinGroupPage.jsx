import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { t } from '../lib/i18n'
import api from '../lib/api'

export default function JoinGroupPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const loadGroups = useChatStore(s => s.loadGroups)
  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    api.get(`/groups/${groupId}`)
      .then(r => setGroup(r.data))
      .catch(() => setError(t('no_result')))
      .finally(() => setLoading(false))
  }, [groupId])

  const handleJoin = async () => {
    setJoining(true)
    setError('')
    try {
      await api.post(`/groups/${groupId}/join`, group?.type === 'password' ? { password } : {})
      await loadGroups()
      navigate(`/chat/group/${groupId}`)
    } catch (err) {
      setError(err.response?.data?.error || t('error'))
    }
    setJoining(false)
  }

  if (!user) {
    navigate('/login')
    return null
  }

  return (
    <div className="min-h-screen bg-wind-950 flex items-center justify-center p-4">
      <div className="bg-wind-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-wind-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !group ? (
          <div className="text-wind-500 py-8">{error || t('no_result')}</div>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-wind-700 flex items-center justify-center text-wind-200 text-2xl font-bold mx-auto">
              {group.name?.[0]?.toUpperCase() || '?'}
            </div>
            <h2 className="text-wind-100 text-lg font-semibold">{group.name}</h2>
            {group.description && (
              <p className="text-wind-400 text-sm">{group.description}</p>
            )}
            <div className="text-wind-500 text-xs">
              {t('member_count', group.member_count || '?')}
            </div>

            {group.type === 'password' && (
              <input
                type="password"
                className="w-full bg-wind-800 text-wind-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 ring-wind-500 placeholder-wind-600"
                placeholder={t('enter_group_password')}
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full bg-wind-600 hover:bg-wind-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              {joining ? t('joining_group') : t('join_group')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
