import { useState } from 'react'
import { useChatStore } from '@/store/chatStore'
import { api } from '@/lib/api'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'

const TOKEN = 'dev-token'

interface ChatInputProps {
  projectId: string | null
  projectStatus: string
}

export default function ChatInput({ projectId, projectStatus }: ChatInputProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const { addMessage } = useChatStore()

  const isRunning = projectStatus === 'running' || projectStatus === 'initializing' || projectStatus === 'creating_sandbox' || projectStatus === 'installing'

  const handleSend = async () => {
    if (!text.trim() || !projectId || sending || isRunning) return
    const msg = text.trim()
    setText('')
    setSending(true)

    try {
      addMessage(projectId, {
        id: `user-${Date.now()}`,
        role: 'user',
        content: msg,
        timestamp: new Date().toISOString(),
      })

      await api.chat.sendMessage(TOKEN, projectId, msg)
    } catch (e) {
      console.error('Failed to send:', e)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-border p-3 shrink-0">
      <div className="flex gap-2 items-end">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? 'Agent running...' : 'Type a message...'}
          disabled={isRunning || sending}
          rows={1}
          className="bg-background resize-none min-h-[36px] max-h-[120px] text-sm"
        />
        <Button
          onClick={handleSend}
          disabled={!text.trim() || isRunning || sending}
          size="icon"
          className="bg-primary hover:bg-primary/90 shrink-0 h-9 w-9"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
