import { ReactNode } from 'react'
import { useProjectStore } from '@/store/projectStore'
import BottomTabBar from './BottomTabBar'

interface AppShellProps {
  children: ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const projects = useProjectStore((s) => s.projects)
  const activeProject = projects.find((p) => p.id === activeProjectId)

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-12 border-b border-border bg-card shrink-0">
        <span className="text-primary font-bold text-sm">OpenCode Mobile</span>
        <div className="flex items-center gap-2">
          {activeProject && (
            <span className="text-xs text-muted-foreground truncate max-w-[120px]">
              {activeProject.name}
            </span>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-16">{children}</main>

      {/* Tab Bar */}
      <BottomTabBar />
    </div>
  )
}
