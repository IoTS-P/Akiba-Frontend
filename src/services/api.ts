import axios from 'axios'
import type {
  AuthResponse,
  MessageResponse,
  InstanceResponse,
  Script,
  WorkflowStatus,
  QueryResponse,
  FileResponse
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
  list: () => api.get<{ instances: string[] }>('/instances'),
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
  list: () => api.get<{ scripts: Script[] }>('/scripts'),
  get: (id: number) => api.get<Script>(`/scripts/${id}`),
  run: (name: string, code: string) =>
    api.post<{ scriptId: number; message: string }>('/scripts/run', { name, code }),
  delete: (id: number) => api.delete<{ message: string }>(`/scripts/${id}`)
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

export const fileApi = {
  import: (instanceName: string, files: string[]) =>
    api.post<FileResponse>('/files/import', { instanceName, files }),
  list: () => api.get<{ files: any[] }>('/files'),
  delete: (instanceName: string, fileIds: number[]) =>
    api.delete<{ message: string }>('/files', { data: { instanceName, fileIds } })
}

export const queryApi = {
  execute: (sql: string, instanceName?: string) =>
    api.post<QueryResponse>('/query', { sql, instanceName }),
  history: () => api.get<{ message: string }>('/query/history')
}

export const healthApi = {
  check: () => api.get<{ status: string }>('/health')
}

export default api