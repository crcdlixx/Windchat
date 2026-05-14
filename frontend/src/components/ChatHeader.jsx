import { useState } from 'react'
import { useSidebarStore } from '../stores/sidebarStore'
import { useIsMobile } from '../lib/hooks'
import { t } from '../lib/i18n'
import { Settings, Lock, Globe, Eye, Menu } from 'lucide-react'
import GroupSettingsModal from './GroupSettingsModal'

export default function ChatHeader({ chatInfo, type, id }) {
  const isMobile = useIsMobile()
  const { toggle } = useSidebarStore()
  const [showSettings, setShowSettings] = useState(false)

  const typeIcon = type === 'group'
    ? chatInfo?.group?.type === 'public'   ? <Globe size={12} />
    : chatInfo?.group?.type === 'password' ? <Lock  size={12} />
    : <Eye size={12} />
    : null

  if (!chatInfo) return (
    <div className="h-14 border-b border-wind-800 bg-wind-900 flex items-center px-4 gap-3 shrink-0">
      {isMobile && (
        <button onClick={toggle} className="p-1.5 text-wind-400 hover:text-wind-200">
          <Menu size={18} />
        </button>
      )}
      <div className="w-32 h-4 bg-wind-800 rounded animate-pulse" />
    </div>
  )

  return (
    <div className="h-14 border-b border-wind-800 bg-wind-900 flex items-center px-3 gap-2 shrink-0 z-10">
      {isMobile && (
        <button
          onClick={toggle}
          className="p-1.5 text-wind-400 hover:text-wind-200 hover:bg-wind-800 rounded-lg transition-colors shrink-0"
        >
          <Menu size={18} />
        </button>
      )}

      <div className="w-9 h-9 rounded-full bg-wind-700 flex items-center justify-center text-wind-200 font-bold text-sm shrink-0">
        {chatInfo.name?.[0]?.toUpperCase() || '?'}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-wind-100 font-medium truncate text-sm">{chatInfo.name}</span>
          {typeIcon && <span className="text-wind-400 shrink-0">{typeIcon}</span>}
        </div>
        <div className="text-wind-400 text-xs truncate">{chatInfo.sub}</div>
      </div>

      {type === 'group' && (
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 text-wind-400 hover:text-wind-200 hover:bg-wind-800 rounded-lg transition-colors shrink-0"
          title={t('group_settings')}
        >
          <Settings size={16} />
        </button>
      )}

      {showSettings && type === 'group' && (
        <GroupSettingsModal groupId={id} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
