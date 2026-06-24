import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '@/store/projectStore'
import { useLogStore } from '@/store/logStore'
import { api, getApiBaseUrl } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Shield, Zap } from 'lucide-react'

const TOKEN = 'dev-token'

interface NewProjectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function NewProjectModal({ open, onOpenChange }: NewProjectModalProps) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [approvalMode, setApprovalMode] = useState(true)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { addProject } = useProjectStore()
  const { connectWebSocket } = useLogStore()

  const handleSubmit = async () => {
    if (!name.trim() || !prompt.trim()) return
    setLoading(true)

    try {
      const data = await api.projects.create(TOKEN, name, prompt, approvalMode)

      addProject({
        id: data.project_id,
        name,
        status: 'initializing',
        createdAt: new Date().toISOString(),
        zipReady: false,
        approvalMode,
      })

      connectWebSocket(data.project_id, TOKEN, getApiBaseUrl(), () => {
        useProjectStore.getState().updateProject(data.project_id, { status: 'done', zipReady: true })
      })

      setName('')
      setPrompt('')
      setApprovalMode(true)
      onOpenChange(false)
      navigate('/logs')
    } catch (e) {
      console.error('Failed to create project:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My React App"
            className="bg-background"
          />
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="Build a full-stack todo app with React frontend and FastAPI backend. Include user authentication with JWT..."
            className="bg-background resize-none"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setApprovalMode(true)}
              className={`flex-1 flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors ${
                approvalMode
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent/50'
              }`}
            >
              <Shield className="h-4 w-4 shrink-0" />
              <div>
                <p className="text-xs font-medium">Approval Mode</p>
                <p className="text-[10px] opacity-70">Review each action before execution</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setApprovalMode(false)}
              className={`flex-1 flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors ${
                !approvalMode
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent/50'
              }`}
            >
              <Zap className="h-4 w-4 shrink-0" />
              <div>
                <p className="text-xs font-medium">Auto Mode</p>
                <p className="text-[10px] opacity-70">Execute everything automatically</p>
              </div>
            </button>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading || !name.trim() || !prompt.trim()}
            className="w-full bg-primary hover:bg-primary/90"
          >
            {loading ? 'Creating...' : 'Create Project'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
