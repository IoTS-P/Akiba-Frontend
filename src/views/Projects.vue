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
          <td class="project-name">{{ project.name }}</td>
          <td>{{ project.sessionCount }}</td>
          <td>{{ project.fileCount }}</td>
        </tr>
      </tbody>
    </table>

    <!-- Text export options modal -->
    <div v-if="textExportModal.show" class="modal-overlay" @click.self="closeTextExportModal">
      <div class="modal-content">        <div class="modal-header">
          <h3>Export Text — {{ textExportModal.projectName }}</h3>
          <button class="modal-close" @click="closeTextExportModal">×</button>
        </div>

        <!-- Status check result -->
        <div v-if="textExportModal.statusLoading" class="status-checking">
          Checking export availability…
        </div>
        <div v-else-if="textExportModal.statusError" class="status-error">
          {{ textExportModal.statusError }}
        </div>
        <div v-else-if="textExportModal.status" class="status-section">
          <div :class="['status-badge', textExportModal.status.state]">
            {{ textExportModal.status.state }}
          </div>
          <div v-if="textExportModal.status.state !== 'available'" class="status-reasons">
            <div v-for="reason in textExportModal.status.reasons" :key="reason.code" class="status-reason">
              <span class="reason-code">{{ reason.code }}</span>
              <span v-if="reason.activeProject" class="reason-detail">
                (active project: {{ reason.activeProject }})
              </span>
            </div>
            <div v-for="hint in textExportModal.status.hints" :key="hint" class="status-hint">
              {{ hint }}
            </div>
          </div>
        </div>

        <!-- Export options (only when available) -->
        <div v-if="textExportModal.status?.state === 'available'" class="export-options">
          <div class="option-group">
            <label class="option-group-label">Content</label>
            <div class="checkbox-list">
              <label class="checkbox-item">
                <input type="checkbox" v-model="exportOptions.contents" value="listing" />
                Listing (disassembly)
              </label>
              <label class="checkbox-item">
                <input type="checkbox" v-model="exportOptions.contents" value="functions" />
                Functions list
              </label>
              <label class="checkbox-item">
                <input type="checkbox" v-model="exportOptions.contents" value="comments" />
                Comments
              </label>
              <label class="checkbox-item">
                <input type="checkbox" v-model="exportOptions.contents" value="decompile" />
                Decompile (C pseudo-code)
              </label>
              <label class="checkbox-item">
                <input type="checkbox" v-model="exportOptions.contents" value="data" />
                Data
              </label>
            </div>
          </div>

          <div v-if="exportOptions.contents.includes('comments')" class="option-group">
            <label class="option-group-label">Comment types</label>
            <div class="checkbox-list">
              <label class="checkbox-item">
                <input type="checkbox" v-model="exportOptions.includeEolComment" /> EOL
              </label>
              <label class="checkbox-item">
                <input type="checkbox" v-model="exportOptions.includePlateComment" /> Plate
              </label>
              <label class="checkbox-item">
                <input type="checkbox" v-model="exportOptions.includePreComment" /> Pre
              </label>
              <label class="checkbox-item">
                <input type="checkbox" v-model="exportOptions.includePostComment" /> Post
              </label>
              <label class="checkbox-item">
                <input type="checkbox" v-model="exportOptions.includeRepeatableComment" /> Repeatable
              </label>
            </div>
          </div>

          <div v-if="exportOptions.contents.includes('decompile')" class="option-group">
            <label class="option-group-label">Decompile timeout (seconds)</label>
            <input
              type="number"
              v-model.number="exportOptions.decompileTimeoutSec"
              min="1"
              max="600"
              class="text-input"
            />
          </div>

          <div class="option-group">
            <label class="option-group-label">Function filter (regex, optional)</label>
            <input
              type="text"
              v-model="exportOptions.functionFilter"
              placeholder="e.g. ^main$|^parse_"
              class="text-input"
            />
          </div>

          <div class="option-group">
            <label class="option-group-label">Address filter (optional)</label>
            <div class="address-filter-row">
              <input
                type="text"
                v-model="exportOptions.addressFilterStart"
                placeholder="start (hex, e.g. 0x401000)"
                class="text-input"
              />
              <span class="address-filter-sep">—</span>
              <input
                type="text"
                v-model="exportOptions.addressFilterEnd"
                placeholder="end (hex, e.g. 0x402000)"
                class="text-input"
              />
            </div>
          </div>

          <div class="option-group">
            <label class="option-group-label">Limits</label>
            <div class="limits-row">
              <div class="limit-item">
                <label>Max functions (0 = unlimited)</label>
                <input
                  type="number"
                  v-model.number="exportOptions.maxFunctions"
                  min="0"
                  class="text-input"
                />
              </div>
              <div class="limit-item">
                <label>Max function size (bytes)</label>
                <input
                  type="number"
                  v-model.number="exportOptions.maxFunctionSize"
                  min="1"
                  class="text-input"
                />
              </div>
            </div>
          </div>

          <div class="option-group">
            <label class="option-group-label">Sort by</label>
            <select v-model="exportOptions.sortBy" class="text-input">
              <option value="address">Address</option>
              <option value="name">Name</option>
              <option value="size">Size (descending)</option>
            </select>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" @click="closeTextExportModal">Cancel</button>
          <button
            v-if="textExportModal.status?.state === 'available'"
            class="btn-primary"
            @click="doTextExport"
            :disabled="textExportModal.exporting"
          >
            {{ textExportModal.exporting ? 'Exporting…' : 'Export' }}
          </button>
        </div>
      </div>
    </div>

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

    <!-- Batch session export modal -->
    <div v-if="sessionExportModal.show" class="modal-overlay" @click.self="closeSessionExportModal">
      <div class="modal-content session-export-modal">
        <div class="modal-header">
          <h3>Export Sessions — {{ sessionExportModal.projectName }}</h3>
          <button class="modal-close" @click="closeSessionExportModal">×</button>
        </div>
        <div class="session-export-body">
          <div v-if="sessionExportModal.loading" class="status-checking">Loading sessions…</div>
          <div v-else-if="sessionExportModal.error" class="status-error">{{ sessionExportModal.error }}</div>
          <div v-else-if="sessionExportModal.sessions.length === 0" class="status-checking">
            No agent sessions found for this project.
          </div>
          <template v-else>
            <label class="session-row session-select-all">
              <input
                type="checkbox"
                :checked="allSessionsSelected"
                @change="toggleSelectAllSessions"
              />
              <span class="session-name">Select all ({{ sessionExportModal.sessions.length }})</span>
            </label>
            <div class="session-list">
              <label v-for="s in sessionExportModal.sessions" :key="s.sessionId" class="session-row">
                <input
                  type="checkbox"
                  :checked="sessionExportModal.selected.includes(s.sessionId)"
                  @change="toggleSessionSelected(s.sessionId)"
                />
                <span class="session-name">{{ s.sessionName || s.sessionId.slice(0, 8) }}</span>
                <span class="session-meta">{{ s.status }}</span>
                <span class="session-meta">{{ s.createdAt?.slice(0, 16).replace('T', ' ') || '' }}</span>
              </label>
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="closeSessionExportModal" :disabled="sessionExportModal.exporting">Cancel</button>
          <button
            class="btn-primary"
            @click="doSessionExport"
            :disabled="sessionExportModal.exporting || sessionExportModal.selected.length === 0"
          >
            {{ sessionExportModal.exporting ? 'Exporting…' : `Export ${sessionExportModal.selected.length || ''} session(s)` }}
          </button>
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
          <button class="btn-primary" :disabled="!details.newFolder.trim() || details.busy" @click="createFolder">
            New Folder
          </button>
          <button class="btn-secondary" :disabled="details.loading" @click="loadTree">Refresh</button>
        </div>

        <div v-if="details.error" class="details-banner">{{ details.error }}</div>

        <ul class="tree">
          <li
            v-for="e in details.entries"
            :key="e.path"
            class="tree-row"
            :style="{ paddingLeft: 10 + depthOf(e) * 18 + 'px' }"
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
              <button class="link-btn" @click="startRename(e)">rename</button>
              <button class="link-btn danger" @click="deleteEntry(e)">delete</button>
            </span>
            <span v-if="rowError && rowError.path === e.path" class="tree-error">{{ rowError.message }}</span>
          </li>
          <li v-if="details.entries.length === 0 && !details.loading" class="tree-empty">
            {{ details.stale ? 'No index yet — the project is in use, refresh after the session ends.' : 'Empty project — no programs yet.' }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted } from 'vue'
import { projectApi } from '@/services/api'
import type { ExportTextStatus, ProjectSessionInfo } from '@/services/api'
import type { GhidraProjectInfo } from '@/types'

const projects = ref<GhidraProjectInfo[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const exporting = ref<string | null>(null)
const textExporting = ref<string | null>(null)
const workspaceExporting = ref<string | null>(null)
const sessionExporting = ref<string | null>(null)
const deleting = ref<string | null>(null)

// --- Batch session export modal state ---
const sessionExportModal = reactive({
  show: false,
  projectName: '',
  loading: false,
  error: null as string | null,
  sessions: [] as ProjectSessionInfo[],
  selected: [] as string[],
  exporting: false,
})

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

// --- Text export modal state ---
const textExportModal = reactive({
  show: false,
  projectName: '',
  statusLoading: false,
  statusError: null as string | null,
  status: null as ExportTextStatus | null,
  exporting: false,
})

const exportOptions = reactive({
  contents: ['listing', 'comments', 'functions'] as string[],
  includeComments: true,
  includeEolComment: true,
  includePlateComment: true,
  includePreComment: true,
  includePostComment: false,
  includeRepeatableComment: false,
  includeDecompile: false,
  decompileTimeoutSec: 30,
  includeData: true,
  includeUndefined: false,
  functionFilter: '' as string,
  addressFilterStart: '' as string,
  addressFilterEnd: '' as string,
  maxFunctions: 0,
  maxFunctionSize: 1 << 20,
  sortBy: 'address',
})

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

async function startTextExport(name: string) {
  textExporting.value = name
  textExportModal.show = true
  textExportModal.projectName = name
  textExportModal.statusLoading = true
  textExportModal.statusError = null
  textExportModal.status = null
  textExportModal.exporting = false

  try {
    const res = await projectApi.exportTextStatus(name)
    textExportModal.status = res.data
  } catch (e: any) {
    textExportModal.statusError = e.response?.data?.error ?? e.message ?? 'Failed to check export status'
  } finally {
    textExportModal.statusLoading = false
  }
}

function closeTextExportModal() {
  if (textExportModal.exporting) return
  textExportModal.show = false
  textExportModal.projectName = ''
  textExportModal.status = null
  textExportModal.statusError = null
  textExporting.value = null
}

async function doTextExport() {
  if (!textExportModal.projectName) return
  textExportModal.exporting = true

  try {
    const opts = {
      format: 'zip',
      contents: exportOptions.contents,
      includeComments: exportOptions.includeComments,
      includeEolComment: exportOptions.includeEolComment,
      includePlateComment: exportOptions.includePlateComment,
      includePreComment: exportOptions.includePreComment,
      includePostComment: exportOptions.includePostComment,
      includeRepeatableComment: exportOptions.includeRepeatableComment,
      includeDecompile: exportOptions.includeDecompile,
      decompileTimeoutSec: exportOptions.decompileTimeoutSec,
      includeData: exportOptions.includeData,
      includeUndefined: exportOptions.includeUndefined,
      functionFilter: exportOptions.functionFilter.trim() || null,
      addressFilter: (exportOptions.addressFilterStart.trim() && exportOptions.addressFilterEnd.trim())
        ? { start: exportOptions.addressFilterStart.trim(), end: exportOptions.addressFilterEnd.trim() }
        : null,
      maxFunctions: exportOptions.maxFunctions,
      maxFunctionSize: exportOptions.maxFunctionSize,
      sortBy: exportOptions.sortBy,
    }

    const res = await projectApi.exportText(textExportModal.projectName, opts)
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${textExportModal.projectName}-export_text.zip`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    closeTextExportModal()
  } catch (e: any) {
    const msg = e.response?.data?.error ?? e.message ?? 'Text export failed'
    alert(`Text export failed: ${msg}`)
  } finally {
    textExportModal.exporting = false
  }
}

async function openSessionExportModal(name: string) {
  sessionExporting.value = name
  sessionExportModal.show = true
  sessionExportModal.projectName = name
  sessionExportModal.loading = true
  sessionExportModal.error = null
  sessionExportModal.sessions = []
  sessionExportModal.selected = []
  sessionExportModal.exporting = false
  try {
    const res = await projectApi.sessions(name)
    sessionExportModal.sessions = res.data.sessions ?? []
    // Default to everything selected — the common case is a full export.
    sessionExportModal.selected = sessionExportModal.sessions.map(s => s.sessionId)
  } catch (e: any) {
    sessionExportModal.error = e.response?.data?.error ?? e.message ?? 'Failed to load sessions'
  } finally {
    sessionExportModal.loading = false
  }
}

function closeSessionExportModal() {
  if (sessionExportModal.exporting) return
  sessionExportModal.show = false
  sessionExportModal.projectName = ''
  sessionExportModal.sessions = []
  sessionExportModal.selected = []
  sessionExporting.value = null
}

const allSessionsSelected = computed(() =>
  sessionExportModal.sessions.length > 0 &&
  sessionExportModal.selected.length === sessionExportModal.sessions.length
)

function toggleSelectAllSessions() {
  sessionExportModal.selected = allSessionsSelected.value
    ? []
    : sessionExportModal.sessions.map(s => s.sessionId)
}

function toggleSessionSelected(id: string) {
  const idx = sessionExportModal.selected.indexOf(id)
  if (idx >= 0) sessionExportModal.selected.splice(idx, 1)
  else sessionExportModal.selected.push(id)
}

async function doSessionExport() {
  if (!sessionExportModal.projectName || sessionExportModal.selected.length === 0) return
  sessionExportModal.exporting = true
  try {
    const res = await projectApi.exportSessions(sessionExportModal.projectName, sessionExportModal.selected)
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${sessionExportModal.projectName}-sessions.zip`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    sessionExportModal.exporting = false
    closeSessionExportModal()
  } catch (e: any) {
    const msg = e.response?.data?.error ?? e.message ?? 'Session export failed'
    alert(`Session export failed: ${msg}`)
  } finally {
    sessionExportModal.exporting = false
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
  loading: false,
  busy: false,
  stale: false,
  error: null as string | null,
})

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
  await loadTree()
}

function closeDetails() {
  details.open = false
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


// The text and session exports lost their per-row buttons (the toolbar only
// keeps gar / workspace / delete).  Their modals are retained and can still be
// driven through the component ref, so the capability is not lost.
defineExpose({ startTextExport, openSessionExportModal })
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
.export-text-btn {
  border-color: #4a90d9;
  color: #4a90d9;
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
.export-text-btn:hover:not(:disabled) {
  background: #4a90d9;
  color: #fff;
}
.export-btn:disabled, .detail-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.export-sessions-btn {
  padding: 4px 14px;
  border: 1px solid #2e7d32;
  border-radius: 4px;
  background: #fff;
  color: #2e7d32;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}
.export-sessions-btn:hover:not(:disabled) {
  background: #2e7d32;
  color: #fff;
}
.export-sessions-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* --- Batch session export --- */
.session-export-modal {
  width: 640px;
}
.session-export-body {
  padding: 12px 24px;
}
.session-select-all {
  font-weight: 600;
  border-bottom: 1px solid #eaeaea;
  padding-bottom: 8px;
  margin-bottom: 4px;
}
.session-list {
  max-height: 50vh;
  overflow-y: auto;
}
.session-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-size: 13px;
  cursor: pointer;
  color: #333;
}
.session-row input {
  cursor: pointer;
  flex-shrink: 0;
}
.session-row .session-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-row .session-meta {
  color: #999;
  font-size: 12px;
  flex-shrink: 0;
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

.status-checking {
  padding: 24px;
  text-align: center;
  color: #999;
}
.status-error {
  padding: 16px 24px;
  color: #e94560;
  font-size: 13px;
}
.status-section {
  padding: 16px 24px;
}
.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.status-badge.available {
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #a5d6a7;
}
.status-badge.in_use {
  background: #fff3e0;
  color: #e65100;
  border: 1px solid #ffb74d;
}
.status-badge.project_not_found {
  background: #ffebee;
  color: #c62828;
  border: 1px solid #ef9a9a;
}
.status-reasons {
  margin-top: 12px;
}
.status-reason {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}
.reason-code {
  font-family: monospace;
  color: #e65100;
}
.reason-detail {
  color: #999;
}
.status-hint {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
  padding-left: 12px;
  border-left: 2px solid #e0e0e0;
}

.export-options {
  padding: 16px 24px;
  border-top: 1px solid #eaeaea;
}
.option-group {
  margin-bottom: 16px;
}
.option-group-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #555;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.checkbox-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.checkbox-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
  color: #333;
}
.checkbox-item input {
  cursor: pointer;
}

.text-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}
.text-input:focus {
  border-color: #4a90d9;
}
select.text-input {
  cursor: pointer;
}

.address-filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.address-filter-sep {
  color: #999;
  font-size: 13px;
}

.limits-row {
  display: flex;
  gap: 16px;
}
.limit-item {
  flex: 1;
}
.limit-item label {
  display: block;
  font-size: 11px;
  color: #999;
  margin-bottom: 4px;
}

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
.project-row { cursor: pointer; }
.project-row.row-selected { background: rgba(64, 132, 214, 0.16); }
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
