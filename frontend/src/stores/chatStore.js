import { create } from 'zustand'
import api from '../lib/api'

export const useChatStore = create((set, get) => ({
  conversations: [],
  groups: [],
  activeChat: null, // { type: 'dm'|'group', id, name, ttl }
  messages: {}, // { [chatKey]: Message[] }
  typing: {}, // { [chatKey]: Set<username> }

  setActiveChat(chat) { set({ activeChat: chat }) },

  async loadConversations() {
    const res = await api.get('/conversations')
    set({ conversations: res.data })
  },

  async loadGroups() {
    const res = await api.get('/groups')
    set({ groups: res.data })
  },

  async loadMessages(type, id) {
    const key = `${type}:${id}`
    const url = type === 'dm' ? `/messages/conversation/${id}` : `/messages/group/${id}`
    const res = await api.get(url)
    set(s => ({ messages: { ...s.messages, [key]: res.data } }))
  },

  appendMessage(type, id, message) {
    const key = `${type}:${id}`
    set(s => ({
      messages: {
        ...s.messages,
        [key]: [...(s.messages[key] || []), message],
      }
    }))
  },

  deleteMessage(type, id, messageId) {
    const key = `${type}:${id}`
    set(s => ({
      messages: {
        ...s.messages,
        [key]: (s.messages[key] || []).filter(m => m.id !== messageId),
      }
    }))
  },

  setTyping(type, id, username, isTyping) {
    const key = `${type}:${id}`
    set(s => {
      const current = new Set(s.typing[key] || [])
      if (isTyping) current.add(username)
      else current.delete(username)
      return { typing: { ...s.typing, [key]: current } }
    })
  },

  updateConversationTtl(convId, ttl) {
    set(s => ({
      conversations: s.conversations.map(c =>
        c.id === convId ? { ...c, message_ttl_seconds: ttl } : c
      )
    }))
  },

  updateGroupTtl(groupId, ttl) {
    set(s => ({
      groups: s.groups.map(g =>
        g.id === groupId ? { ...g, message_ttl_seconds: ttl } : g
      )
    }))
  },

  cleanExpiredMessages(type, id) {
    const key = `${type}:${id}`
    const now = Date.now()
    set(s => {
      const msgs = s.messages[key]
      if (!msgs) return s
      const filtered = msgs.filter(m => !m.expires_at || new Date(m.expires_at).getTime() > now)
      if (filtered.length === msgs.length) return s
      return { messages: { ...s.messages, [key]: filtered } }
    })
  },
}))
