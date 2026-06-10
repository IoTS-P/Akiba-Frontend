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

export interface AgentSession {
  sessionId: string
  sessionName: string | null
  status: string
  modelName: string | null
  createdAt: string | null
  updatedAt: string | null
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

export interface ChatTurnResponse {
  sessionId: string
  userMessage: AgentMessage
  assistantMessage: AgentMessage
  iterations: number
  tokenUsage: { input: number; output: number } | null
}
