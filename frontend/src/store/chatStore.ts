import { create } from 'zustand'
import { ChatMessage } from '@/types'
import { api } from '@/lib/api'

interface ChatStore {
  messages: Record<string, ChatMessage[]>
  addMessage: (projectId: string, message: ChatMessage) => void
  setMessages: (projectId: string, messages: ChatMessage[]) => void
  fetchMessages: (token: string, projectId: string) => Promise<void>
}

export const useChatStore = create<ChatStore>()((set) => ({
  messages: {},

  addMessage: (projectId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [projectId]: [...(state.messages[projectId] || []), message],
      },
    })),

  setMessages: (projectId, messages) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [projectId]: messages,
      },
    })),

  fetchMessages: async (token, projectId) => {
    try {
      const data = await api.chat.getMessages(token, projectId)
      set((state) => ({
        messages: {
          ...state.messages,
          [projectId]: data.messages || [],
        },
      }))
    } catch (e) {
      console.error('Failed to fetch messages:', e)
    }
  },
}))
