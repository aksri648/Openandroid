import { useProjectStore } from '@/store/projectStore'
import { useLogStore } from '@/store/logStore'
import XtermPanel from '@/components/logs/XtermPanel'
import ApprovalCard from '@/components/chat/ApprovalCard'
import { ScrollArea } from '@/components/ui/scroll-area'

export default function LogsPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const projects = useProjectStore((s) => s.projects)
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const pendingApprovals = useLogStore((s) => (activeProjectId ? s.pendingApprovals[activeProjectId] || [] : []))

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium">Logs</h1>
          {activeProject?.approvalMode && (
            <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
              Approval Mode
            </span>
          )}
        </div>
        {activeProject && (
          <p className="text-[10px] text-muted-foreground">{activeProject.name}</p>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Terminal */}
        <div className="flex-1 overflow-hidden">
          {activeProjectId ? (
            <XtermPanel projectId={activeProjectId} status={activeProject?.status || 'initializing'} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No active project logs
            </div>
          )}
        </div>

        {/* Pending approvals below terminal */}
        {pendingApprovals.length > 0 && (
          <div className="border-t border-border shrink-0">
            <div className="px-3 py-1.5 bg-primary/5 border-b border-border">
              <p className="text-[10px] font-medium text-primary">
                {pendingApprovals.length} action{pendingApprovals.length > 1 ? 's' : ''} awaiting approval
              </p>
            </div>
            <ScrollArea className="max-h-48">
              <div className="p-2 space-y-2">
                {pendingApprovals.map((action) => (
                  <ApprovalCard key={action.id} action={action} />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  )
}
