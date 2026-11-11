<template>
  <div class="projects-page">
    <div class="toolbar">
      <span class="title">Ghidra Projects – {{ projects.length }} project(s)</span>
      <div class="toolbar-actions">
        <button class="import-gar-btn" @click="triggerGarImport" :disabled="importing">
          {{ importing ? 'Importing…' : 'Import .gar' }}
        </button>
        <input
          ref="garFileInput"
          type="file"
          accept=".gar"
          style="display: none"
          @change="onGarFileSelected"
        />
        <button class="refresh-btn" @click="fetchProjects" :disabled="loading">Refresh</button>
      </div>
    </div>
    <div class="project-toolbar">
      <button class="detail-btn" :disabled="selected.size !== 1" @click="openDetails">
        Details
      </button>
      <button class="detail-btn" :disabled="selected.size !== 1 || !!renaming" @click="openRename">
        {{ renaming ? 'Renaming…' : 'Rename' }}
      </button>
      <button class="export-btn" :disabled="selected.size === 0 || exporting !== null" @click="exportSelected">
        {{ exporting ? 'Exporting…' : 'Export .gar' }}
      </button>
      <button class="export-workspace-btn" :disabled="selected.size === 0 || workspaceExporting !== null" @click="exportWorkspaceSelected">
        {{ workspaceExporting ? 'Exporting…' : 'Export Workspace' }}
      </button>
      <button class="delete-project-btn" :disabled="selected.size === 0 || deleting !== null" @click="deleteSelected">
        Delete{{ selected.size > 1 ? ` (${selected.size})` : '' }}
      </button>
      <span class="toolbar-hint">{{ selected.size }} selected · Ctrl+click to add</span>
    </div>
    <div v-if="loading" class="loading">Loading projects…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="projects.length === 0" class="empty">
      No Ghidra projects found. Run a workflow or agent session first.
    </div>
    <table v-else class="projects-table">
      <thead>
        <tr>
          <th>Project Name</th>
          <th>Sessions</th>
          <th>Files</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="project in projects"
          :key="project.name"
          class="project-row"
          :class="{ 'row-selected': selected.has(project.name) }"
          @click="toggleRow(project.name, $event)"
        >
          <td class="project-name">
            {{ project.name }}
            <span
              v-if="project.locked"
              class="lock-badge"
              :title="lockTitle(project.locked)"
            >in use</span>
          </td>
          <td>{{ project.sessionCount }}</td>
          <td>{{ project.fileCount }}</td>
        </tr>
      </tbody>
    </table>

    <!-- .gar import result modal -->
    <div v-if="garImportResult" class="modal-overlay" @click.self="closeGarImportModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Import .gar — {{ garImportResult.projectName }}</h3>
          <button class="modal-close" @click="closeGarImportModal">×</button>
        </div>
        <div class="gar-programs">
          <p class="gar-summary">
            Imported {{ garImportResult.programs.length }} program(s):
          </p>
          <table class="gar-programs-table">
            <thead>
              <tr>
                <th>Original</th>
                <th>Renamed to</th>
                <th>Binary ID</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in garImportResult.programs" :key="p.name">
                <td>{{ p.name }}</td>
                <td>{{ p.renamedTo }}</td>
                <td>{{ p.binaryId }}</td>
                <td>
                  <span v-if="p.error" class="gar-prog-error">{{ p.error }}</span>
                  <span v-else-if="p.newlyImported" class="gar-prog-new">new</span>
                  <span v-else class="gar-prog-reused">reused</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button class="btn-primary" @click="closeGarImportModal">Close</button>
        </div>
      </div>
    </div>

    <!-- .gar import error modal -->
    <div v-if="garImportError" class="modal-overlay" @click.self="closeGarImportModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Import .gar failed</h3>
          <button class="modal-close" @click="closeGarImportModal">×</button>
        </div>
        <div class="gar-error-body">{{ garImportError }}</div>
        <div class="modal-footer">
          <button class="btn-primary" @click="closeGarImportModal">Close</button>
        </div>
      </div>
    </div>

    <!-- Delete project confirmation modal -->
    <div v-if="deleteModal.show" class="modal-overlay" @click.self="closeDeleteModal">
      <div class="modal-content delete-modal">
        <div class="modal-header">
          <h3 class="delete-modal-title">Delete Project</h3>
          <button class="modal-close" @click="closeDeleteModal">×</button>
        </div>
        <div class="delete-modal-body">
          <p class="delete-warning">
            You are about to permanently delete the Ghidra project:
          </p>
          <p class="delete-project-name">{{ deleteModal.projectName }}</p>
          <p class="delete-hint">
            This will remove the project files (<code>{{ deleteModal.projectName }}.gpr</code> and
            <code>{{ deleteModal.projectName }}.rep/</code>) from disk. This action cannot be undone.
          </p>
          <label class="delete-logs-option">
            <input type="checkbox" v-model="deleteModal.deleteLogs" />
            <span>Also delete associated log directories</span>
          </label>
          <p class="delete-logs-hint">
            Scans all log directories for config files referencing this project and deletes matching ones.
            This includes logs from normal runs, fork runs, and base/continue runs.
          </p>
          <label class="delete-logs-option">
            <input type="checkbox" v-model="deleteModal.deleteAgentSessions" />
            <span>Also delete all associated agent sessions</span>
          </label>
          <p class="delete-logs-hint">
            Permanently removes every agent session (including sub-agents) whose project is
            <code>{{ deleteModal.projectName }}</code>, along with all of their messages, tool
            calls and graphs. This cannot be undone.
          </p>
          <label class="delete-logs-option">
            <input type="checkbox" v-model="deleteModal.deleteWorkspace" />
            <span>Also delete the workspace directory</span>
          </label>
          <p class="delete-logs-hint">
            Removes <code>workspace/{{ deleteModal.projectName }}/</code> — the directory where
            modules write intermediate outputs (analysis results, extracted files, shell
            artifacts). This cannot be undone.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="closeDeleteModal" :disabled="deleteModal.deleting">Cancel</button>
          <button
            class="btn-danger"
            @click="confirmDelete"
            :disabled="deleteModal.deleting"
          >
            {{ deleteModal.deleting ? 'Deleting…' : 'Delete Project' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="details.open" class="modal-overlay" @click.self="closeDetails">
      <div class="modal-content details-modal">
        <div class="modal-header">
          <div>
            <h3>{{ details.project }}</h3>
            <p class="details-sub">{{ details.folders }} folders · {{ details.files }} programs</p>
          </div>
          <button class="modal-close" @click="closeDetails">×</button>
        </div>

        <div class="details-toolbar">
          <input
            v-model="details.newFolder"
            class="details-input"
            placeholder="New folder name"
            @keyup.enter="createFolder"
          />
          <button class="btn-primary" :disabled="!details.newFolder.trim() || details.busy || !!detailsLock" @click="createFolder">
            New Folder
          </button>
          <button class="btn-secondary" :disabled="details.loading" @click="loadTree">Refresh</button>
        </div>

        <div class="details-import">
          <select v-model="importBinaryId" class="details-input" :disabled="binariesLoading || details.importing">
            <option :value="null">
              {{ binariesLoading ? 'Loading binaries…' : 'Select a binary…' }}
            </option>
            <option v-for="b in binaries" :key="b.id" :value="b.id">
              {{ b.name }} (#{{ b.id }})
            </option>
          </select>
          <input
            v-model="importFolder"
            class="details-input import-target"
            placeholder="Target folder (root)"
          />
          <button
            class="btn-primary"
            :disabled="importBinaryId === null || details.importing"
            @click="importBinary"
          >
            {{ details.importing ? 'Importing…' : 'Import binary' }}
          </button>
        </div>

        <div v-if="details.error" class="details-banner">{{ details.error }}</div>
        <div v-if="detailsLock" class="details-banner lock">
          In use by session {{ detailsLock.sessionId || '?' }} — editing is disabled
          until that conversation ends.
        </div>

        <ul class="tree">
          <li
            v-for="e in details.entries"
            :key="e.path"
            class="tree-row"
            :class="{ 'tree-row-target': e.folder && details.selectedFolder === e.path }"
            :style="{ paddingLeft: 10 + depthOf(e) * 18 + 'px' }"
            @click="selectFolder(e)"
          >
            <span class="tree-icon">{{ e.folder ? '📁' : '📦' }}</span>

            <input
              v-if="editingPath === e.path"
              ref="renameInput"
              v-model="editValue"
              class="tree-edit"
              @keyup.enter="commitRename(e)"
              @keyup.esc="cancelRename"
              @blur="commitRename(e)"
            />
            <span v-else class="tree-name" :title="e.path" @dblclick="startRename(e)">{{ e.name }}</span>

            <span v-if="!e.folder" class="tree-size">{{ formatSize(e.size) }}</span>
            <span v-if="editingPath !== e.path" class="tree-actions">
              <button class="link-btn" @click.stop="startRename(e)">rename</button>
              <button class="link-btn danger" @click.stop="deleteEntry(e)">delete</button>
            </span>
            <span v-if="rowError && rowError.path === e.path" class="tree-error">{{ rowError.message }}</span>
          </li>
          <li v-if="details.entries.length === 0 && !details.loading" class="tree-empty">
            {{ details.stale ? 'No index yet — the project is in use, refresh after the session ends.' : 'Empty project — no programs yet.' }}
          </li>
        </ul>
      </div>
    </div>
    <div v-if="renameTarget !== null" class="modal-overlay" @click.self="closeRename">
      <div class="modal-content rename-modal">
        <div class="modal-header">
          <h3>Rename Ghidra project</h3>
          <button class="modal-close" :disabled="!!renaming" @click="closeRename">✕</button>
        </div>
        <div class="rename-body">
          <label class="rename-label">New name</label>
          <input
            v-model="renameValue"
            class="rename-input"
            :disabled="!!renaming"
            @keyup.enter="submitRename"
            @keyup.esc="closeRename"
          />
          <div v-if="renameError" class="rename-error">{{ renameError }}</div>
          <p class="rename-hint">
            The project folder moves with the name. A conversation that still refers to
            <code>{{ renameTarget }}</code> keeps its old label; start it again to use the new one.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" :disabled="!!renaming" @click="closeRename">Cancel</button>
          <button
            class="btn-primary"
            :disabled="!!renaming || !renameValue.trim() || renameValue.trim() === renameTarget"
            @click="submitRename"
          >
            {{ renaming ? 'Renaming…' : 'Rename' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted } from 'vue'
import { projectApi, fileApi } from '@/services/api'
import type { FileEntry } from '@/services/api'
import type { GhidraProjectInfo } from '@/types'

const projects = ref<GhidraProjectInfo[]>([])
/** Name of the project being renamed, or null when the dialog is closed. */
const renameTarget = ref<string | null>(null)
const renameValue = ref('')
/** Holds the name while the request is in flight, so the dialog stays open. */
const renaming = ref<string | null>(null)
const renameError = ref('')

function openRename() {
  const [name] = [...selected.value]
  if (!name) return
  renameTarget.value = name
  renameValue.value = name
  renameError.value = ''
}

function closeRename() {
  if (renaming.value) return
  renameTarget.value = null
  renameError.value = ''
}

async function submitRename() {
  const from = renameTarget.value
  const to = renameValue.value.trim()
  if (!from || !to || renaming.value || to === from) return
  renaming.value = from
  renameError.value = ''
  try {
    await projectApi.renameProject(from, to)
    renameTarget.value = null
    selected.value = new Set()
    await fetchProjects()
  } catch (e: any) {
    renameError.value = e?.response?.data?.error || e?.message || 'Rename failed.'
  } finally {
    renaming.value = null
  }
}
const loading = ref(false)
const error = ref<string | null>(null)
const exporting = ref<string | null>(null)
const workspaceExporting = ref<string | null>(null)
const deleting = ref<string | null>(null)

// --- Delete project modal state ---
const deleteModal = reactive({
  show: false,
  projectName: '',
  deleteLogs: false,
  deleteAgentSessions: false,
  deleteWorkspace: false,
  deleting: false,
})

// --- .gar import state ---
const garFileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const garImportResult = ref<{
  projectName: string
  programs: Array<{
    name: string
    renamedTo: string
    binaryId: number
    checksum: string
    newlyImported: boolean
    error: string | null
  }>
} | null>(null)
const garImportError = ref<string | null>(null)

// --- Binary import state ---
const binaries = ref<FileEntry[]>([])
const binariesLoading = ref(false)
const importBinaryId = ref<number | null>(null)
const importFolder = ref('')

async function fetchProjects() {
  loading.value = true
  error.value = null
  try {
    const res = await projectApi.list()
    projects.value = res.data.projects ?? []
  } catch (e: any) {
    error.value = e.response?.data?.error ?? e.message ?? 'Failed to load projects'
  } finally {
    loading.value = false
  }
}

function triggerGarImport() {
  garFileInput.value?.click()
}

async function onGarFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  // Reset the input so selecting the same file twice still fires change.
  input.value = ''

  importing.value = true
  garImportError.value = null
  garImportResult.value = null
  try {
    // Derive a default project name from the file name (minus .gar); the
    // user can rename later by re-exporting if needed.
    const defaultName = file.name.replace(/\.gar$/i, '')
    const res = await projectApi.importGar(file, defaultName)
    garImportResult.value = res.data
    await fetchProjects()
  } catch (e: any) {
    garImportError.value = e.response?.data?.error ?? e.message ?? 'Import failed'
  } finally {
    importing.value = false
  }
}

function closeGarImportModal() {
  garImportResult.value = null
  garImportError.value = null
}

async function exportProject(name: string) {
  exporting.value = name
  try {
    const res = await projectApi.exportProject(name)
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${name}.gar`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  } catch (e: any) {
    const msg = e.response?.data?.error ?? e.message ?? 'Export failed'
    alert(`Export failed: ${msg}`)
  } finally {
    exporting.value = null
  }
}

async function exportWorkspace(name: string) {
  workspaceExporting.value = name
  try {
    const res = await projectApi.exportWorkspace(name)
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${name}-workspace.zip`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  } catch (e: any) {
    const msg = e.response?.data?.error ?? e.message ?? 'Workspace export failed'
    alert(`Workspace export failed: ${msg}`)
  } finally {
    workspaceExporting.value = null
  }
}

function openDeleteModal(name: string) {
  deleteModal.show = true
  deleteModal.projectName = name
  deleteModal.deleteLogs = false
  deleteModal.deleteAgentSessions = false
  deleteModal.deleteWorkspace = false
  deleteModal.deleting = false
}

function closeDeleteModal() {
  if (deleteModal.deleting) return
  deleteModal.show = false
  deleteModal.projectName = ''
  deleting.value = null
}

async function confirmDelete() {
  if (!deleteModal.projectName) return
  deleteModal.deleting = true
  deleting.value = deleteModal.projectName
  try {
    await projectApi.deleteProject(deleteModal.projectName, deleteModal.deleteLogs, deleteModal.deleteAgentSessions, deleteModal.deleteWorkspace)
    deleteModal.show = false
    deleteModal.projectName = ''
    await fetchProjects()
  } catch (e: any) {
    const msg = e.response?.data?.error ?? e.message ?? 'Delete failed'
    alert(`Failed to delete project: ${msg}`)
  } finally {
    deleteModal.deleting = false
    deleting.value = null
  }
}

onMounted(fetchProjects)
// ---------------------------------------------------------------
// Selection + the Ghidra-style project browser
// ---------------------------------------------------------------
const selected = ref<Set<string>>(new Set())

function toggleRow(name: string, ev: MouseEvent) {
  const next = new Set(selected.value)
  if (ev.ctrlKey || ev.metaKey) {
    if (next.has(name)) next.delete(name)
    else next.add(name)
  } else {
    next.clear()
    next.add(name)
  }
  selected.value = next
}

async function exportSelected() {
  for (const name of [...selected.value]) {
    try { await exportProject(name) } catch (e) { console.error(e) }
  }
}

async function exportWorkspaceSelected() {
  for (const name of [...selected.value]) {
    try { await exportWorkspace(name) } catch (e) { console.error(e) }
  }
}

async function deleteSelected() {
  const names = [...selected.value]
  if (names.length === 0) return
  const held = names.filter(n => projects.value.find(p => p.name === n)?.locked)
  if (held.length > 0) {
    error.value = `Cannot delete while in use: ${held.join(', ')}`
    return
  }
  if (names.length === 1) { openDeleteModal(names[0]); return }
  if (!confirm(`Delete ${names.length} projects? This cannot be undone.`)) return
  deleting.value = names[0]
  try {
    for (const name of names) await projectApi.deleteProject(name)
    selected.value = new Set()
    await fetchProjects()
  } finally {
    deleting.value = null
  }
}

interface TreeEntry { path: string; name: string; folder: boolean; size: number }

const details = reactive({
  open: false,
  project: '',
  entries: [] as TreeEntry[],
  folders: 0,
  files: 0,
  newFolder: '',
  selectedFolder: '',
  loading: false,
  busy: false,
  importing: false,
  stale: false,
  error: null as string | null,
})

/** Lock holder of the project open in the details dialog, if any. */
const detailsLock = computed(() =>
  projects.value.find(p => p.name === details.project)?.locked ?? null
)

/** Tooltip for the "in use" badge in the list. */
function lockTitle(holder: { sessionId?: string | null; pid?: number; acquiredAt?: string | null }) {
  const session = holder.sessionId ? `session ${holder.sessionId}` : 'a session'
  const since = holder.acquiredAt ? ` since ${holder.acquiredAt}` : ''
  return `held by ${session}${since} (pid ${holder.pid ?? '?'})`
}

// Renaming happens in place: the row turns into an input and the failure, if
// any, is reported under that same row instead of in a notification bar.
const editingPath = ref<string | null>(null)
const editValue = ref('')
const rowError = ref<{ path: string; message: string } | null>(null)
const renameInput = ref<HTMLInputElement[] | null>(null)

function depthOf(e: TreeEntry): number {
  return e.path.split('/').length - 1
}

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function openDetails() {
  const name = [...selected.value][0]
  if (!name) return
  details.open = true
  details.project = name
  details.newFolder = ''
  details.selectedFolder = ''
  importBinaryId.value = null
  importFolder.value = ''
  await Promise.all([loadTree(), loadBinaries()])
}

function closeDetails() {
  details.open = false
}

/** Available binaries of the selected instance, for the import control. */
async function loadBinaries() {
  binariesLoading.value = true
  try {
    const res = await fileApi.list(0, 500)
    binaries.value = res.data.files ?? []
  } catch (e: any) {
    binaries.value = []
    details.error = e?.response?.data?.error || 'Failed to load binaries'
  } finally {
    binariesLoading.value = false
  }
}

/** Point the import control at a folder when its tree row is clicked. */
function selectFolder(e: TreeEntry) {
  if (!e.folder || editingPath.value !== null) return
  details.selectedFolder = e.path
  importFolder.value = e.path
}

async function importBinary() {
  if (importBinaryId.value === null) return
  details.importing = true
  details.error = null
  try {
    await projectApi.importBinary(details.project, {
      binaryId: String(importBinaryId.value),
      folder: importFolder.value.trim(),
    })
    await loadTree()
  } catch (e: any) {
    details.error = e?.response?.data?.error || String(e)
  } finally {
    details.importing = false
  }
}

async function loadTree() {
  details.loading = true
  details.error = null
  try {
    const res = await projectApi.tree(details.project)
    details.entries = res.data.entries
    details.stale = res.data.stale === true
    details.folders = details.entries.filter(e => e.folder).length
    details.files = details.entries.length - details.folders
  } catch (e: any) {
    details.error = e?.response?.data?.error || String(e)
  } finally {
    details.loading = false
  }
}

async function createFolder() {
  const name = details.newFolder.trim()
  if (!name) return
  details.busy = true
  try {
    await projectApi.createFolder(details.project, '', name)
    details.newFolder = ''
    await loadTree()
  } catch (e: any) {
    details.error = e?.response?.data?.error || String(e)
  } finally {
    details.busy = false
  }
}

function startRename(e: TreeEntry) {
  detailError(null)
  rowError.value = null
  editingPath.value = e.path
  editValue.value = e.name
  nextTick(() => renameInput.value?.[0]?.focus())
}

function cancelRename() {
  editingPath.value = null
  editValue.value = ''
}

async function commitRename(e: TreeEntry) {
  if (editingPath.value !== e.path) return
  const to = editValue.value.trim()
  if (!to || to === e.name) { cancelRename(); return }
  details.busy = true
  try {
    await projectApi.renameEntry(details.project, e.path, to)
    cancelRename()
    rowError.value = null
    await loadTree()
  } catch (err: any) {
    const message = err?.response?.data?.error || String(err)
    rowError.value = { path: e.path, message }
    // Stay in edit mode so the name can be fixed where it was typed.
    nextTick(() => renameInput.value?.[0]?.focus())
  } finally {
    details.busy = false
  }
}

function detailError(message: string | null) {
  details.error = message
}

async function deleteEntry(e: TreeEntry) {
  if (!confirm(`Delete '${e.path}' from this project? This cannot be undone.`)) return
  try {
    await projectApi.deleteEntry(details.project, e.path)
    await loadTree()
  } catch (err: any) {
    details.error = err?.response?.data?.error || String(err)
  }
}
</script>

<style scoped>
.projects-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.toolbar-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.toolbar .title {
  font-size: 15px;
  color: #666;
}
.refresh-btn {
  padding: 6px 16px;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
.refresh-btn:hover { border-color: #e94560; color: #e94560; }
.import-gar-btn {
  padding: 6px 16px;
  border: 1px solid #4a90d9;
  border-radius: 6px;
  background: #4a90d9;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}
.import-gar-btn:hover:not(:disabled) { background: #357abd; }
.import-gar-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.loading, .error, .empty {
  text-align: center;
  padding: 40px;
  color: #999;
}
.error { color: #e94560; }

.projects-table {
  width: 100%;
  border-collapse: collapse;
}
.projects-table th {
  text-align: left;
  padding: 12px 16px;
  background: #f5f5f5;
  font-size: 13px;
  font-weight: 600;
  color: #444;
  border-bottom: 2px solid #e0e0e0;
}
.projects-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #eaeaea;
  font-size: 14px;
}
.project-name {
  font-weight: 500;
  color: #1a1a2e;
}
.actions-cell {
  display: flex;
  gap: 8px;
}

.export-btn, .detail-btn {
  padding: 4px 14px;
  border: 1px solid #e94560;
  border-radius: 4px;
  background: #fff;
  color: #e94560;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}
.export-workspace-btn {
  padding: 4px 14px;
  border: 1px solid #6c757d;
  border-radius: 4px;
  background: #fff;
  color: #6c757d;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}
.export-workspace-btn:hover:not(:disabled) {
  background: #6c757d;
  color: #fff;
}
.export-workspace-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.export-btn:hover:not(:disabled), .detail-btn:hover:not(:disabled) {
  background: #e94560;
  color: #fff;
}
.export-btn:disabled, .detail-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* --- Modal --- */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: #fff;
  border-radius: 8px;
  width: 560px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #eaeaea;
}
.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: #1a1a2e;
}
.modal-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #999;
  padding: 0;
  line-height: 1;
}
.modal-close:hover { color: #333; }

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px;
  border-top: 1px solid #eaeaea;
}
.btn-secondary {
  padding: 6px 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  color: #666;
  cursor: pointer;
  font-size: 13px;
}
.btn-secondary:hover { background: #f5f5f5; }
.btn-primary {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  background: #4a90d9;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}
.btn-primary:hover:not(:disabled) { background: #357abd; }
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --- .gar import result --- */
.gar-programs {
  padding: 16px 24px;
}
.gar-summary {
  margin: 0 0 12px;
  font-size: 13px;
  color: #555;
}
.gar-programs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.gar-programs-table th {
  text-align: left;
  padding: 6px 10px;
  background: #f5f5f5;
  color: #444;
  border-bottom: 1px solid #e0e0e0;
}
.gar-programs-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #eaeaea;
  font-family: monospace;
}
.gar-prog-new {
  color: #2e7d32;
  font-weight: 600;
}
.gar-prog-reused {
  color: #666;
}
.gar-prog-error {
  color: #e94560;
}
.gar-error-body {
  padding: 24px;
  color: #e94560;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

/* --- Delete project --- */
.delete-project-btn {
  padding: 4px 14px;
  border: 1px solid #dc3545;
  border-radius: 4px;
  background: #fff;
  color: #dc3545;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}
.delete-project-btn:hover:not(:disabled) {
  background: #dc3545;
  color: #fff;
}
.delete-project-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.delete-modal {
  width: 480px;
}
.delete-modal-title {
  color: #dc3545;
}
.delete-modal-body {
  padding: 20px 24px;
}
.delete-warning {
  font-size: 14px;
  color: #555;
  margin: 0 0 8px;
}
.delete-project-name {
  font-size: 18px;
  font-weight: 700;
  color: #dc3545;
  margin: 0 0 12px;
  word-break: break-all;
}
.delete-hint {
  font-size: 13px;
  color: #888;
  margin: 0 0 16px;
  line-height: 1.5;
}
.delete-hint code {
  font-family: monospace;
  background: #f0f0f0;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}
.delete-logs-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
  color: #333;
  margin-bottom: 6px;
}
.delete-logs-option input {
  margin-top: 3px;
  cursor: pointer;
}
.delete-logs-hint {
  font-size: 12px;
  color: #999;
  margin: 0 0 0 24px;
  line-height: 1.4;
}
.btn-danger {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  background: #dc3545;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}
.btn-danger:hover:not(:disabled) { background: #c82333; }
.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ---- project selection + browser ---- */
.project-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}
.project-toolbar .toolbar-hint {
  margin-left: auto;
  font-size: 12px;
  opacity: 0.65;
}
.lock-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 9px;
  background: rgba(217, 83, 79, 0.15);
  color: #d9534f;
  font-size: 11px;
  font-weight: 600;
  vertical-align: middle;
}
.details-banner.lock {
  background: rgba(230, 162, 60, 0.14);
  border-color: rgba(230, 162, 60, 0.4);
  color: #a86a12;
}
.project-row { cursor: pointer; }
.project-row.row-selected { background: rgba(64, 132, 214, 0.16); }
.rename-modal {
  width: min(520px, 92vw);
}

.rename-body {
  padding: 18px 22px 6px;
}

.rename-label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.78rem;
  color: #666;
}

.rename-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  font: inherit;
  border: 1px solid #ccc;
  border-radius: 6px;
}

.rename-input:focus {
  outline: none;
  border-color: #4a7dff;
}

.rename-error {
  margin-top: 8px;
  font-size: 0.8rem;
  color: #c0392b;
}

.rename-hint {
  margin: 12px 0 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: #888;
}

.modal-content.details-modal {
  width: min(760px, 92vw);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.details-sub {
  margin: 2px 0 0;
  font-size: 12px;
  opacity: 0.65;
}
.details-banner {
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(217, 83, 79, 0.12);
  border: 1px solid rgba(217, 83, 79, 0.35);
  color: #d9534f;
  font-size: 13px;
}
.tree {
  list-style: none;
  margin: 0;
  padding: 6px;
  max-height: 52vh;
  overflow: auto;
  border: 1px solid var(--border, #d0d0d0);
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.04);
}
.tree-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
}
.tree-row:hover { background: rgba(64, 132, 214, 0.10); }
.tree-name { flex: 1; font-family: ui-monospace, monospace; font-size: 13px; cursor: text; }
.tree-edit {
  flex: 1;
  font-family: ui-monospace, monospace;
  font-size: 13px;
  padding: 3px 6px;
  border: 1px solid #4084d6;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  outline: none;
}
.tree-error {
  flex-basis: 100%;
  margin-left: 26px;
  color: #d9534f;
  font-size: 12px;
}
.details-toolbar { display: flex; gap: 8px; margin-bottom: 10px; }
.details-import { display: flex; gap: 8px; margin-bottom: 10px; }
.details-import .details-input { flex: 1; }
.details-import .import-target { flex: 0 0 220px; }
.tree-row.tree-row-target { background: rgba(64, 132, 214, 0.18); }
.details-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--border, #d0d0d0);
  border-radius: 4px;
  background: transparent;
  color: inherit;
}
.tree { list-style: none; margin: 0; padding: 0; max-height: 52vh; overflow: auto; }
.tree li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
}
.tree li:hover { background: rgba(128, 128, 128, 0.12); }
.tree-icon { width: 18px; }
.tree-name { flex: 1; font-family: ui-monospace, monospace; font-size: 13px; }
.tree-size { font-size: 12px; opacity: 0.6; }
.tree-actions { display: flex; gap: 6px; }
.tree-empty { opacity: 0.6; font-size: 13px; }
.link-btn {
  background: none;
  border: none;
  color: #4084d6;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}
.link-btn.danger { color: #d9534f; }
</style>
