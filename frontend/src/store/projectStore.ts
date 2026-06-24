import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Project } from '@/types'
import { api } from '@/lib/api'

interface ProjectStore {
  projects: Project[]
  activeProjectId: string | null
  setActiveProject: (id: string) => void
  addProject: (project: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  removeProject: (id: string) => void
  fetchProjects: (token: string) => Promise<void>
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,

      setActiveProject: (id) => set({ activeProjectId: id }),

      addProject: (project) =>
        set((state) => ({
          projects: [project, ...state.projects],
        })),

      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),

      removeProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        })),

      fetchProjects: async (token) => {
        try {
          const data = await api.projects.list(token)
          set({ projects: data.projects || [] })
        } catch (e) {
          console.error('Failed to fetch projects:', e)
        }
      },
    }),
    { name: 'opencode-projects' },
  ),
)
