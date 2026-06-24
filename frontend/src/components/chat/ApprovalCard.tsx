import { useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { PendingAction } from '@/types'
import { api } from '@/lib/api'
import { useLogStore } from '@/store/logStore'
import { useProjectStore } from '@/store/projectStore'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Check, X, FileCode2, Terminal, FileEdit, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

interface ApprovalCardProps {
  action: PendingAction
}

function getActionIcon(type: string) {
  switch (type) {
    case 'file_write':
      return <FileCode2 className="h-4 w-4 text-blue-400" />
    case 'file_edit':
      return <FileEdit className="h-4 w-4 text-yellow-400" />
    case 'command':
      return <Terminal className="h-4 w-4 text-green-400" />
    default:
      return <FileCode2 className="h-4 w-4 text-muted-foreground" />
  }
}

function getActionLabel(preview: PendingAction['preview']): string {
  switch (preview.type) {
    case 'file_write':
      return `Create ${preview.path}`
    case 'file_edit':
      return `Edit ${preview.path}`
    case 'command':
      return `Run command`
    default:
      return preview.tool_name || 'Unknown action'
  }
}

export default function ApprovalCard({ action }: ApprovalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(action.preview.content || '')
  const [processing, setProcessing] = useState(false)
  const { getToken } = useAuth()
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const { removePendingApproval } = useLogStore()

  const handleApprove = async (withEdit: boolean = false) => {
    if (!activeProjectId) return
    setProcessing(true)

    try {
      const token = await getToken()
      if (!token) return

      await api.projects.approve(
        token,
        activeProjectId,
        action.id,
        withEdit ? editedContent : undefined,
      )
      removePendingApproval(activeProjectId, action.id)
    } catch (e) {
      console.error('Approval failed:', e)
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!activeProjectId) return
    setProcessing(true)

    try {
      const token = await getToken()
      if (!token) return

      await api.projects.reject(token, activeProjectId, action.id, 'Rejected by user')
      removePendingApproval(activeProjectId, action.id)
    } catch (e) {
      console.error('Rejection failed:', e)
    } finally {
      setProcessing(false)
    }
  }

  const label = getActionLabel(action.preview)
  const icon = getActionIcon(action.preview.type)

  return (
    <div className="border border-primary/30 rounded-lg bg-primary/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {icon}
        <span className="text-xs font-medium flex-1 truncate">{label}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setExpanded(!expanded)}
          className="h-6 w-6 shrink-0"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>

      {/* Preview (collapsible) */}
      {expanded && (
        <div className="px-3 pb-2">
          {action.preview.type === 'command' ? (
            <pre className="bg-muted rounded p-2 text-[11px] font-mono text-green-400 overflow-x-auto whitespace-pre-wrap">
              {action.preview.command}
            </pre>
          ) : action.preview.type === 'file_edit' ? (
            <div className="space-y-1">
              <div className="bg-red-500/10 rounded p-2 text-[11px] font-mono overflow-x-auto">
                <span className="text-red-400">−</span>
                <pre className="whitespace-pre-wrap text-red-300">{action.preview.old_content}</pre>
              </div>
              <div className="bg-green-500/10 rounded p-2 text-[11px] font-mono overflow-x-auto">
                <span className="text-green-400">+</span>
                <pre className="whitespace-pre-wrap text-green-300">{action.preview.new_content}</pre>
              </div>
            </div>
          ) : (
            <pre className="bg-muted rounded p-2 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
              {action.preview.content}
            </pre>
          )}
        </div>
      )}

      {/* Edit area (for file writes) */}
      {editing && action.preview.type === 'file_write' && (
        <div className="px-3 pb-2">
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            rows={6}
            className="bg-background text-xs font-mono resize-none"
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-1.5 px-3 pb-2">
        <Button
          onClick={() => handleApprove(false)}
          disabled={processing}
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white gap-1 h-7 text-xs"
        >
          {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Approve
        </Button>
        {action.preview.type === 'file_write' && (
          <Button
            onClick={() => {
              if (editing) {
                handleApprove(true)
              } else {
                setEditing(true)
                setExpanded(true)
              }
            }}
            disabled={processing}
            size="sm"
            variant="outline"
            className="gap-1 h-7 text-xs"
          >
            <FileEdit className="h-3 w-3" />
            {editing ? 'Save & Approve' : 'Edit & Approve'}
          </Button>
        )}
        <Button
          onClick={handleReject}
          disabled={processing}
          size="sm"
          variant="destructive"
          className="gap-1 h-7 text-xs"
        >
          <X className="h-3 w-3" />
          Reject
        </Button>
      </div>
    </div>
  )
}
