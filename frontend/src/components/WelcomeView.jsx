import { Wind, MessageSquare, Users, Lock } from 'lucide-react'
import { t } from '../lib/i18n'

export default function WelcomeView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-wind-800 flex items-center justify-center mb-4">
        <Wind size={32} className="text-wind-400" />
      </div>
      <h2 className="text-wind-200 text-xl font-semibold mb-2">{t('welcome_title')}</h2>
      <p className="text-wind-500 text-sm max-w-xs mb-8">{t('welcome_subtitle')}</p>
      <div className="grid grid-cols-1 gap-3 max-w-xs w-full text-left">
        {[
          { icon: <MessageSquare size={16} />, title: t('feature_dm'),    desc: t('feature_dm_desc')    },
          { icon: <Users size={16} />,         title: t('feature_group'), desc: t('feature_group_desc') },
          { icon: <Lock size={16} />,          title: t('feature_e2e'),   desc: t('feature_e2e_desc')   },
        ].map(f => (
          <div key={f.title} className="flex gap-3 bg-wind-900 rounded-xl px-4 py-3">
            <span className="text-wind-500 mt-0.5 shrink-0">{f.icon}</span>
            <div>
              <div className="text-wind-300 text-sm font-medium">{f.title}</div>
              <div className="text-wind-600 text-xs">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
