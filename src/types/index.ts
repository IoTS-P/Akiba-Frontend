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
  | 'paused'
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
  /** Lifecycle declared at spawn time (`one_shot` or `standby`). */
  lifecycle?: string | null
  modelName: string | null
  projectName?: string | null
  moduleName?: string | null
  createdAt: string | null
  updatedAt: string | null
  /**
   * Human-readable reason captured when the session entered a
   * terminal / error state. Populated by the backend whenever
   * `runtime_state` transitions to `closed` / `error` / `cancelled`.
   * The frontend surfaces this as an error banner when the
   * session is in an `error` state.
   */
  closingReason?: string | null
  /**
   * Convenience alias for error displays. The backend fills this
   * with the same value as [closingReason] when
   * `runtimeState == "error"`, and `null` otherwise. Kept as a
   * separate field so the frontend does not need to re-derive
   * the "is this an error reason?" predicate.
   */
  errorMessage?: string | null
  /**
   * Parent session id, set for child agents spawned by `spawn_sub_agent`.
   * Null for top-level sessions. The default session list filters these
   * out; the tree view uses it to render the parent → child graph.
   */
  parentSessionId?: string | null
  /**
   * Pending human-confirmation request for this session, if any.
   *
   * Populated when a tool (e.g. `run_shell`) is blocked waiting for
   * the user to approve/deny an action. The frontend detects this
   * via the existing session status poll and shows a confirmation
   * modal. `null`/absent when no confirmation is pending.
   */
  pendingConfirmation?: PendingConfirmation | null
}

/**
 * A pending tool-confirmation request surfaced to the user.
 *
 * The backend [ConfirmationManager] stores this when a tool (e.g.
 * `run_shell`) requires user approval. The frontend detects it via
 * the `pendingConfirmation` field on `AgentSession` (populated by
 * `GET /agent/sessions/{id}`) and shows a modal. The user responds
 * via `POST /agent/sessions/{id}/confirmation/respond`.
 */
export interface PendingConfirmation {
  requestId: string
  toolName: string
  command: string
  workingDirectory: string
  timeout: number
  /** Action type: "shell_command" or "file_access" */
  action?: string
  /** Target path for file_access actions (null for shell_command) */
  targetPath?: string | null
  createdAt: number
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

// ---- Conversations (mailbox) -----------------------------------------------

/** A conversation summary as returned by GET /agent/sessions/{id}/conversations */
export interface ConversationSummary {
  conversationId: number
  status: string
  participants: string[]
  messageCount: number
  unhandledCount: number
  lastMessagePreview: string | null
  lastMessageKind: string | null
  lastMessageAt: string | null
  lastMessageSubject: string | null
}

/** A single message in a conversation, returned by GET /agent/sessions/{id}/conversations/{convId} */
export interface ConversationMessage {
  messageId: number
  senderSessionId: string
  recipientSessionId: string
  kind: string
  subject: string | null
  body: string
  priority: number
  acked: boolean
  createdAt: string
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
