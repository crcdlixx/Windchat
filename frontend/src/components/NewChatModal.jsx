import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChatStore } from '../stores/chatStore'
import api from '../lib/api'
import { X, Search, MessageSquare } from 'lucide-react'
import { t } from '../lib/i18n'

export default function NewChatModal({ onClose }) {
  const navigate = useNavigate()
  const loadConversations = useChatStore(s => s.loadConversations)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await api.get('/users/search', { params: { q: query } })
        setResults(res.data)
      } catch {}
      setLoading(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const startChat = async (user) => {
    const res = await api.post('/conversations', { user_id: user.id })
    await loadConversations()
    navigate(`/chat/dm/${res.data.id}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-wind-900 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-wind-800">
          <h2 className="text-wind-100 font-semibold">{t('new_conversation')}</h2>
          <button onClick={onClose} className="text-wind-500 hover:text-wind-300"><X size={18} /></button>
        </div>
        <div className="p-3">
          <div className="flex items-center gap-2 bg-wind-800 rounded-lg px-3 py-2 mb-3">
            <Search size={14} className="text-wind-500" />
            <input
              className="bg-transparent text-wind-200 text-sm outline-none flex-1 placeholder-wind-600"
              placeholder={t('search_users')}
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto scrollbar-thin">
            {loading && <div className="text-center text-wind-500 text-sm py-2">{t('loading')}</div>}
            {results.map(u => (
              <button
                key={u.id}
                onClick={() => startChat(u)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-wind-800 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-wind-700 flex items-center justify-center text-wind-200 text-sm font-bold shrink-0">
                  {(u.display_name || u.username)[0].toUpperCase()}
                </div>
                <div>
                  <div className="text-wind-200 text-sm font-medium">{u.display_name || u.username}</div>
                  <div className="text-wind-500 text-xs">@{u.username}</div>
                </div>
                <MessageSquare size={14} className="ml-auto text-wind-600" />
              </button>
            ))}
            {!loading && query.length >= 2 && results.length === 0 && (
              <div className="text-center text-wind-600 text-sm py-4">{t('no_result')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
