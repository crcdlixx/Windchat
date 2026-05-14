import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useSidebarStore } from '../stores/sidebarStore'
import { connectWebSocket, disconnectWebSocket } from '../lib/websocket'
import { useIsMobile } from '../lib/hooks'
import Sidebar from '../components/Sidebar'
import ChatView from '../components/ChatView'
import NotesView from '../components/NotesView'
import AdminView from '../components/AdminView'
import WelcomeView from '../components/WelcomeView'

export default function ChatLayout() {
  const token = useAuthStore(s => s.accessToken)
  const user = useAuthStore(s => s.user)
  const ensureSignalIdentity = useAuthStore(s => s.ensureSignalIdentity)
  const loadConversations = useChatStore(s => s.loadConversations)
  const loadGroups = useChatStore(s => s.loadGroups)
  const { open, toggle, close } = useSidebarStore()
  const isMobile = useIsMobile()

  useEffect(() => {
    if (token) {
      connectWebSocket()
      loadConversations()
      loadGroups()
      ensureSignalIdentity().catch(() => {})
    }
    return () => disconnectWebSocket()
  }, [token, user?.id])

  // 窗口宽度变化时自动处理侧栏
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e) => {
      if (e.matches) close()          // 切换到移动端时关闭
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-wind-950 relative">
      {/* 移动端遮罩：点击关闭侧栏 */}
      {isMobile && open && (
        <div
          className="fixed inset-0 bg-black/50 z-20"
          onClick={close}
        />
      )}

      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Routes>
          <Route path="/" element={<WelcomeView />} />
          <Route path="/chat/:type/:id" element={<ChatView />} />
          <Route path="/notes" element={<NotesView />} />
          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <Route path="/admin/*" element={<AdminView />} />
          )}
        </Routes>
      </main>
    </div>
  )
}
