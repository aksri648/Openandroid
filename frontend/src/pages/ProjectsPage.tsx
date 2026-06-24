import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { useProjectStore } from '@/store/projectStore'
import { useLogStore } from '@/store/logStore'
import ProjectCard from '@/components/projects/ProjectCard'
import NewProjectModal from '@/components/projects/NewProjectModal'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function ProjectsPage() {
  const { projects, fetchProjects } = useProjectStore()
  const { getToken } = useAuth()
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    getToken().then((t) => {
      if (t) fetchProjects(t)
    })
  }, [])

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">My Projects</h1>
        <button
          onClick={() => setShowNew(true)}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium"
        >
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center mt-20 text-muted-foreground">
          <p className="text-sm">No projects yet</p>
          <p className="text-xs mt-1">Start your first project</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      <NewProjectModal open={showNew} onOpenChange={setShowNew} />
    </div>
  )
}
