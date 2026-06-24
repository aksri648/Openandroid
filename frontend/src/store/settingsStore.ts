import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { McpServer, LlmProvider } from '@/types'
import { api } from '@/lib/api'

interface SettingsStore {
  mcpServers: McpServer[]
  llmProviders: LlmProvider[]
  addMcpServer: (token: string, name: string, url: string, config: Record<string, unknown>) => Promise<void>
  removeMcpServer: (token: string, name: string) => Promise<void>
  fetchMcpServers: (token: string) => Promise<void>
  addLlmProvider: (token: string, provider: LlmProvider) => Promise<void>
  fetchLlmProviders: (token: string) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      mcpServers: [],
      llmProviders: [],

      addMcpServer: async (token, name, url, config) => {
        await api.settings.addMcp(token, name, url, config as Record<string, unknown>)
        set((state) => ({
          mcpServers: [...state.mcpServers, { name, url, config, status: 'unknown' as const }],
        }))
      },

      removeMcpServer: async (token, name) => {
        await api.settings.deleteMcp(token, name)
        set((state) => ({
          mcpServers: state.mcpServers.filter((s) => s.name !== name),
        }))
      },

      fetchMcpServers: async (token) => {
        try {
          const data = await api.settings.listMcp(token)
          set({ mcpServers: data.servers || [] })
        } catch (e) {
          console.error('Failed to fetch MCP servers:', e)
        }
      },

      addLlmProvider: async (token, provider) => {
        await api.settings.addLlm(token, provider)
        set((state) => ({
          llmProviders: [...state.llmProviders, provider],
        }))
      },

      fetchLlmProviders: async (token) => {
        try {
          const data = await api.settings.listLlm(token)
          set({ llmProviders: data.providers || [] })
        } catch (e) {
          console.error('Failed to fetch LLM providers:', e)
        }
      },
    }),
    { name: 'opencode-settings' },
  ),
)
