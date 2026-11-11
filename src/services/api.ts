import axios from 'axios'
import type {
  AuthResponse,
  MessageResponse,
  InstanceResponse,
  InstanceSummary,
  BackupSummary,
  Script,
  ScriptExecution,
  ScriptRunResponse,
  WorkflowStatus,
  QueryResponse,
  AgentSession,
  AgentMessage,
  ChatTurnResponse,
  ConversationSummary,
  ConversationMessage,
  PendingConfirmation,
  PendingUserChoice
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
    // A rejected sign-in is *not* an expired session. Bouncing it through
    // `window.location.href` reloaded the login page before the server's message
    // — wrong credentials, or "account locked" — could be displayed, which also
    // made failed attempts look instantaneous. The login view renders the error
    // itself, so only other endpoints redirect here.
    const url: string = error.config?.url || ''
    const isSignInEndpoint = url.includes('/auth/login') || url.includes('/auth/setup')
    if (error.response?.status === 401 && !isSignInEndpoint) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  /**
   * Whether the deployment still needs its first administrator. The login page
   * shows the setup form instead of the login form while this is true.
   */
  setupStatus: () =>
    api.post<{ needsSetup: boolean; userCount: number }>('/auth/setup-status'),
  /** Set the operator password. Server-side only allowed while none exists. */
  setup: (password: string) =>
    api.post<AuthResponse>('/auth/setup', { password }),
  login: (password: string) =>
    api.post<AuthResponse>('/auth/login', { password }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<MessageResponse>('/auth/password', { currentPassword, newPassword }),
  logout: () => api.post<MessageResponse>('/auth/logout'),
  me: () => api.get<AuthResponse>('/auth/me')
}


export const instanceApi = {
  /**
   * Instances owned by the signed-in user (the daemon is authoritative).
   *
   * `backupInProgress` names the instances with a backup/restore running right
   * now, so "Back up" can be disabled instead of being clicked into a refusal.
   */
  list: () =>
    api.get<{ instances: InstanceSummary[]; username?: string; backupInProgress?: string[] }>(
      '/instances'
    ),
  create: (name: string) => api.post<InstanceResponse>('/instances/create', { name }),
  delete: (instanceName: string) =>
    api.post<InstanceResponse>('/instances/delete', { instanceName }),
  start: (instanceName: string) =>
    api.post<InstanceResponse>('/instances/start', { instanceName }),
  shutdown: (instanceName: string) =>
    api.post<InstanceResponse>('/instances/shutdown', { instanceName }),
  backup: (payload: { instanceName: string; alias?: string; description?: string; isFull?: boolean }) =>
    api.post<{ message: string; label?: string }>('/instances/backup', payload),
  /**
   * Backups available for an instance, newest state included.
   *
   * `busy` is true while a backup/restore of that instance is running — the UI
   * keeps "Back up" disabled until it clears.
   */
  backups: (instanceName: string) =>
    api.get<{ instance: string; backups: BackupSummary[]; busy?: boolean }>('/instances/backups', {
      params: { instance: instanceName }
    }),
  /**
   * Restore an instance to a backup. `confirm` must be true: the server refuses
   * an unacknowledged restore so a stray click cannot roll back data.
   */
  restore: (instanceName: string, backup: string, confirm = true) =>
    api.post<{ message: string }>('/instances/restore', { instanceName, backup, confirm })
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
  /**
   * Search top-level sessions by title and message content.  A
   * sub-agent hit is reported as its root session, so results can be
   * intersected directly with the top-level session list.
   */
  searchSessions: (query: string, limit = 50) =>
    api.get<{ sessions: AgentSession[] }>('/agent/sessions/search', {
      params: { q: query, limit }
    }),
  listChildren: (parentSessionId: string) =>
    api.get<{ children: AgentSession[] }>(`/agent/sessions/${parentSessionId}/children`),
  createSession: (payload: {
    sessionName?: string
    systemPrompt?: string
    modelName?: string
    binaryId?: number
    projectName?: string
    projectMode?: 'new' | 'existing'
    programName?: string
    parentSessionId?: string
  } = {}) =>
    api.post<AgentSession>('/agent/sessions', payload),
  getMessages: (sessionId: string) =>
    api.get<{ messages: AgentMessage[]; totalInputTokens?: number; totalOutputTokens?: number; lastInputTokens?: number; contextLength?: number }>(`/agent/sessions/${sessionId}/messages`),
  chat: (sessionId: string, content: string, systemPrompt?: string, modelName?: string) =>
    api.post<ChatTurnResponse>(`/agent/sessions/${sessionId}/chat`, {
      content,
      systemPrompt,
      // A non-empty modelName tells the backend to persist a manual
      // model switch for this session (validated against the
      // configured keys) before running the turn.
      ...(modelName ? { modelName } : {})
    }),
  inject: (sessionId: string, message: string, transient: boolean = false) =>
    api.post<{ status: string; sessionId: string; transient: boolean; runtimeState: string; resumed: boolean; hint: string }>(
      `/agent/sessions/${sessionId}/inject`,
      { message, transient }
    ),
  pause: (sessionId: string) =>
    api.post<{ status: string; sessionId: string }>(`/agent/sessions/${sessionId}/pause`),
  resume: (sessionId: string) =>
    api.post<{ status: string; sessionId: string }>(`/agent/sessions/${sessionId}/resume`),
  cancelChat: (sessionId: string) =>
    api.post<{ status: string; sessionId: string }>(`/agent/sessions/${sessionId}/cancel-chat`),
  retryNow: (sessionId: string) =>
    api.post<{ status: string; sessionId: string }>(`/agent/sessions/${sessionId}/retry-now`),
  /**
   * Incremental poll for live LLM streaming chunks.  `since` is the last
   * `seq` already applied; the backend returns only chunks with a greater
   * seq.  `generation` bumps whenever a new LLM generation starts (the
   * caller discards its accumulated text then, but keeps its seq cursor —
   * the counter never restarts).
   */
  getStreamChunks: (sessionId: string, since: number) =>
    api.get<{
      active: boolean
      generation: number
      latestSeq: number
      latestCount: number
      done: boolean
      error?: string | null
      chunks: Array<{
        seq: number
        delta: string
        chunkCount: number
        byteCount: number
        done: boolean
        error?: string | null
        /** `text` for answer deltas, `tool_start` / `tool_end` for tool events. */
        kind?: string
      }>
    }>(`/agent/sessions/${sessionId}/stream-chunks`, { params: { since } }),
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
  /**
   * Respond to a pending tool-confirmation request for this session.
   *
   * When `pendingConfirmation` is present on the session (detected via
   * `getSession`), the frontend shows a modal. The user clicks Approve
   * or Deny, which calls this endpoint to deliver the decision to the
   * blocked tool thread.
   */
  respondConfirmation: (sessionId: string, approved: boolean) =>
    api.post<{ status: string; sessionId: string; approved: boolean; message: string }>(
      `/agent/sessions/${sessionId}/confirmation/respond`,
      { approved }
    ),
  /**
   * Snapshot of EVERY session that currently has a pending tool
   * confirmation, keyed by sessionId.
   *
   * The per-session `getSession` poll only returns the confirmation
   * for the session the user is currently viewing.  When a sub-agent
   * is the one blocked on a confirmation, the user on the root
   * session never sees the modal and the request times out silently
   * — the worker process's stdout is captured into a per-worker log
   * file, which the user sees as "the request was redirected to
   * stdio".  Polling this endpoint from a top-level interval lets the
   * frontend surface a single global modal for any session, regardless
   * of which one the user is currently looking at.
   */
  listPendingConfirmations: () =>
    api.get<{ pending: Record<string, PendingConfirmation> }>(
      '/agent/pending-confirmations'
    ),
  /**
   * Snapshot of every session with a pending `ask_user_choice` request,
   * keyed by sessionId. Same rationale as `listPendingConfirmations`:
   * a sub-agent may be the one waiting while the user views another session.
   */
  listPendingUserChoices: () =>
    api.get<{ pending: Record<string, PendingUserChoice> }>(
      '/agent/pending-user-choices'
    ),
  /**
   * Deliver the user's answer to a pending `ask_user_choice` request:
   * the selected option or custom text as `choice`, or `cancelled: true`
   * when dismissed without answering.
   */
  respondUserChoice: (sessionId: string, choice: string | null, cancelled = false) =>
    api.post<{ status: string; sessionId: string; answered: boolean; message: string }>(
      `/agent/sessions/${sessionId}/user-choice/respond`,
      { choice, cancelled }
    ),
  /**
   * Ask a follow-up ("BTW") question while an `ask_user_choice` request
   * is pending. Suspends server-side until the side assistant answers
   * (up to ~4 min); also refreshes the request's inactivity timeout.
   */
  askUserChoiceBtw: (sessionId: string, question: string) =>
    api.post<{ answered: boolean; answer?: string; error?: string }>(
      `/agent/sessions/${sessionId}/user-choice/btw`,
      { question }
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
  /** Folder tree of a project (Ghidra projects are folder trees, not flat lists). */
  tree: (projectName: string) =>
    api.get<{ entries: { path: string; name: string; folder: boolean; size: number }[]; stale: boolean }>(
      `/projects/${encodeURIComponent(projectName)}/tree`),
  createFolder: (projectName: string, parentPath: string, name: string) =>
    api.post<{ status: string }>(`/projects/${encodeURIComponent(projectName)}/folders`, { path: parentPath, name }),
  renameEntry: (projectName: string, path: string, newName: string) =>
    api.patch<{ status: string }>(`/projects/${encodeURIComponent(projectName)}/entries`, { path, newName }),
  deleteEntry: (projectName: string, path: string) =>
    api.delete<{ status: string }>(`/projects/${encodeURIComponent(projectName)}/entries?path=${encodeURIComponent(path)}`),
  programs: (projectName: string) =>
    api.get<{ programs: { name: string; path: string }[] }>(`/projects/${encodeURIComponent(projectName)}/programs`),
  exportProject: (name: string) =>
    api.get(`/projects/${encodeURIComponent(name)}/export`, { responseType: 'blob' }),
  exportWorkspace: (name: string) =>
    api.get(`/projects/${encodeURIComponent(name)}/export_workspace`, { responseType: 'blob' }),
  /** Import a binary from the selected instance into a project folder. */
  importBinary: (name: string, payload: { binaryId: string; folder?: string; asName?: string }) =>
    api.post<{ target: string; program: string; folder: string }>(
      `/projects/${encodeURIComponent(name)}/programs/import`,
      payload
    ),
  /**
   * Import a `.gar` (Ghidra Archive) as a standalone project. The backend
   * extracts the archive, registers every program in the binaries table
   * (hash-deduped), and renames programs to `<id>-<originalName>`.
   */
  importGar: (file: File, projectName?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (projectName) form.append('projectName', projectName)
    return api.post('/projects/import-gar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0, // import can take a while for large archives
    })
  },
  renameProject: (name: string, newName: string) =>
    api.patch<{ name: string; renamed: boolean }>(`/projects/${encodeURIComponent(name)}`, { newName }),
  deleteProject: (name: string, deleteLogs: boolean = false, deleteAgentSessions: boolean = false, deleteWorkspace: boolean = false) =>
    api.delete(`/projects/${encodeURIComponent(name)}`, {
      params: { deleteLogs, deleteAgentSessions, deleteWorkspace },
    }),
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
  /** Explicit context window per model, in tokens; missing = built-in table. */
  contextLengths?: Record<string, number>
}

/** Effective window for a model: what applies, why, and the built-in value. */
export interface ModelContextLengthInfo {
  contextLength: number
  source: 'configured' | 'table' | 'default'
  tableLength: number
}

export interface LLMConfigPayload {
  provider: string
  modelNames: string[]
  /** Blank keeps the stored key of an existing (provider, baseUrl) entry. */
  apiKey: string
  baseUrl?: string
  /** Authoritative for the models listed: omit a model to fall back to the table. */
  contextLengths?: Record<string, number>
}

export const llmConfigApi = {
  providers: () =>
    api.get<{ providers: LLMProviderInfo[] }>('/llm/providers'),
  keys: () => api.get<{ keys: StoredKeyEntry[] }>('/llm/keys'),
  addKey: (payload: LLMConfigPayload) =>
    api.post<{ message: string }>('/llm/keys', payload),
  deleteKey: (provider: string, modelName: string) =>
    api.delete<{ message: string }>('/llm/keys', { params: { provider, modelName } }),
  contextLengths: (modelNames: string[]) =>
    api.get<{ contextLengths: Record<string, ModelContextLengthInfo> }>('/llm/context-lengths', {
      params: { modelNames: modelNames.join(',') }
    }),
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

// ---- Module jar management -------------------------------------------------

export interface ModuleEntry {
  mainClassName: string
  jarFileName: string
  /** null for public modules; the owning username for private modules */
  owner: string | null
  jarPath: string
}

export const moduleApi = {
  list: () => api.get<{ modules: ModuleEntry[] }>('/modules'),
  upload: (formData: FormData) =>
    api.post<{ message: string; module: ModuleEntry }>('/modules/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
    }),
  delete: (jarFileName: string) =>
    api.delete<{ message: string }>(`/modules/${encodeURIComponent(jarFileName)}`),
}

// ---- Auto-update ------------------------------------------------------------

export interface UpdateStatus {
  lastCheck: string | null
  currentVersion: string | null
  latestVersion: string | null
  updateAvailable: boolean
  stagedArtifacts: string[]
  error: string | null
}

export const updateApi = {
  getStatus: () => api.get<UpdateStatus>('/update/status'),
  check: () => api.post<UpdateStatus>('/update/check'),
}