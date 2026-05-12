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
  code: string
  output: string | null
  status: string
  createdAt: string
  finishedAt: string | null
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