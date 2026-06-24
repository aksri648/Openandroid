import { useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useSettingsStore } from '@/store/settingsStore'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

export default function McpServersSection() {
  const { mcpServers, addMcpServer, removeMcpServer } = useSettingsStore()
  const { getToken } = useAuth()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [config, setConfig] = useState('')

  const handleAdd = async () => {
    if (!name.trim() || !url.trim()) return
    const token = await getToken()
    if (!token) return

    let parsedConfig: Record<string, unknown> = {}
    try {
      if (config.trim()) parsedConfig = JSON.parse(config)
    } catch {
      return
    }

    await addMcpServer(token, name, url, parsedConfig)
    setName('')
    setUrl('')
    setConfig('')
  }

  const handleDelete = async (serverName: string) => {
    const token = await getToken()
    if (!token) return
    await removeMcpServer(token, serverName)
  }

  return (
    <div className="space-y-3">
      {mcpServers.map((server) => (
        <div key={server.name} className="bg-muted/50 rounded-md p-2 flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium">{server.name}</p>
            <p className="text-[10px] text-muted-foreground font-mono truncate">{server.url}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDelete(server.name)}
            className="h-6 w-6 text-destructive shrink-0"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}

      <div className="space-y-2 pt-2 border-t border-border">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Server name (e.g. filesystem-mcp)"
          className="bg-background text-xs"
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL (e.g. https://mcp.example.com/sse)"
          className="bg-background text-xs"
        />
        <Textarea
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          placeholder='Optional JSON config (e.g. {"key": "value"})'
          rows={2}
          className="bg-background text-xs font-mono resize-none"
        />
        <Button
          onClick={handleAdd}
          disabled={!name.trim() || !url.trim()}
          size="sm"
          className="bg-primary hover:bg-primary/90"
        >
          Add Server
        </Button>
      </div>
    </div>
  )
}
