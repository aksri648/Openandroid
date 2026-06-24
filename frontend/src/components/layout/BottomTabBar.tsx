import { useLocation, useNavigate } from 'react-router-dom'
import { FolderOpen, MessageSquare, FileCode2, Terminal, Download, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { path: '/projects', icon: FolderOpen, label: 'Projects' },
  { path: '/chat', icon: MessageSquare, label: 'Chat' },
  { path: '/files', icon: FileCode2, label: 'Files' },
  { path: '/logs', icon: Terminal, label: 'Logs' },
  { path: '/download', icon: Download, label: 'Download' },
  { path: '/settings', icon: Settings2, label: 'Settings' },
]

export default function BottomTabBar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border">
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path
          const Icon = tab.icon
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {isActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />}
              <Icon size={22} />
              <span className="text-[10px]">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
