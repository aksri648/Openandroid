import { useMemo } from 'react'
import { FileCode2, FileJson, FileText, Palette, File, ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileTreeProps {
  files: string[]
  selectedFile: string | null
  onSelect: (path: string) => void
}

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
}

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return <FileCode2 className="h-4 w-4 text-blue-400" />
    case 'json':
      return <FileJson className="h-4 w-4 text-yellow-400" />
    case 'md':
      return <FileText className="h-4 w-4 text-gray-400" />
    case 'css':
    case 'scss':
      return <Palette className="h-4 w-4 text-pink-400" />
    default:
      return <File className="h-4 w-4 text-muted-foreground" />
  }
}

function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const filePath of files) {
    const parts = filePath.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isDir = i < parts.length - 1
      const fullPath = parts.slice(0, i + 1).join('/')

      const existing = current.find((n) => n.name === part)
      if (existing) {
        if (isDir) current = existing.children
      } else {
        const node: TreeNode = {
          name: part,
          path: fullPath,
          isDir,
          children: [],
        }
        current.push(node)
        if (isDir) current = node.children
      }
    }
  }

  return root
}

function TreeNodeComponent({
  node,
  selectedFile,
  onSelect,
  depth = 0,
}: {
  node: TreeNode
  selectedFile: string | null
  onSelect: (path: string) => void
  depth?: number
}) {
  const isActive = selectedFile === node.path

  if (node.isDir) {
    return (
      <div>
        <div className="flex items-center gap-1 py-0.5 px-2 text-xs text-muted-foreground">
          <ChevronDown className="h-3 w-3" />
          <span>{node.name}</span>
        </div>
        <div style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
          {node.children.map((child) => (
            <TreeNodeComponent
              key={child.path}
              node={child}
              selectedFile={selectedFile}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={() => onSelect(node.path)}
      className={cn(
        'flex items-center gap-1.5 py-0.5 px-2 text-xs cursor-pointer',
        isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
    </div>
  )
}

export default function FileTree({ files, selectedFile, onSelect }: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files])

  return (
    <div className="overflow-y-auto p-1">
      {tree.length === 0 ? (
        <p className="text-xs text-muted-foreground p-2">No files yet</p>
      ) : (
        tree.map((node) => (
          <TreeNodeComponent
            key={node.path}
            node={node}
            selectedFile={selectedFile}
            onSelect={onSelect}
          />
        ))
      )}
    </div>
  )
}
