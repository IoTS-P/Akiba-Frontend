import api from '@/services/api'

/**
 * One conversation's workspace.
 *
 * The URL carries the session id because a conversation's files belong to it alone, whatever
 * program it happens to be working on.
 */
export interface WorkspaceEntry {
  name: string
  path: string
  directory: boolean
  size: number
  modified: number
}

export interface WorkspaceFile {
  path: string
  size: number
  binary: boolean
  content: string
  modified: number
}

const base = (sessionId: string) => `/agent/sessions/${encodeURIComponent(sessionId)}/workspace`

export const workspaceApi = {
  tree: (sessionId: string, path = '') =>
    api.get<{ path: string; entries: WorkspaceEntry[] }>(`${base(sessionId)}/tree`, { params: { path } }),

  readFile: (sessionId: string, path: string) =>
    api.get<WorkspaceFile>(`${base(sessionId)}/file`, { params: { path } }),

  writeFile: (sessionId: string, path: string, content: string) =>
    api.put<{ status: string; path: string; size: number }>(
      `${base(sessionId)}/file`, content,
      { params: { path }, headers: { 'Content-Type': 'text/plain' } },
    ),

  upload: (sessionId: string, path: string, file: File) => {
    const form = new FormData()
    form.append('file', file, file.name)
    return api.post<{ status: string; files: string[] }>(
      `${base(sessionId)}/upload`, form,
      { params: { path }, headers: { 'Content-Type': 'multipart/form-data' } },
    )
  },

  deleteEntry: (sessionId: string, path: string) =>
    api.delete<{ status: string }>(`${base(sessionId)}/entry`, { params: { path } }),

  downloadUrl: (sessionId: string, path: string) =>
    `${base(sessionId)}/download?path=${encodeURIComponent(path)}`,
}
