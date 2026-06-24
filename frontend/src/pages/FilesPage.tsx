import { useState } from 'react'
import { useProjectStore } from '@/store/projectStore'
import FileTree from '@/components/files/FileTree'
import FileViewer from '@/components/files/FileViewer'

export default function FilesPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const projects = useProjectStore((s) => s.projects)
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  if (!activeProject) {
    return (
      <div className="flex flex-col h-full p-4">
        <h1 className="text-lg font-bold mb-4">Files</h1>
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No project selected
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-border shrink-0">
        <h1 className="text-sm font-medium">{activeProject.name}</h1>
        <p className="text-[10px] text-muted-foreground">Files</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* File tree panel */}
        <div className={`${selectedFile ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[30%] border-r border-border`}>
          <FileTree
            files={activeProject.fileTree || []}
            selectedFile={selectedFile}
            onSelect={setSelectedFile}
          />
        </div>

        {/* File content panel */}
        <div className={`${selectedFile ? 'flex' : 'hidden md:flex'} flex-1 flex-col`}>
          {selectedFile ? (
            <FileViewer
              projectId={activeProjectId!}
              filePath={selectedFile}
              onBack={() => setSelectedFile(null)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select a file to view
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
