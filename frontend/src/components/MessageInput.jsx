import { useState, useRef, useCallback } from 'react'
import { t } from '../lib/i18n'
import { Send, Paperclip, Bold, Italic, Code, Clock, ChevronDown } from 'lucide-react'
import { useClickOutside } from '../lib/hooks'

const TTL_OPTIONS = [
  { value: 300,   key: 'ttl_5m'  },
  { value: 1800,  key: 'ttl_30m' },
  { value: 3600,  key: 'ttl_1h'  },
  { value: 21600, key: 'ttl_6h'  },
  { value: 86400, key: 'ttl_24h' },
]

function ttlLabel(s) {
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${Math.round(s / 3600)}h`
}

export default function MessageInput({ onSend, onTyping, ttl, onTtlChange, error, onErrorClear }) {
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [isMarkdown, setIsMarkdown] = useState(false)
  const [showTtl, setShowTtl] = useState(false)
  const [sending, setSending] = useState(false)
  const fileRef = useRef()
  const typingTimer = useRef(null)
  const isTypingRef = useRef(false)

  const closeTtl = useCallback(() => setShowTtl(false), [])
  const ttlRef = useClickOutside(closeTtl)

  const handleTyping = () => {
    if (!isTypingRef.current) {
      isTypingRef.current = true
      onTyping?.(true)
    }
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {
      isTypingRef.current = false
      onTyping?.(false)
    }, 2000)
  }

  const handleSend = async () => {
    if (sending || (!text.trim() && !file)) return
    clearTimeout(typingTimer.current)
    isTypingRef.current = false
    onTyping?.(false)
    onErrorClear?.()
    setSending(true)
    try {
      await onSend({ text: text.trim(), file })
      setText('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } finally {
      setSending(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const insertMd = (open, close) => {
    const el = document.getElementById('msg-input')
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = text.slice(start, end)
    setText(text.slice(0, start) + open + selected + close + text.slice(end))
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + open.length, end + open.length)
    }, 0)
  }

  return (
    <div className="border-t border-wind-800 bg-wind-900 shrink-0">
      {/* 主输入区 */}
      <div className="px-2 md:px-3 pt-2">
        {file && (
          <div className="mb-2 flex items-center gap-2 bg-wind-800 rounded-lg px-3 py-1.5 text-sm text-wind-300">
            📎 {file.name}
            <button onClick={() => setFile(null)} className="ml-auto text-wind-500 hover:text-red-400">✕</button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            className="p-2 text-wind-400 hover:text-wind-200 hover:bg-wind-800 rounded-lg transition-colors shrink-0"
            title={t('attach_file')}
          >
            <Paperclip size={16} />
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files[0] || null)} />

          <textarea
            id="msg-input"
            className="flex-1 bg-wind-800 text-wind-100 rounded-xl px-3 py-2 outline-none focus:ring-1 ring-wind-600 resize-none text-sm placeholder-wind-400 min-h-[40px] max-h-32"
            placeholder={t('message_placeholder')}
            value={text}
            maxLength={4000}
            rows={1}
            onChange={e => { setText(e.target.value); handleTyping() }}
            onKeyDown={handleKey}
            style={{ overflowY: text.split('\n').length > 3 ? 'auto' : 'hidden' }}
          />

          <button
            onClick={handleSend}
            disabled={sending || (!text.trim() && !file)}
            className="p-2 bg-wind-600 hover:bg-wind-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors shrink-0"
            title={sending ? t('sending') : t('send')}
          >
            <Send size={16} />
          </button>
        </div>
        {error && (
          <p className="text-red-400 text-xs mt-1.5 px-1">{error}</p>
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="flex items-center gap-1 px-2 md:px-3 py-1.5">
        {/* Markdown 开关 */}
        <button
          onClick={() => setIsMarkdown(m => !m)}
          className={`text-xs px-2 py-0.5 rounded transition-colors ${isMarkdown ? 'bg-wind-600 text-white' : 'text-wind-400 hover:text-wind-200'}`}
          title={t('toggle_markdown')}
        >M↓</button>
        {isMarkdown && (
          <>
            <button onClick={() => insertMd('**', '**')} className="text-wind-400 hover:text-wind-200 p-0.5"><Bold size={13} /></button>
            <button onClick={() => insertMd('*', '*')} className="text-wind-400 hover:text-wind-200 p-0.5"><Italic size={13} /></button>
            <button onClick={() => insertMd('`', '`')} className="text-wind-400 hover:text-wind-200 p-0.5"><Code size={13} /></button>
            <button onClick={() => insertMd('\n```\n', '\n```')} className="text-wind-400 hover:text-wind-200 px-1 text-xs font-mono">{'<>'}</button>
          </>
        )}

        {/* 字数统计 */}
        <span className="text-wind-400 text-xs ml-1">{text.length}/4000</span>

        {/* TTL 选择器 */}
        {onTtlChange && (
          <div className="relative ml-auto" ref={ttlRef}>
            <button
              onClick={() => setShowTtl(s => !s)}
              className="flex items-center gap-1 text-wind-400 hover:text-wind-200 text-xs px-2 py-1 rounded-lg hover:bg-wind-800 transition-colors"
              title={t('ttl_label')}
            >
              <Clock size={11} />
              <span>{ttlLabel(ttl || 3600)}</span>
              <ChevronDown size={10} />
            </button>

            {showTtl && (
              <div className="absolute bottom-7 right-0 bg-wind-800 border border-wind-700 rounded-xl shadow-2xl z-50 p-1.5 min-w-[140px]">
                <p className="text-wind-400 text-xs px-2 py-1 border-b border-wind-700 mb-1">{t('ttl_label')}</p>
                {TTL_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { onTtlChange(opt.value); setShowTtl(false) }}
                    className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors
                      ${ttl === opt.value ? 'bg-wind-600 text-white' : 'text-wind-300 hover:bg-wind-700'}`}
                  >
                    {t(opt.key)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
