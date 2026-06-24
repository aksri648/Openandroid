const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function authFetch(path: string, options: RequestInit = {}, token: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(error.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  projects: {
    create: (token: string, name: string, prompt: string, approvalMode: boolean = true) =>
      authFetch('/api/projects/create', {
        method: 'POST',
        body: JSON.stringify({ name, prompt, approval_mode: approvalMode }),
      }, token),
    list: (token: string) => authFetch('/api/projects/list', {}, token),
    get: (token: string, id: string) => authFetch(`/api/projects/${id}`, {}, token),
    delete: (token: string, id: string) => authFetch(`/api/projects/${id}`, { method: 'DELETE' }, token),
    approve: (token: string, projectId: string, actionId: string, modifiedContent?: string) =>
      authFetch(`/api/projects/${projectId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ action_id: actionId, modified_content: modifiedContent || null }),
      }, token),
    reject: (token: string, projectId: string, actionId: string, reason: string = '') =>
      authFetch(`/api/projects/${projectId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ action_id: actionId, reason }),
      }, token),
    pendingApprovals: (token: string, projectId: string) =>
      authFetch(`/api/projects/${projectId}/pending-approvals`, {}, token),
  },
  chat: {
    sendMessage: (token: string, projectId: string, text: string) =>
      authFetch(`/api/chat/${projectId}/message`, { method: 'POST', body: JSON.stringify({ text }) }, token),
    getMessages: (token: string, projectId: string) =>
      authFetch(`/api/chat/${projectId}/messages`, {}, token),
  },
  files: {
    getTree: (token: string, projectId: string) => authFetch(`/api/files/${projectId}/tree`, {}, token),
    getContent: (token: string, projectId: string, path: string) =>
      authFetch(`/api/files/${projectId}/content?path=${encodeURIComponent(path)}`, {}, token),
    downloadUrl: (projectId: string) => `${BASE_URL}/api/files/${projectId}/download`,
  },
  settings: {
    installSkill: (token: string, command: string, projectId: string) =>
      authFetch('/api/settings/skills/install', { method: 'POST', body: JSON.stringify({ command, project_id: projectId }) }, token),
    addMcp: (token: string, name: string, url: string, config: Record<string, unknown>) =>
      authFetch('/api/settings/mcp/add', { method: 'POST', body: JSON.stringify({ name, url, config }) }, token),
    listMcp: (token: string) => authFetch('/api/settings/mcp/list', {}, token),
    deleteMcp: (token: string, name: string) =>
      authFetch(`/api/settings/mcp/${name}`, { method: 'DELETE' }, token),
    addLlm: (token: string, provider: object) =>
      authFetch('/api/settings/llm/add', { method: 'POST', body: JSON.stringify(provider) }, token),
    listLlm: (token: string) => authFetch('/api/settings/llm/list', {}, token),
    testLlm: (token: string, baseUrl: string, apiKey: string, model: string) =>
      authFetch('/api/settings/llm/test', { method: 'POST', body: JSON.stringify({ base_url: baseUrl, api_key: apiKey, model }) }, token),
  },
}
