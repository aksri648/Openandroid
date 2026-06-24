import { LogLine, PendingAction } from '@/types'

type LogCallback = (line: LogLine) => void
type DoneCallback = () => void
type ApprovalCallback = (action: PendingAction) => void
type PlanCallback = (message: string) => void

class WebSocketManager {
  private connections: Record<string, WebSocket> = {}

  connect(
    projectId: string,
    token: string,
    baseUrl: string,
    onLog: LogCallback,
    onDone: DoneCallback,
    onApproval?: ApprovalCallback,
    onPlan?: PlanCallback,
  ) {
    if (this.connections[projectId]) {
      this.connections[projectId].close()
    }

    const wsUrl = baseUrl.replace(/^http/, 'ws')
    const ws = new WebSocket(`${wsUrl}/ws/logs/${projectId}?token=${token}`)

    ws.onmessage = (event) => {
      const data: LogLine = JSON.parse(event.data)

      if (data.level === 'done' && data.message === 'GENERATION_COMPLETE') {
        onDone()
        return
      }
      if (data.level === 'ping') return

      // Handle approval requests
      if (data.level === 'approval_needed' && data.action && onApproval) {
        onApproval(data.action)
        return
      }

      // Handle plan requested
      if (data.level === 'plan_requested' && onPlan) {
        onPlan(data.message)
        return
      }

      onLog(data)
    }

    ws.onerror = () => {
      console.error(`WebSocket error for project ${projectId}`)
    }

    ws.onclose = () => {
      delete this.connections[projectId]
    }

    this.connections[projectId] = ws
  }

  disconnect(projectId: string) {
    if (this.connections[projectId]) {
      this.connections[projectId].close()
      delete this.connections[projectId]
    }
  }

  disconnectAll() {
    Object.keys(this.connections).forEach((id) => this.disconnect(id))
  }
}

export const wsManager = new WebSocketManager()
