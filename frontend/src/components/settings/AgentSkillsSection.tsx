import { useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useProjectStore } from '@/store/projectStore'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

export default function AgentSkillsSection() {
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState('')
  const [isInstalling, setIsInstalling] = useState(false)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const { getToken } = useAuth()

  const handleInstall = async () => {
    if (!command.trim() || !activeProjectId) return
    setIsInstalling(true)
    setOutput('')

    try {
      const token = await getToken()
      if (!token) return

      const result = await api.settings.installSkill(token, command, activeProjectId)
      setOutput(result.output || 'No output')
    } catch (e: any) {
      setOutput(`Error: ${e.message}`)
    } finally {
      setIsInstalling(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Install OpenCode agent skills by running the install command below.
        The command executes inside the active project's sandbox.
      </p>

      <div className="flex gap-2">
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="opencode skills install @opencode-ai/skill-react"
          className="font-mono text-xs bg-background"
        />
        <Button
          onClick={handleInstall}
          disabled={isInstalling || !activeProjectId || !command.trim()}
          className="bg-primary hover:bg-primary/90 shrink-0"
          size="sm"
        >
          {isInstalling ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Install'}
        </Button>
      </div>

      {output && (
        <pre className="bg-muted rounded-md p-3 text-xs font-mono text-green-400 max-h-40 overflow-y-auto whitespace-pre-wrap">
          {output}
        </pre>
      )}

      {!activeProjectId && (
        <p className="text-xs text-destructive">
          Select an active project first (sandbox must be running)
        </p>
      )}
    </div>
  )
}
