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
  ChatTurnResponse,
  ConversationSummary,
  ConversationMessage
} from '@/types'

const api = axios.create({
  baseURL: '/api',
  timeout: 720000, // 12 min — lets the backend's 10 min agent timeout respond first
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
  list: (limit = 100, offset = 0, query?: string) =>
    api.get<{ scripts: Script[] }>('/scripts', { params: { limit, offset, query } }),
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
  listSessions: (limit = 50, offset = 0, parentSessionId?: string | null) =>
    api.get<{ sessions: AgentSession[] }>('/agent/sessions', {
      params: {
        limit,
        offset,
        // The backend interprets a missing/empty `parentSessionId`
        // as "top-level only" (see AgentOps.ListSessions: `null` →
        // `parent_session_id IS NULL`), a literal `'ALL'` as "every
        // session", and anything else as a UUID filter.
        //
        // IMPORTANT: we must NOT serialise `undefined` as the string
        // `"null"`, otherwise the daemon would try to use `"null"` as
        // a UUID and fail.  We also must not serialise `null` as the
        // string `"null"`.  We only add the param when the caller
        // provided a value (i.e. `parentSessionId` is not
        // `undefined`).
        ...(parentSessionId !== undefined && { parentSessionId })
      }
    }),
  /**
   * Fetch a single session by id.  Used by the frontend to poll
   * the active session's status without re-downloading the full
   * list (the existing list poll would return up to 200 rows).  The
   * `status` field is what feeds the status pill in the chat
   * header and the badge in the session list.
   */
  getSession: (sessionId: string) =>
    api.get<AgentSession>(`/agent/sessions/${sessionId}`),
  listChildren: (parentSessionId: string) =>
    api.get<{ children: AgentSession[] }>(`/agent/sessions/${parentSessionId}/children`),
  createSession: (payload: {
    sessionName?: string
    systemPrompt?: string
    modelName?: string
    binaryId?: number
    projectName?: string
    projectMode?: 'new' | 'existing'
    parentSessionId?: string
  } = {}) =>
    api.post<AgentSession>('/agent/sessions', payload),
  getMessages: (sessionId: string) =>
    api.get<{ messages: AgentMessage[]; totalInputTokens?: number; totalOutputTokens?: number; lastInputTokens?: number; contextLength?: number }>(`/agent/sessions/${sessionId}/messages`),
  chat: (sessionId: string, content: string, systemPrompt?: string) =>
    api.post<ChatTurnResponse>(`/agent/sessions/${sessionId}/chat`, {
      content,
      systemPrompt
    }),
  deleteSession: (sessionId: string) =>
    api.delete<{ message: string }>(`/agent/sessions/${sessionId}`),
  /**
   * Download a session's transcript as Markdown.
   *
   * - `scope=self` (default): legacy behaviour, returns just the requested
   *   session's transcript — useful when the user wants only their own
   *   session and no sub-agents.
   * - `scope=tree`: returns a Markdown document containing the full
   *   agent tree (root + every descendant) with per-layer statistics
   *   and one peer section per agent.
   */
  exportSession: (sessionId: string, scope: 'self' | 'tree' = 'self') =>
    api.get(`/agent/sessions/${sessionId}/export`, {
      params: { scope },
      responseType: 'blob'
    }),
  /**
   * List all conversations (mailbox threads) the session is a
   * participant in.  Used by the right-side conversation panel.
   */
  listConversations: (sessionId: string, status?: 'all' | 'active' | 'closed') =>
    api.get<{ sessionId: string; totalConversations: number; returned: number; conversations: ConversationSummary[] }>(
      `/agent/sessions/${sessionId}/conversations`,
      { params: { status: status ?? 'all' } }
    ),
  /**
   * Fetch the full message history of a single conversation.
   */
  getConversation: (sessionId: string, conversationId: number | string) =>
    api.get<{ conversationId: number; messageCount: number; messages: ConversationMessage[] }>(
      `/agent/sessions/${sessionId}/conversations/${conversationId}`
    ),
}

export const workflowApi = {
  projects: () => api.get<{ projects: string[] }>('/workflow/projects'),
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
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0
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

export const projectApi = {
  list: () => api.get<{ projects: import('@/types').GhidraProjectInfo[] }>('/projects'),
  exportProject: (name: string) =>
    api.get(`/projects/${encodeURIComponent(name)}/export`, { responseType: 'blob' }),
  exportTextStatus: (name: string) =>
    api.get<ExportTextStatus>(`/projects/${encodeURIComponent(name)}/export_text/status`),
  exportText: (name: string, options: ExportTextRequest) =>
    api.post(`/projects/${encodeURIComponent(name)}/export_text`, options, { responseType: 'blob' }),
}

export interface ExportTextStatus {
  projectName: string
  projectExists: boolean
  state: string  // "available" | "in_use" | "project_not_found"
  activeProject: string | null
  reasons: ExportTextReason[]
  hints: string[]
  agentSessionsChecked: boolean
}

export interface ExportTextReason {
  code: string
  activeProject?: string | null
  workflows?: Array<Record<string, string | null>>
  sessions?: Array<Record<string, string | null>>
}

export interface ExportTextRequest {
  format?: string
  contents?: string[]
  includeComments?: boolean
  includeEolComment?: boolean
  includePlateComment?: boolean
  includePreComment?: boolean
  includePostComment?: boolean
  includeRepeatableComment?: boolean
  includeDecompile?: boolean
  decompileTimeoutSec?: number
  includeData?: boolean
  includeUndefined?: boolean
  functionFilter?: string | null
  addressFilter?: { start: string; end: string } | null
  maxFunctions?: number
  maxFunctionSize?: number
  sortBy?: string
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

export interface SkillFileInfo {
  path: string
  size: number
  description?: string | null
}

export interface SkillInfo {
  id: string
  name: string
  version?: string | null
  description: string
  entry: string
  tags: string[]
  triggers: string[]
  files: SkillFileInfo[]
  path?: string | null
}

export interface SkillReadResult {
  skill: SkillInfo
  content: string
  truncated: boolean
  path?: string | null
}

export const skillApi = {
  list: () => api.get<{ skills: SkillInfo[] }>('/skills'),
  upload: (formData: FormData) =>
    api.post<{ message: string; skill: SkillInfo }>('/skills/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  read: (skillId: string, maxChars = 20000) =>
    api.get<SkillReadResult>(`/skills/${encodeURIComponent(skillId)}`, { params: { maxChars } }),
  readFile: (skillId: string, path: string, maxChars = 20000) =>
    api.get<SkillReadResult>(`/skills/${encodeURIComponent(skillId)}/file`, { params: { path, maxChars } }),
  delete: (skillId: string) => api.delete<{ message: string }>(`/skills/${encodeURIComponent(skillId)}`)
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
  id: string
  provider: string
  modelNames: string[]
  baseUrl: string | null
}

export interface LLMConfigPayload {
  provider: string
  modelNames: string[]
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