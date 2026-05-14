import { useState, useEffect } from 'react'
import api from '../lib/api'
import { t } from '../lib/i18n'
import { Save, HardDrive } from 'lucide-react'

export default function NotesView() {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(true)
  const [bytes, setBytes] = useState(0)
  const MAX = 1048576

  useEffect(() => {
    api.get('/storage').then(r => {
      setContent(r.data.content || '')
      setBytes(new TextEncoder().encode(r.data.content || '').length)
    })
  }, [])

  const handleChange = (val) => {
    const b = new TextEncoder().encode(val).length
    if (b > MAX) return
    setContent(val)
    setBytes(b)
    setSaved(false)
  }

  const handleSave = async () => {
    await api.put('/storage', { content })
    setSaved(true)
  }

  const pct = Math.round(bytes / MAX * 100)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="h-14 border-b border-wind-800 bg-wind-900 flex items-center px-4 gap-3 shrink-0">
        <HardDrive size={18} className="text-wind-500" />
        <span className="text-wind-100 font-medium">{t('my_notes')}</span>
        <div className="flex-1" />
        <div className="text-xs text-wind-500">
          {t('storage_usage', (bytes / 1024).toFixed(1))}
          <span className={`ml-2 ${pct > 80 ? 'text-orange-400' : 'text-wind-600'}`}>{pct}%</span>
        </div>
        <button
          onClick={handleSave}
          disabled={saved}
          className="flex items-center gap-1.5 bg-wind-600 hover:bg-wind-500 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 text-sm transition-colors"
        >
          <Save size={14} />{saved ? t('saved') : t('save')}
        </button>
      </div>

      <div className="h-0.5 bg-wind-800 shrink-0">
        <div className={`h-full transition-all ${pct > 80 ? 'bg-orange-500' : 'bg-wind-600'}`} style={{ width: `${pct}%` }} />
      </div>

      <textarea
        className="flex-1 bg-wind-950 text-wind-200 p-4 md:p-6 outline-none resize-none font-mono text-sm leading-relaxed scrollbar-thin"
        placeholder={t('notes_placeholder')}
        value={content}
        onChange={e => handleChange(e.target.value)}
      />
    </div>
  )
}
