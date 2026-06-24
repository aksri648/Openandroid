import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Project } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { useLogStore } from '@/store/logStore'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle, AlertCircle, Clock, Package, Zap } from 'lucide-react'

const statusConfig: Record<string, { label: string; variant: string; icon: React.ReactNode }> = {
  initializing: { label: 'Initializing', variant: 'outline', icon: <Loader2 className="animate-spin h-3 w-3" /> },
  creating_sandbox: { label: 'Creating sandbox', variant: 'outline', icon: <Loader2 className="animate-spin h-3 w-3" /> },
  installing: { label: 'Installing', variant: 'outline', icon: <Loader2 className="animate-spin h-3 w-3" /> },
  running: { label: 'Running', variant: 'default', icon: <Zap className="h-3 w-3 text-blue-400" /> },
  zipping: { label: 'Packaging', variant: 'secondary', icon: <Package className="h-3 w-3 text-yellow-400" /> },
  done: { label: 'Completed', variant: 'default', icon: <CheckCircle className="h-3 w-3 text-green-400" /> },
  failed: { label: 'Failed', variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface ProjectCardProps {
  project: Project
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const navigate = useNavigate()
  const { setActiveProject } = useProjectStore()
  const { disconnectWebSocket } = useLogStore()
  const { getToken } = useAuth()
  const config = statusConfig[project.status] || statusConfig.initializing

  const handleClick = () => {
    setActiveProject(project.id)
    navigate('/chat')
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const token = await getToken()
    if (!token) return
    try {
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/projects/${project.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      disconnectWebSocket(project.id)
      useProjectStore.getState().removeProject(project.id)
    } catch (e) {
      console.error('Delete failed:', e)
    }
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'bg-card border border-border rounded-lg p-3 cursor-pointer active:bg-accent/50 transition-colors',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{project.name}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <Badge variant={config.variant as any} className="text-[10px] gap-1">
              {config.icon}
              {config.label}
            </Badge>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {timeAgo(project.createdAt)}
            </span>
          </div>
          {project.error && (
            <p className="text-[10px] text-destructive mt-1 truncate">{project.error}</p>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="text-muted-foreground hover:text-destructive p-1 -m-1"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  )
}
