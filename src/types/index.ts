export interface AuthResponse {
  token: string
  userId: number
  username: string
}

export interface MessageResponse {
  message: string
}

export interface InstanceResponse {
  message: string
  instanceName?: string
}

export interface Script {
  id: number
  name: string
  description?: string | null
  author?: string | null
  code: string
  codeSize?: number | null
  language?: string | null
  output: string | null
  outputSize?: number | null
  status: string
  saveResult?: boolean | null
  maxOutputSize?: number | null
  createdAt: string
  finishedAt: string | null
}

export interface ScriptExecution {
  id: number
  scriptId: number
  binaryId: number | null
  status: string | null
  output: string | null
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
}

export interface ScriptRunResponse {
  executionId: number
  scriptId: number
  binaryIds: number[]
  status: string
  message: string
}

export interface WorkflowStatus {
  id: string
  status: string
  progress: number
  successCount: number
  failCount: number
}

export interface QueryResponse {
  columns: string[]
  rows: any[][]
}

export interface FileResponse {
  message: string
  fileIds: number[]
}

// ---- Agent (chat) ----------------------------------------------------------

/**
 * Runtime state of an agent session. The backend stores this enum
 * in `agent_sessions.runtime_state` and mirrors the same value into
 * the `status` column for legacy views. `closed` is the only
 * "normal" terminal state (covers both successful close and user
 * cancel — the difference is captured in `closing_reason`);
 * `error` is the failure terminal state.
 */
export type AgentRuntimeState =
  | 'running'
  | 'standby'
  | 'msghandle'
  | 'cancelling'
  | 'closed'
  | 'error'

/**
 * Wire value for `status`. Under the new model the value mirrors
 * {@link AgentRuntimeState}; the legacy strings are accepted here
 * for tolerance during the migration window.
 */
export type AgentSessionStatus = AgentRuntimeState | 'completed' | 'cancelled' | 'failed' | 'active' | string

export interface AgentSession {
  sessionId: string
  sessionName: string | null
  status: AgentSessionStatus
  /** Same value as `status` — exposed for callers that want to be explicit. */
  runtimeState?: AgentSessionStatus | null
  modelName: string | null
  projectName?: string | null
  moduleName?: string | null
  createdAt: string | null
  updatedAt: string | null
  /**
   * Parent session id, set for child agents spawned by `spawn_sub_agent`.
   * Null for top-level sessions. The default session list filters these
   * out; the tree view uses it to render the parent → child graph.
   */
  parentSessionId?: string | null
}

export interface AgentMessage {
  messageId: number
  messageIndex: number
  role: 'user' | 'assistant' | string
  content: string | null
  createdAt: string | null
  toolName?: string
  toolResult?: string
}

/**
 * Summary of a sub-agent invocation returned by `spawn_sub_agent`.
 * Parsed from the tool result JSON.
 */
export interface SubAgentSummary {
  templateId?: string
  templateVersion?: string
  name?: string
  sessionId: string
  parentSessionId?: string
  depth?: number
  strategy?: string
  tools?: string[]
  iterations: number
  toolCalls: number
  stopReason: string
  totalInputTokens?: number
  totalOutputTokens?: number
  output: string
}

export interface GhidraProjectInfo {
  name: string
  sessionCount: number
  fileCount: number
}

export interface ChatTurnResponse {
  sessionId: string
  userMessage: AgentMessage
  assistantMessage: AgentMessage
  iterations: number
  tokenUsage: { input: number; output: number } | null
}
