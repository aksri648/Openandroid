import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useProjectStore } from '@/store/projectStore'
import { useChatStore } from '@/store/chatStore'
import { useLogStore } from '@/store/logStore'
import MessageBubble from '@/components/chat/MessageBubble'
import ChatInput from '@/components/chat/ChatInput'
import ApprovalCard from '@/components/chat/ApprovalCard'

export default function ChatPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const projects = useProjectStore((s) => s.projects)
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const messages = useChatStore((s) => (activeProjectId ? s.messages[activeProjectId] || [] : []))
  const logs = useLogStore((s) => (activeProjectId ? s.logs[activeProjectId] || [] : []))
  const pendingApprovals = useLogStore((s) => (activeProjectId ? s.pendingApprovals[activeProjectId] || [] : []))
  const { fetchMessages, addMessage } = useChatStore()
  const { getToken } = useAuth()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeProjectId) {
      getToken().then((t) => {
        if (t) fetchMessages(t, activeProjectId)
      })
    }
  }, [activeProjectId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, logs.length, pendingApprovals.length])

  if (!activeProject) {
    return (
      <div className="flex flex-col h-full p-4">
        <h1 className="text-lg font-bold mb-4">Chat</h1>
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a project first
        </div>
      </div>
    )
  }

  // Merge agent logs as assistant messages
  const agentLogs = logs.filter((l) => l.level === 'agent')
  const displayMessages = [...messages]

  if (agentLogs.length > 0 && displayMessages.length <= 1) {
    const agentContent = agentLogs.map((l) => l.message).join('')
    if (agentContent.trim()) {
      displayMessages.push({
        id: 'agent-stream',
        role: 'assistant',
        content: agentContent,
        timestamp: agentLogs[agentLogs.length - 1].ts || '',
      })
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium truncate">{activeProject.name}</h1>
          {activeProject.approvalMode && (
            <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
              Approval Mode
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">Status: {activeProject.status}</p>
      </div>

      {/* Messages + Approvals */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {displayMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Pending approval cards */}
        {pendingApprovals.map((action) => (
          <ApprovalCard key={action.id} action={action} />
        ))}

        {displayMessages.length === 0 && pendingApprovals.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Send a message to start the conversation
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput projectId={activeProjectId} projectStatus={activeProject.status} />
    </div>
  )
}
