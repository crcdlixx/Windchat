import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'

let ws = null
let reconnectTimer = null

export function connectWebSocket() {
  const token = useAuthStore.getState().accessToken
  if (!token || ws?.readyState === WebSocket.OPEN) return

  const wsUrl = `${import.meta.env.VITE_WS_URL || '/ws'}?token=${token}`
  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    console.log('WS connected')
    if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null }
    startPing()
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handleIncoming(msg)
    } catch {}
  }

  ws.onclose = () => {
    console.log('WS disconnected, reconnecting...')
    stopPing()
    reconnectTimer = setTimeout(connectWebSocket, 3000)
  }

  ws.onerror = () => ws.close()
}

export function disconnectWebSocket() {
  stopPing()
  if (ws) { ws.close(); ws = null }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
}

export function sendWsMessage(payload) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
    return true
  }
  return false
}

let pingInterval = null
function startPing() {
  pingInterval = setInterval(() => sendWsMessage({ type: 'ping' }), 30000)
}
function stopPing() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null }
}

function handleIncoming(msg) {
  const store = useChatStore.getState()

  switch (msg.type) {
    case 'message:new': {
      const { message } = msg
      const type = message.conversation_id ? 'dm' : 'group'
      const id = message.conversation_id || message.group_id
      store.appendMessage(type, id, message)
      break
    }
    case 'message:deleted': {
      const active = store.activeChat
      if (active) store.deleteMessage(active.type, active.id, msg.message_id)
      break
    }
    case 'error': {
      window.dispatchEvent(new CustomEvent('windchat:ws-error', {
        detail: { error: msg.error || 'WebSocket error' },
      }))
      break
    }
    case 'typing:start': {
      const type = msg.conversation_id ? 'dm' : 'group'
      const id = msg.conversation_id || msg.group_id
      store.setTyping(type, id, msg.username, true)
      setTimeout(() => store.setTyping(type, id, msg.username, false), 4000)
      break
    }
    case 'typing:stop': {
      const type = msg.conversation_id ? 'dm' : 'group'
      const id = msg.conversation_id || msg.group_id
      store.setTyping(type, id, msg.username, false)
      break
    }
  }
}
