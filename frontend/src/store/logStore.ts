import { create } from 'zustand'
import { LogLine, PendingAction } from '@/types'
import { wsManager } from '@/lib/ws'

interface LogStore {
  logs: Record<string, LogLine[]>
  pendingApprovals: Record<string, PendingAction[]>
  addLog: (projectId: string, line: LogLine) => void
  clearLogs: (projectId: string) => void
  addPendingApproval: (projectId: string, action: PendingAction) => void
  removePendingApproval: (projectId: string, actionId: string) => void
  connectWebSocket: (
    projectId: string,
    token: string,
    baseUrl: string,
    onDone: () => void,
  ) => void
  disconnectWebSocket: (projectId: string) => void
}

export const useLogStore = create<LogStore>()((set) => ({
  logs: {},
  pendingApprovals: {},

  addLog: (projectId, line) =>
    set((state) => ({
      logs: {
        ...state.logs,
        [projectId]: [...(state.logs[projectId] || []), line],
      },
    })),

  clearLogs: (projectId) =>
    set((state) => ({
      logs: {
        ...state.logs,
        [projectId]: [],
      },
    })),

  addPendingApproval: (projectId, action) =>
    set((state) => ({
      pendingApprovals: {
        ...state.pendingApprovals,
        [projectId]: [...(state.pendingApprovals[projectId] || []), action],
      },
    })),

  removePendingApproval: (projectId, actionId) =>
    set((state) => ({
      pendingApprovals: {
        ...state.pendingApprovals,
        [projectId]: (state.pendingApprovals[projectId] || []).filter((a) => a.id !== actionId),
      },
    })),

  connectWebSocket: (projectId, token, baseUrl, onDone) => {
    wsManager.connect(
      projectId,
      token,
      baseUrl,
      (line) => {
        set((state) => ({
          logs: {
            ...state.logs,
            [projectId]: [...(state.logs[projectId] || []), line],
          },
        }))
      },
      onDone,
      (action) => {
        // Approval request received — add to pending approvals
        set((state) => ({
          pendingApprovals: {
            ...state.pendingApprovals,
            [projectId]: [...(state.pendingApprovals[projectId] || []), action],
          },
          logs: {
            ...state.logs,
            [projectId]: [
              ...(state.logs[projectId] || []),
              {
                level: 'approval_needed' as const,
                message: `Approval required: ${action.tool_name}`,
                action,
              },
            ],
          },
        }))
      },
      (message) => {
        // Plan requested
        set((state) => ({
          logs: {
            ...state.logs,
            [projectId]: [
              ...(state.logs[projectId] || []),
              { level: 'plan_requested' as const, message },
            ],
          },
        }))
      },
    )
  },

  disconnectWebSocket: (projectId) => {
    wsManager.disconnect(projectId)
  },
}))
