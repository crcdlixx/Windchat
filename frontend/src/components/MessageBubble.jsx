import { useState, useCallback, useEffect } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useAuthStore } from '../stores/authStore'
import { useClickOutside } from '../lib/hooks'
import { decryptFileBlob, decryptGroupMessage, decryptMessage } from '../lib/crypto'
import { t, isZh } from '../lib/i18n'
import { Paperclip, Trash2, Info } from 'lucide-react'
import { sendWsMessage } from '../lib/websocket'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale/zh-CN'
import api from '../lib/api'
import Avatar from './Avatar'

marked.setOptions({ breaks: true, gfm: true })

function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text || ''))
}

function parsePlainPayload(value) {
  try {
    const parsed = JSON.parse(value)
    return {
      text: parsed.text || '',
      file: parsed.file || null,
    }
  } catch {
    return {
      text: value || '',
      file: null,
    }
  }
}

export default function MessageBubble({ message, isOwn, type, chatId }) {
  const user = useAuthStore(s => s.user)
  const deleteMsg = useChatStore(s => s.deleteMessage)
  const [showInfo, setShowInfo] = useState(false)
  const [attachmentUrl, setAttachmentUrl] = useState('')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileMeta, setFileMeta] = useState(null)

  const closeInfo = useCallback(() => setShowInfo(false), [])
  const infoRef = useClickOutside(closeInfo)

  const expiresAt = new Date(message.expires_at)
  const timeLeft = expiresAt - Date.now()
  const expiringSoon = timeLeft < 300_000

  const handleDelete = () => {
    sendWsMessage({ type: 'message:delete', message_id: message.id })
    deleteMsg(type, chatId, message.id)
  }

  const getFileUrl = useCallback(async () => {
    const res = await api.get(`/files/url/${message.file_ref}`)
    return res.data.url
  }, [message.file_ref])

  useEffect(() => {
    let cancelled = false
    setText('')
    setFileName('')
    setFileMeta(null)

    if (type === 'dm') {
      decryptMessage(user?.id, message.sender_id, message.encrypted_payload)
        .then(plain => {
          if (cancelled) return
          const parsed = parsePlainPayload(plain)
          setText(parsed.text)
          setFileMeta(parsed.file)
          setFileName(parsed.file?.name || '')
        })
        .catch(() => {
          if (!cancelled) setText(t('decryption_failed'))
        })
    } else {
      decryptGroupMessage(chatId, message.encrypted_payload)
        .then(plain => {
          if (cancelled) return
          const parsed = parsePlainPayload(plain)
          setText(parsed.text)
          setFileMeta(parsed.file)
          setFileName(parsed.file?.name || '')
        })
        .catch(() => {
          if (!cancelled) setText(t('decryption_failed'))
        })
    }

    return () => {
      cancelled = true
    }
  }, [message.encrypted_payload, message.sender_id, type, chatId, user?.id])

  useEffect(() => {
    let cancelled = false
    setAttachmentUrl('')

    if (message.message_type !== 'image' || !message.file_ref || !fileMeta) return undefined

    let objectUrl = ''

    getFileUrl()
      .then(url => api.get(url, { responseType: 'blob', baseURL: '' }))
      .then(res => decryptFileBlob(res.data, fileMeta))
      .then(blob => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setAttachmentUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setAttachmentUrl('')
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [message.message_type, message.file_ref, fileMeta, getFileUrl])

  const openFile = async () => {
    if (!fileMeta) return
    const url = await getFileUrl()
    const res = await api.get(url, { responseType: 'blob', baseURL: '' })
    const blob = await decryptFileBlob(res.data, fileMeta)
    const objectUrl = URL.createObjectURL(blob)
    window.open(objectUrl, '_blank', 'noopener,noreferrer')
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  }

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group mb-1`}>
      {!isOwn && (
        <div className="mr-2 mt-1">
          <Avatar src={message.sender_avatar} name={message.sender_display_name || message.sender_username} className="w-7 h-7" textClassName="text-xs" />
        </div>
      )}

      <div className="max-w-[70%] min-w-0">
        {!isOwn && (
          <div className="text-wind-500 text-xs mb-0.5 ml-1">
            {message.sender_display_name || message.sender_username}
          </div>
        )}

        <div className={`relative rounded-2xl px-3 py-2 ${isOwn
          ? 'bg-wind-600 text-white rounded-br-sm'
          : 'bg-wind-800 text-wind-100 rounded-bl-sm'
        } ${expiringSoon ? 'ring-1 ring-orange-500/50' : ''}`}>

          {message.message_type === 'image' && message.file_ref && (
            attachmentUrl && (
              <button onClick={openFile} className="block mb-1">
                <img
                  src={attachmentUrl}
                  alt="attachment"
                  className="max-w-full rounded-lg max-h-48 object-cover"
                  onError={e => { e.target.style.display = 'none' }}
                />
              </button>
            )
          )}

          {message.message_type === 'file' && message.file_ref && (
            <button
              onClick={openFile}
              className={`flex items-center gap-2 text-sm ${isOwn ? 'text-white/90 hover:text-white' : 'text-wind-300 hover:text-wind-100'}`}
            >
              <Paperclip size={14} />
              <span className="break-all">{fileName || t('download_attachment')}</span>
            </button>
          )}

          {text && (
            <div
              className={`prose-wind text-sm break-words ${isOwn ? 'message-prose-own' : ''}`}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
            />
          )}

          <div className="flex items-center justify-end gap-1 mt-1">
            <span className={`text-xs ${isOwn ? 'text-white/75' : 'text-wind-500'} ${expiringSoon ? 'text-orange-400' : ''}`}>
              {expiringSoon
                ? t('expires_in', `${Math.ceil(timeLeft / 60000)}m`)
                : formatDistanceToNow(new Date(message.created_at), { addSuffix: true, locale: isZh() ? zhCN : undefined })}
            </span>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${isOwn ? 'order-first mr-1' : 'ml-1'}`}>
        {/* Info 按钮 + 弹窗 */}
        <div className="relative" ref={infoRef}>
          <button
            onClick={() => setShowInfo(s => !s)}
            className="p-1 text-wind-600 hover:text-wind-400"
            title={t('message_info')}
          >
            <Info size={12} />
          </button>

          {showInfo && (
            <div className={`absolute ${isOwn ? 'right-0' : 'left-0'} bottom-7 bg-wind-800 border border-wind-700 rounded-xl px-3 py-2 text-xs text-wind-400 shadow-xl z-30 whitespace-nowrap`}>
              <div>TTL: {message.ttl_seconds}s</div>
              <div>{t('expires_in', expiresAt.toLocaleString())}</div>
            </div>
          )}
        </div>

        {isOwn && (
          <button
            onClick={handleDelete}
            className="p-1 text-wind-600 hover:text-red-400"
            title={t('delete_message')}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
