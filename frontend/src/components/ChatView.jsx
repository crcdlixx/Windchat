import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { sendWsMessage } from '../lib/websocket'
import { encryptFile, encryptGroupMessage, encryptMessage, hasSignalSession } from '../lib/crypto'
import { t } from '../lib/i18n'
import api from '../lib/api'
import MessageBubble from './MessageBubble'
import MessageInput from './MessageInput'
import ChatHeader from './ChatHeader'

export default function ChatView() {
  const { type, id } = useParams()
  const user = useAuthStore(s => s.user)
  const ensureSignalIdentity = useAuthStore(s => s.ensureSignalIdentity)
  const backupVault = useAuthStore(s => s.backupVault)
  const messages = useChatStore(s => s.messages[`${type}:${id}`] || [])
  const typing = useChatStore(s => s.typing[`${type}:${id}`] || new Set())
  const loadMessages = useChatStore(s => s.loadMessages)
  const cleanExpired = useChatStore(s => s.cleanExpiredMessages)
  const conversations = useChatStore(s => s.conversations)
  const groups = useChatStore(s => s.groups)
  const updateTtl = useChatStore(s => s.updateConversationTtl)
  const updateGroupTtl = useChatStore(s => s.updateGroupTtl)
  const bottomRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [sendError, setSendError] = useState('')

  const chatInfo = useMemo(() => {
    if (type === 'dm') {
      const conv = conversations.find(c => c.id === id)
      return conv ? {
        name: conv.partner_display_name || conv.partner_username,
        sub: `@${conv.partner_username}`,
        ttl: conv.message_ttl_seconds,
        partner_id: conv.partner_id,
      } : null
    } else {
      const group = groups.find(g => g.id === id)
      return group ? {
        name: group.name,
        sub: group.is_temporary ? t('temporary') : t('groups'),
        ttl: group.message_ttl_seconds,
        group,
      } : null
    }
  }, [type, id, conversations, groups])

  useEffect(() => {
    setLoading(true)
    loadMessages(type, id).then(() => setLoading(false))
  }, [type, id])

  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    const timer = setInterval(() => cleanExpired(type, id), 5000)
    return () => clearInterval(timer)
  }, [type, id, cleanExpired])

  useEffect(() => {
    const handler = (event) => {
      setSendError(event.detail?.error || t('send_failed'))
    }
    window.addEventListener('windchat:ws-error', handler)
    return () => window.removeEventListener('windchat:ws-error', handler)
  }, [])

  const handleTtlChange = useCallback(async (seconds) => {
    if (type === 'dm') {
      await api.patch(`/conversations/${id}/ttl`, { message_ttl_seconds: seconds })
      updateTtl(id, seconds)
    } else if (type === 'group') {
      await api.patch(`/groups/${id}`, { message_ttl_seconds: seconds })
      updateGroupTtl(id, seconds)
    }
  }, [type, id, updateTtl, updateGroupTtl])

  const sendMessage = useCallback(async ({ text, file }) => {
    if (!text && !file) return
    setSendError('')
    let fileRef = null
    let fileName = ''
    let messageType = 'text'

    try {
      let fileMeta = null
      if (file) {
        const encrypted = await encryptFile(file)
        const fd = new FormData()
        fd.append('file', encrypted.blob, file.name)
        const res = await api.post('/files/upload', fd)
        fileRef = res.data.key
        fileMeta = encrypted.meta
        fileName = encrypted.meta.name
        messageType = file.type.startsWith('image/') ? 'image' : 'file'
      }

      const plainPayload = JSON.stringify({
        text: text || '',
        file: fileMeta,
      })

      let payload
      if (type === 'dm') {
        const partnerId = chatInfo?.partner_id
        if (!partnerId) return

        await ensureSignalIdentity()
        const bundle = await hasSignalSession(user.id, partnerId)
          ? { user_id: partnerId }
          : (await api.get(`/keys/${partnerId}/bundle`)).data
        payload = await encryptMessage(user.id, bundle, plainPayload)
        await backupVault()
      } else if (type === 'group') {
        payload = await encryptGroupMessage(id, plainPayload)
        await backupVault()
      }

      const sent = sendWsMessage({
        type: 'message:send',
        ...(type === 'dm' ? { conversation_id: id } : { group_id: id }),
        encrypted_payload: payload,
        message_type: messageType,
        file_ref: fileRef,
        ttl_seconds: chatInfo?.ttl || 3600,
      })
      if (!sent) throw new Error('WebSocket is not connected')
      await loadMessages(type, id)
      setTimeout(() => {
        loadMessages(type, id).catch(() => {})
      }, 500)
    } catch (err) {
      const code = err.response?.data?.code
      const message = err.message === 'web_crypto_unavailable'
        ? '当前访问环境不支持浏览器加密能力。请使用 HTTPS 域名访问，或仅在本机 localhost 测试。'
        : code ? t(code) : (err.response?.data?.error || err.message || t('send_failed'))
      setSendError(message === 'recipient_signal_keys_outdated' ? t('recipient_signal_keys_outdated') : message)
      throw err
    }
  }, [type, id, chatInfo, user?.id, ensureSignalIdentity, backupVault, loadMessages])

  const handleTyping = useCallback((isTyping) => {
    sendWsMessage({
      type: isTyping ? 'typing:start' : 'typing:stop',
      ...(type === 'dm' ? { conversation_id: id } : { group_id: id }),
    })
  }, [type, id])

  const typingUsers = [...typing].filter(u => u !== user?.username)
  const ttlMinutes = Math.round((chatInfo?.ttl || 3600) / 60)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ChatHeader chatInfo={chatInfo} type={type} id={id} />

      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 md:px-4 py-3 space-y-1">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-wind-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-wind-400 text-sm text-center px-4">
            <p>{t('no_messages')}</p>
            <p className="mt-1 text-xs">
              {t('auto_delete_hint', ttlMinutes < 60 ? `${ttlMinutes}m` : `${Math.round(ttlMinutes / 60)}h`)}
            </p>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.sender_id === user?.id}
            type={type}
            chatId={id}
          />
        ))}
        {typingUsers.length > 0 && (
          <div className="text-wind-400 text-xs px-2 animate-pulse">
            {t(typingUsers.length === 1 ? 'is_typing' : 'are_typing', typingUsers.join(', '))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <MessageInput
        onSend={sendMessage}
        onTyping={handleTyping}
        ttl={chatInfo?.ttl}
        onTtlChange={handleTtlChange}
        error={sendError}
        onErrorClear={() => setSendError('')}
      />
    </div>
  )
}
