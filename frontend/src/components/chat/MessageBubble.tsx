import { ChatMessage } from '@/types'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: ChatMessage
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2 text-sm',
          isUser
            ? 'bg-primary/20 border border-primary/40 rounded-br-sm'
            : 'bg-card border border-border rounded-bl-sm',
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {message.timestamp && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  )
}
