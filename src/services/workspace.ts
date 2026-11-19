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

/**
 * A workspace belongs either to a conversation or to a program; the routes differ, the rest of
 * the shape does not.
 */
export type WorkspaceScope =
  | { kind: 'session'; sessionId: string }
  | { kind: 'program'; project: string; program: string }
  /** A skill is a directory of documents with no project or conversation around it. */
  | { kind: 'skill'; name: string }

function baseOf(scope: WorkspaceScope): string {
  if (scope.kind === 'session') {
    return `/agent/sessions/${encodeURIComponent(scope.sessionId)}/workspace`
  }
  if (scope.kind === 'skill') {
    return `/skills/${encodeURIComponent(scope.name)}/workspace`
  }
  return `/projects/${encodeURIComponent(scope.project)}/workspace`
}

/** Program requests name the program in the query; session requests need nothing extra. */
function extra(scope: WorkspaceScope): Record<string, string> {
  return scope.kind === 'program' ? { program: scope.program } : {}
}

export const workspaceApi = {
  tree: (scope: WorkspaceScope, path = '') =>
    api.get<{ path: string; entries: WorkspaceEntry[] }>(
      `${baseOf(scope)}/tree`, { params: { path, ...extra(scope) } }),

  readFile: (scope: WorkspaceScope, path: string) =>
    api.get<WorkspaceFile>(`${baseOf(scope)}/file`, { params: { path, ...extra(scope) } }),

  writeFile: (scope: WorkspaceScope, path: string, content: string) =>
    api.put<{ status: string; path: string; size: number }>(
      `${baseOf(scope)}/file`, content,
      { params: { path, ...extra(scope) }, headers: { 'Content-Type': 'text/plain' } },
    ),

  createDirectory: (scope: WorkspaceScope, path: string) =>
    api.post<{ status: string; path: string }>(`${baseOf(scope)}/directory`, null, {
      params: { path },
    }),

  upload: (scope: WorkspaceScope, path: string, file: File) => {
    const form = new FormData()
    form.append('file', file, file.name)
    return api.post<{ status: string; files: string[] }>(
      `${baseOf(scope)}/upload`, form,
      { params: { path, ...extra(scope) }, headers: { 'Content-Type': 'multipart/form-data' } },
    )
  },

  deleteEntry: (scope: WorkspaceScope, path: string) =>
    api.delete<{ status: string }>(`${baseOf(scope)}/entry`, { params: { path, ...extra(scope) } }),

  downloadUrl: (scope: WorkspaceScope, path: string) => {
    const params = new URLSearchParams({ path, ...extra(scope) })
    return `${baseOf(scope)}/download?${params.toString()}`
  },
}
