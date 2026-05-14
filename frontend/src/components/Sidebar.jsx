import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useSidebarStore } from '../stores/sidebarStore'
import { useIsMobile } from '../lib/hooks'
import { t } from '../lib/i18n'
import {
  Wind, MessageSquare, Users, StickyNote,
  LogOut, Plus, Search, ShieldCheck, Menu, X,
} from 'lucide-react'
import NewChatModal from './NewChatModal'
import NewGroupModal from './NewGroupModal'
import ProfileModal from './ProfileModal'

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const conversations = useChatStore(s => s.conversations)
  const groups = useChatStore(s => s.groups)
  const { open, toggle, close } = useSidebarStore()
  const isMobile = useIsMobile()

  const [tab, setTab] = useState('dms')
  const [showNewChat, setShowNewChat] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [search, setSearch] = useState('')

  const isActive = (path) => location.pathname === path

  const filteredDms = conversations.filter(c =>
    (c.partner_username || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.partner_display_name || '').toLowerCase().includes(search.toLowerCase())
  )
  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const navTo = (path) => {
    navigate(path)
    if (isMobile) close()
  }

  // 汉堡按钮：始终悬浮在右上角（移动端）或侧栏顶部（桌面端）
  const ToggleBtn = () => (
    <button
      onClick={toggle}
      className="p-2 rounded-lg text-wind-400 hover:text-wind-200 hover:bg-wind-700 transition-colors"
      title={open ? t('close') : 'Menu'}
    >
      {open ? <X size={18} /> : <Menu size={18} />}
    </button>
  )

  return (
    <>
      {/* 移动端：汉堡按钮固定在左上角，不受侧栏影响 */}
      {isMobile && !open && (
        <button
          onClick={toggle}
          className="fixed top-3 left-3 z-30 p-2 bg-wind-800 rounded-lg text-wind-300 hover:bg-wind-700 shadow-lg"
        >
          <Menu size={20} />
        </button>
      )}

      <aside
        className={`
          ${isMobile
            ? `fixed inset-y-0 left-0 z-30 w-72 transform transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`
            : `${open ? 'w-72' : 'w-0 overflow-hidden'} relative transition-all duration-200`
          }
          bg-wind-900 border-r border-wind-800 flex flex-col shrink-0
        `}
      >
        {/* 头部 */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-wind-800 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-wind-600 flex items-center justify-center shrink-0">
            <Wind size={16} className="text-white" />
          </div>
          <span className="font-bold text-wind-100 text-base flex-1">{t('app_name')}</span>
          <button
            onClick={() => { setShowNewChat(true) }}
            className="p-1.5 hover:bg-wind-700 rounded-lg text-wind-400 hover:text-wind-200 transition-colors"
            title={t('new_conversation')}
          >
            <Plus size={16} />
          </button>
          <ToggleBtn />
        </div>

        {/* 搜索框 */}
        <div className="px-3 py-2 shrink-0">
          <div className="flex items-center gap-2 bg-wind-800 rounded-lg px-3 py-1.5">
            <Search size={13} className="text-wind-500 shrink-0" />
            <input
              className="bg-transparent text-wind-200 text-sm outline-none flex-1 placeholder-wind-600 min-w-0"
              placeholder={t('search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex px-3 gap-1 mb-1 shrink-0">
          <button
            onClick={() => setTab('dms')}
            className={`flex-1 flex items-center justify-center gap-1 text-sm py-1.5 rounded-lg transition-colors
              ${tab === 'dms' ? 'bg-wind-700 text-wind-100' : 'text-wind-400 hover:text-wind-200'}`}
          >
            <MessageSquare size={13} />{t('direct_messages')}
          </button>
          <button
            onClick={() => setTab('groups')}
            className={`flex-1 flex items-center justify-center gap-1 text-sm py-1.5 rounded-lg transition-colors
              ${tab === 'groups' ? 'bg-wind-700 text-wind-100' : 'text-wind-400 hover:text-wind-200'}`}
          >
            <Users size={13} />{t('groups')}
          </button>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 space-y-0.5">
          {tab === 'dms' && filteredDms.map(conv => (
            <button
              key={conv.id}
              onClick={() => navTo(`/chat/dm/${conv.id}`)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors
                ${isActive(`/chat/dm/${conv.id}`) ? 'bg-wind-700' : 'hover:bg-wind-800'}`}
            >
              <div className="w-9 h-9 rounded-full bg-wind-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {(conv.partner_display_name || conv.partner_username || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-wind-200 text-sm font-medium truncate">
                  {conv.partner_display_name || conv.partner_username}
                </div>
                <div className="text-wind-500 text-xs truncate">@{conv.partner_username}</div>
              </div>
            </button>
          ))}

          {tab === 'groups' && (
            <>
              <button
                onClick={() => { setShowNewGroup(true) }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-wind-500 hover:text-wind-300 hover:bg-wind-800 transition-colors text-sm"
              >
                <Plus size={14} />{t('create_group')}
              </button>
              {filteredGroups.map(g => (
                <button
                  key={g.id}
                  onClick={() => navTo(`/chat/group/${g.id}`)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors
                    ${isActive(`/chat/group/${g.id}`) ? 'bg-wind-700' : 'hover:bg-wind-800'}`}
                >
                  <div className="w-9 h-9 rounded-full bg-wind-700 flex items-center justify-center text-wind-200 text-sm font-bold shrink-0">
                    {g.name[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-wind-200 text-sm font-medium truncate">{g.name}</div>
                    <div className="text-wind-500 text-xs">
                      {g.is_temporary ? t('temporary') : t('persistent')} · {t(g.type)}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>

        {/* 底部导航 */}
        <div className="border-t border-wind-800 p-2 space-y-0.5 shrink-0">
          <button
            onClick={() => navTo('/notes')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors
              ${isActive('/notes') ? 'bg-wind-700 text-wind-100' : 'text-wind-400 hover:text-wind-200 hover:bg-wind-800'}`}
          >
            <StickyNote size={15} />{t('my_notes')}
          </button>
          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <button
              onClick={() => navTo('/admin')}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors
                ${location.pathname.startsWith('/admin') ? 'bg-wind-700 text-wind-100' : 'text-wind-400 hover:text-wind-200 hover:bg-wind-800'}`}
            >
              <ShieldCheck size={15} />{t('admin')}
            </button>
          )}
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              onClick={() => setShowProfile(true)}
              className="w-7 h-7 rounded-full bg-wind-600 flex items-center justify-center text-white text-xs font-bold shrink-0 hover:ring-2 ring-wind-400 transition-all"
              title={t('profile')}
            >
              {(user?.display_name || user?.username || '?')[0].toUpperCase()}
            </button>
            <span className="text-wind-300 text-sm flex-1 truncate min-w-0">
              {user?.display_name || user?.username}
            </span>
            <button
              onClick={handleLogout}
              className="p-1 hover:bg-wind-700 rounded-lg text-wind-500 hover:text-red-400 transition-colors shrink-0"
              title={t('sign_out')}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* 桌面端：侧栏收起时显示的展开按钮（不覆盖顶栏）*/}
      {!isMobile && !open && (
        <button
          onClick={toggle}
          className="flex-none w-8 bg-wind-900 border-r border-wind-800 flex items-center justify-center text-wind-500 hover:text-wind-200 hover:bg-wind-800 transition-colors"
        >
          <Menu size={16} />
        </button>
      )}

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
      {showNewGroup && <NewGroupModal onClose={() => setShowNewGroup(false)} />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  )
}
