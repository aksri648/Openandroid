import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useLogStore } from '@/store/logStore'
import { LogLine } from '@/types'
import { Button } from '@/components/ui/button'
import { Trash2, Copy, Pause, Play } from 'lucide-react'

const ANSI_COLORS: Record<string, string> = {
  system: '\x1b[36m',
  agent: '\x1b[37m',
  tool: '\x1b[33m',
  user: '\x1b[35m',
  error: '\x1b[31m',
  step: '\x1b[32m',
  debug: '\x1b[90m',
  done: '\x1b[32m\x1b[1m',
}

interface XtermPanelProps {
  projectId: string
  status: string
}

export default function XtermPanel({ projectId, status }: XtermPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [paused, setPaused] = useState(false)
  const bufferRef = useRef<string[]>([])
  const logs = useLogStore((s) => s.logs[projectId] || [])
  const lastLogCountRef = useRef(0)

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      theme: {
        background: '#0a0a0f',
        foreground: '#e2e8f0',
        cursor: '#a855f7',
        selectionBackground: '#7c3aed40',
        black: '#1e1e2e',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#cba6f7',
        cyan: '#89dceb',
        white: '#cdd6f4',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      convertEol: true,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminal.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const observer = new ResizeObserver(() => {
      fitAddon.fit()
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  // Write new logs to terminal
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return

    const newLogs = logs.slice(lastLogCountRef.current)
    lastLogCountRef.current = logs.length

    for (const line of newLogs) {
      if (line.level === 'ping') continue

      if (paused) {
        bufferRef.current.push(formatLine(line))
        continue
      }

      terminal.writeln(formatLine(line))
    }

    if (autoScroll && !paused) {
      terminal.scrollToBottom()
    }
  }, [logs, autoScroll, paused])

  const formatLine = (line: LogLine): string => {
    const color = ANSI_COLORS[line.level] || '\x1b[37m'
    const reset = '\x1b[0m'
    const prefix =
      line.level === 'done'
        ? `${color}\u2705 Complete${reset}`
        : `${color}${line.message}${reset}`
    return prefix
  }

  const handleClear = useCallback(() => {
    terminalRef.current?.clear()
  }, [])

  const handleCopyAll = useCallback(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    const buffer = terminal.buffer.active
    const lines: string[] = []
    for (let i = 0; i < buffer.length; i++) {
      lines.push(buffer.getLine(i)?.translateToString(true) || '')
    }
    navigator.clipboard.writeText(lines.join('\n'))
  }, [])

  const handleTogglePause = useCallback(() => {
    if (paused) {
      // Flush buffer
      const terminal = terminalRef.current
      if (terminal) {
        for (const line of bufferRef.current) {
          terminal.writeln(line)
        }
        if (autoScroll) terminal.scrollToBottom()
      }
      bufferRef.current = []
    }
    setPaused(!paused)
  }, [paused, autoScroll])

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <Button variant="ghost" size="icon" onClick={handleClear} className="h-7 w-7">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleCopyAll} className="h-7 w-7">
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleTogglePause} className="h-7 w-7">
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant={autoScroll ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setAutoScroll(!autoScroll)}
          className="h-7 text-[10px] ml-auto"
        >
          Auto-scroll
        </Button>
      </div>

      {/* Terminal */}
      <div ref={containerRef} className="flex-1 bg-[#0a0a0f] p-1 overflow-hidden" />

      {/* Status */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border shrink-0">
        <div
          className={`h-2 w-2 rounded-full ${
            status === 'done'
              ? 'bg-green-400'
              : status === 'failed'
              ? 'bg-red-400'
              : 'bg-purple-400 animate-pulse'
          }`}
        />
        <span className="text-[10px] text-muted-foreground">
          {status === 'done'
            ? 'Completed'
            : status === 'failed'
            ? 'Failed \u2014 check logs'
            : 'Agent running...'}
        </span>
      </div>
    </div>
  )
}
