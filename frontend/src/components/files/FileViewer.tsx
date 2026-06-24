import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { api } from '@/lib/api'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FileViewerProps {
  projectId: string
  filePath: string
  onBack: () => void
}

function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
  }
  return map[ext] || 'text'
}

export default function FileViewer({ projectId, filePath, onBack }: FileViewerProps) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [highlighted, setHighlighted] = useState('')
  const { getToken } = useAuth()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    getToken().then((token) => {
      if (!token || cancelled) return
      api.files
        .getContent(token, projectId, filePath)
        .then((data) => {
          if (cancelled) return
          setContent(data.content)
          setLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          setError(true)
          setLoading(false)
        })
    })

    return () => {
      cancelled = true
    }
  }, [projectId, filePath])

  useEffect(() => {
    if (!content) return
    let cancelled = false

    import('shiki').then((shiki) => {
      shiki
        .createHighlighter({
          themes: ['github-dark'],
          langs: [getLanguage(filePath)],
        })
        .then((highlighter) => {
          if (cancelled) return
          const html = highlighter.codeToHtml(content, {
            lang: getLanguage(filePath),
            theme: 'github-dark',
          })
          setHighlighted(html)
          highlighter.dispose()
        })
        .catch(() => {
          if (cancelled) setHighlighted(`<pre>${content}</pre>`)
        })
    })

    return () => {
      cancelled = true
    }
  }, [content, filePath])

  const filename = filePath.split('/').pop() || filePath
  const lang = getLanguage(filePath)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-6 w-6 md:hidden">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-medium truncate">{filePath}</span>
        <span className="text-[10px] text-muted-foreground ml-auto px-1.5 py-0.5 bg-muted rounded">
          {lang}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-destructive text-sm">
            Could not load file
          </div>
        ) : highlighted ? (
          <div
            className="text-xs [&_pre]:bg-transparent [&_pre]:p-0 [&_code]:font-mono"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <pre className="text-xs font-mono whitespace-pre-wrap">{content}</pre>
        )}
      </div>
    </div>
  )
}
