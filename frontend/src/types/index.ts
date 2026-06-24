export interface Project {
  id: string
  name: string
  status: 'initializing' | 'creating_sandbox' | 'installing' | 'running' | 'zipping' | 'done' | 'failed'
  createdAt: string
  zipReady: boolean
  zipSize?: number
  error?: string
  fileTree?: string[]
  approvalMode?: boolean
}

export interface LogLine {
  level: 'system' | 'agent' | 'tool' | 'user' | 'error' | 'debug' | 'step' | 'done' | 'ping' | 'approval_needed' | 'plan_requested'
  message: string
  ts?: string
  action?: PendingAction
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface McpServer {
  name: string
  url: string
  config: Record<string, unknown>
  status?: 'connected' | 'unknown' | 'error'
}

export interface LlmProvider {
  provider_name: string
  base_url: string
  api_key: string
  model: string
  is_default: boolean
}

export interface FilePreview {
  type: 'file_write' | 'file_edit' | 'command' | 'unknown'
  path?: string
  content?: string
  old_content?: string
  new_content?: string
  command?: string
  tool_name?: string
  input?: Record<string, unknown>
  preview: string
}

export interface PendingAction {
  id: string
  tool_id: string
  tool_name: string
  tool_input: Record<string, unknown>
  preview: FilePreview
  approved: boolean | null
  timestamp: string
  reason?: string
}
