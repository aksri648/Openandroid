import { useState } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

const TOKEN = 'dev-token'

export default function LlmProvidersSection() {
  const { llmProviders, addLlmProvider } = useSettingsStore()
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; latency?: number; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleTest = async () => {
    if (!baseUrl || !apiKey || !model) return
    setTesting(true)
    setTestResult(null)

    try {
      const result = await api.settings.testLlm(TOKEN, baseUrl, apiKey, model)
      setTestResult({ ok: result.ok, latency: result.latency_ms, error: result.error })
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)

    try {
      await addLlmProvider(TOKEN, {
        provider_name: name,
        base_url: baseUrl,
        api_key: apiKey,
        model,
        is_default: isDefault,
      })
      setName('')
      setBaseUrl('')
      setApiKey('')
      setModel('')
      setIsDefault(false)
      setTestResult(null)
    } catch (e) {
      console.error('Failed to save:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {llmProviders.map((p) => (
        <div key={p.provider_name} className="bg-muted/50 rounded-md p-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium">{p.provider_name}</p>
            {p.is_default && (
              <Badge variant="default" className="text-[9px] h-4 px-1">DEFAULT</Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground font-mono truncate">{p.base_url}</p>
          <p className="text-[10px] text-muted-foreground">{p.model}</p>
        </div>
      ))}

      <div className="space-y-2 pt-2 border-t border-border">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Provider name (e.g. My Groq)"
          className="bg-background text-xs"
        />
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="Base URL (e.g. https://api.groq.com/openai/v1)"
          className="bg-background text-xs"
        />
        <Input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          type="password"
          placeholder="API Key"
          className="bg-background text-xs"
        />
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Model (e.g. llama-3.1-70b-versatile)"
          className="bg-background text-xs"
        />

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-border"
            />
            Set as default
          </label>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleTest}
            disabled={testing || !baseUrl || !apiKey || !model}
            size="sm"
            variant="outline"
            className="gap-1.5"
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Test Connection
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            size="sm"
            className="bg-primary hover:bg-primary/90"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Save
          </Button>
        </div>

        {testResult && (
          <div className={`flex items-center gap-1.5 text-xs ${testResult.ok ? 'text-green-400' : 'text-destructive'}`}>
            {testResult.ok ? (
              <>
                <CheckCircle className="h-3 w-3" />
                Connected ({testResult.latency}ms)
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3" />
                Failed: {testResult.error}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
