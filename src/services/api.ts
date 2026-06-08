import axios from 'axios'
import type {
  AuthResponse,
  MessageResponse,
  InstanceResponse,
  Script,
  ScriptExecution,
  ScriptRunResponse,
  WorkflowStatus,
  QueryResponse,
  AgentSession,
  AgentMessage,
  ChatTurnResponse
} from '@/types'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // Attach the user's instance selection to every request. The backend
  // requires this header for any route that talks to the daemon.
  // Reading from localStorage directly avoids a circular import with the
  // pinia store (which itself imports this module).
  const selectedInstance = localStorage.getItem('akibaSelectedInstance')
  if (selectedInstance) {
    config.headers['X-Akiba-Instance'] = selectedInstance
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  register: (username: string, password: string) =>
    api.post<AuthResponse>('/auth/register', { username, password }),
  login: (username: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { username, password }),
  logout: () => api.post<MessageResponse>('/auth/logout'),
  me: () => api.get<AuthResponse>('/auth/me')
}

export const instanceApi = {
  list: (probe?: string) =>
    api.get<{ instances: string[]; hint?: string }>('/instances', {
      params: probe ? { probe } : undefined
    }),
  create: (name: string) => api.post<InstanceResponse>('/instances/create', { name }),
  delete: (instanceName: string) =>
    api.post<InstanceResponse>('/instances/delete', { instanceName }),
  start: (instanceName: string) =>
    api.post<InstanceResponse>('/instances/start', { instanceName }),
  shutdown: (instanceName: string) =>
    api.post<InstanceResponse>('/instances/shutdown', { instanceName }),
  backup: (instanceName: string) =>
    api.post<{ message: string }>('/instances/backup', { instanceName })
}

export const scriptApi = {
  list: (limit = 100, offset = 0) =>
    api.get<{ scripts: Script[] }>('/scripts', { params: { limit, offset } }),
  get: (id: number) => api.get<Script>(`/scripts/${id}`),
  create: (payload: {
    name: string
    code: string
    description?: string
    language?: string
    saveResult?: boolean
    maxOutputSize?: number
  }) => api.post<Script>('/scripts', payload),
  update: (
    id: number,
    payload: Partial<{
      name: string
      description: string
      code: string
      language: string
      saveResult: boolean
      maxOutputSize: number
    }>
  ) => api.put<Script>(`/scripts/${id}`, payload),
  run: (id: number, binaryIds: number[] = [], parallel = true) =>
    api.post<ScriptRunResponse>(`/scripts/${id}/run`, { binaryIds, parallel }),
  delete: (id: number) => api.delete<{ message: string }>(`/scripts/${id}`),
  executions: (id: number) =>
    api.get<{ executions: ScriptExecution[] }>(`/scripts/${id}/executions`),
  getExecution: (executionId: number) =>
    api.get<ScriptExecution>(`/executions/${executionId}`)
}

export const agentApi = {
  listSessions: (limit = 50, offset = 0) =>
    api.get<{ sessions: AgentSession[] }>('/agent/sessions', {
      params: { limit, offset }
    }),
  createSession: (payload: { sessionName?: string; systemPrompt?: string; modelName?: string } = {}) =>
    api.post<AgentSession>('/agent/sessions', payload),
  getMessages: (sessionId: string) =>
    api.get<{ messages: AgentMessage[] }>(`/agent/sessions/${sessionId}/messages`),
  chat: (sessionId: string, content: string, systemPrompt?: string) =>
    api.post<ChatTurnResponse>(`/agent/sessions/${sessionId}/chat`, {
      content,
      systemPrompt
    }),
  deleteSession: (sessionId: string) =>
    api.delete<{ message: string }>(`/agent/sessions/${sessionId}`)
}

export const workflowApi = {
  start: (instanceName: string, configPath?: string, threads?: number) =>
    api.post<{ workflowId: string; message: string }>('/workflow/start', {
      instanceName,
      configPath,
      threads
    }),
  stop: (workflowId: string) =>
    api.post<{ workflowId: string; message: string }>(`/workflow/stop/${workflowId}`),
  status: (workflowId: string) => api.get<WorkflowStatus>(`/workflow/status/${workflowId}`),
  running: () => api.get<{ workflows: WorkflowStatus[] }>('/workflow/running'),
  history: () => api.get<{ workflows: WorkflowStatus[] }>('/workflow/history')
}

export interface FileEntry {
  id: number
  name: string
  type: string
  arch?: string
  checksum: string
  compilerSpec?: string
  originalPath?: string
}

export interface FileListResponse {
  files: FileEntry[]
  total: number
  offset: number
  limit: number
}

export const fileApi = {
  import: (formData: FormData) =>
    api.post<{ message: string; fileIds: number[] }>('/files/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  list: (offset = 0, limit = 20) =>
    api.get<FileListResponse>('/files', { params: { offset, limit } }),
  search: (query: string) =>
    api.get<{ files: FileSearchResult[]; query: string }>('/files/search', {
      params: { q: query }
    }),
  delete: (fileIds: number[]) =>
    api.delete<{ message: string }>('/files', { data: { fileIds } })
}

export interface FileSearchResult {
  id: number
  name: string
  originalPath?: string
  arch?: string | null
  format?: string | null
  compilerSpec?: string | null
  checksum?: string | null
}

export const queryApi = {
  execute: (sql: string, instanceName?: string) =>
    api.post<QueryResponse>('/query', { sql, instanceName }),
  history: () => api.get<{ message: string }>('/query/history')
}

export const healthApi = {
  check: () => api.get<{ status: string }>('/health')
}

// ---- LLM runtime configuration --------------------------------------------

export interface LLMProviderInfo {
  id: string
  displayName: string
  openAICompatible: boolean
}

export interface StoredKeyEntry {
  provider: string
  modelNames: string[]
  baseUrl: string | null
}

export interface LLMConfigPayload {
  provider: string
  modelName: string
  apiKey: string
  baseUrl?: string
}

export const llmConfigApi = {
  providers: () =>
    api.get<{ providers: LLMProviderInfo[] }>('/llm/providers'),
  keys: () => api.get<{ keys: StoredKeyEntry[] }>('/llm/keys'),
  addKey: (payload: LLMConfigPayload) =>
    api.post<{ message: string }>('/llm/keys', payload),
  deleteKey: (provider: string, modelName: string) =>
    api.delete<{ message: string }>('/llm/keys', { params: { provider, modelName } }),
  fetchModels: (provider: string, apiKey: string, baseUrl?: string) =>
    api.get<{ models: string[] }>('/llm/models', { params: { provider, baseUrl, apiKey } })
}

// ---- Runtime configuration --------------------------------------------------

export interface RuntimeConfigEntry {
  name: string
  description?: string
  json: string
  updatedAt: string
}

export const runtimeConfigApi = {
  list: () => api.get<{ configs: RuntimeConfigEntry[] }>('/runtime-configs'),
  get: (name: string) => api.get<RuntimeConfig>(`/runtime-configs/${name}`),
  save: (payload: { name: string; description?: string; json: string }) =>
    api.put<{ message: string }>('/runtime-configs', payload),
  delete: (name: string) =>
    api.delete<{ message: string }>(`/runtime-configs/${name}`)
}

export interface RuntimeConfig {
  name: string
  description?: string
  json: string
  updatedAt: string
}

export default api