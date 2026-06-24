import { useProjectStore } from '@/store/projectStore'
import DownloadCard from '@/components/download/DownloadCard'

export default function DownloadPage() {
  const projects = useProjectStore((s) => s.projects)
  const downloadable = projects.filter((p) => p.zipReady)

  return (
    <div className="flex flex-col h-full p-4">
      <h1 className="text-lg font-bold mb-4">Downloads</h1>

      {downloadable.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No downloads available
        </div>
      ) : (
        <div className="space-y-2">
          {downloadable.map((p) => (
            <DownloadCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  )
}
