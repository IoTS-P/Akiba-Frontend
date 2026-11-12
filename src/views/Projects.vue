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
            :placeholder="`New folder in ${currentFolder || 'root'}`"
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

        <!-- Current folder: the list below shows its direct children only. -->
        <div class="fb-bar">
          <button class="fb-up" :disabled="!currentFolder" title="Up one level" @click="goUp">↑</button>
          <nav class="fb-crumbs">
            <span class="fb-crumb" @click="enterFolder('')">project root</span>
            <template v-for="(seg, i) in breadcrumbSegments" :key="i">
              <span class="fb-sep">/</span>
              <span class="fb-crumb" @click="enterFolder(pathUpTo(i))">{{ seg }}</span>
            </template>
          </nav>
          <span class="fb-hint">Drop on empty space to put items here</span>
        </div>
        <div
          class="tree-wrap"
          @contextmenu.prevent="openBackgroundMenu"
          @dragover.prevent="onBackgroundDragOver"
          @drop.prevent="onBackgroundDrop"
        >
          <!-- Marquee selection: drawn while dragging on empty space. -->
          <div
            v-if="marquee.active"
            class="marquee-box"
            :style="marqueeStyle"
          ></div>
          <ul
            class="tree"
            @mousedown.self="startMarquee"
          >
            <li
              v-for="e in visibleEntries"
              :key="e.path"
              class="tree-row"
              :class="{
                'tree-row-selected': selection.has(e.path),
                'tree-row-drop': dropTarget === e.path,
              }"
              style="padding-left: 10px"
              :data-path="e.path"
              draggable="true"
              @click="onRowClick(e, $event)"
              @dblclick="onRowDblClick(e)"
              @contextmenu.prevent.stop="openEntryMenu(e, $event)"
              @dragstart="onRowDragStart(e, $event)"
              @dragend="onDragEnd"
              @dragover.prevent="onRowDragOver(e, $event)"
              @dragleave="onRowDragLeave(e)"
              @drop.prevent="onRowDrop(e, $event)"
            >
              <span class="tree-icon">{{ e.folder ? (dropTarget === e.path ? '📂' : '📁') : '📦' }}</span>

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
              {{
                details.stale
                  ? 'No index yet — the project is in use, refresh after the session ends.'
                  : currentFolder
                    ? 'This folder is empty — drop items here or use New folder.'
                    : 'Empty project — no programs yet.'
              }}
            </li>
          </ul>
        </div>
        <!-- Context menu for entries and for the empty area. -->
        <div
          v-if="entryMenu.show"
          class="ctx-menu"
          :style="{ left: entryMenu.x + 'px', top: entryMenu.y + 'px' }"
        >
          <div v-if="entryMenu.path" class="ctx-menu-item" @click="menuRename">✎ Rename</div>
          <div class="ctx-menu-item" @click="menuNewFolder">📁 New folder here</div>
          <div v-if="entryMenu.path" class="ctx-menu-item" @click="menuCopy">⧉ Copy</div>
          <div v-if="entryMenu.path" class="ctx-menu-item" @click="menuCut">✂ Cut</div>
          <div
            v-if="clipboard"
            class="ctx-menu-item"
            @click="menuPaste"
          >📋 Paste {{ clipboard.mode === 'cut' ? '(move)' : '(copy)' }}</div>
          <div
            v-if="clipboard && !entryMenu.path && currentFolder"
            class="ctx-menu-item"
            @click="menuPasteToParent"
          >↩ Paste into parent ({{ parentOf(currentFolder) || 'project root' }})</div>
          <div v-if="entryMenu.path" class="ctx-menu-sep"></div>
          <div v-if="entryMenu.path" class="ctx-menu-item danger" @click="menuDelete">🗑 Delete</div>
        </div>
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
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
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

// ---------------------------------------------------------------------------
//  In-project file manager: selection, drag to move, ctrl-drag to copy,
//  context menu with copy/cut/paste — the operations people expect from an
//  operating system's file browser.
// ---------------------------------------------------------------------------

/** Folder being displayed; '' is the project root. */
const currentFolder = ref('')
const selection = ref<Set<string>>(new Set())
/** Pending copy/cut payload, filled by the context menu or Ctrl+C / Ctrl+X. */
const clipboard = ref<{ mode: 'copy' | 'cut'; paths: string[] } | null>(null)
const entryMenu = reactive({ show: false, x: 0, y: 0, path: '' })
const dropTarget = ref<string | null>(null)
const marquee = reactive({ active: false, x0: 0, y0: 0, x1: 0, y1: 0 })
/** Entry the next shift-click extends from. */
let selectionAnchor: string | null = null

const marqueeStyle = computed(() => {
  const left = Math.min(marquee.x0, marquee.x1)
  const top = Math.min(marquee.y0, marquee.y1)
  return {
    left: left + 'px',
    top: top + 'px',
    width: Math.abs(marquee.x1 - marquee.x0) + 'px',
    height: Math.abs(marquee.y1 - marquee.y0) + 'px',
  }
})

/** Direct children of [currentFolder] — the only rows shown. */
const visibleEntries = computed(() =>
  details.entries.filter(e => parentOf(e.path) === currentFolder.value),
)

const breadcrumbSegments = computed(() =>
  currentFolder.value ? currentFolder.value.split('/').filter(Boolean) : [],
)

/** Path of the first [i] + 1 breadcrumb segments. */
function pathUpTo(i: number): string {
  return breadcrumbSegments.value.slice(0, i + 1).join('/')
}

function enterFolder(path: string) {
  currentFolder.value = path
  setSelection([])
}

function goUp() {
  enterFolder(parentOf(currentFolder.value))
}

function parentOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx < 0 ? '' : path.slice(0, idx)
}

function setSelection(paths: string[]) {
  selection.value = new Set(paths)
}

/** Click selects; Ctrl/Cmd toggles; Shift extends from the last click. */
function onRowClick(e: { path: string; folder: boolean }, ev: MouseEvent) {
  if (ev.ctrlKey || ev.metaKey) {
    const next = new Set(selection.value)
    if (next.has(e.path)) next.delete(e.path)
    else next.add(e.path)
    selection.value = next
    selectionAnchor = e.path
    return
  }
  if (ev.shiftKey && selectionAnchor) {
    const paths = details.entries.map(x => x.path)
    const from = paths.indexOf(selectionAnchor)
    const to = paths.indexOf(e.path)
    if (from >= 0 && to >= 0) {
      setSelection(paths.slice(Math.min(from, to), Math.max(from, to) + 1))
      return
    }
  }
  setSelection([e.path])
  selectionAnchor = e.path
}

/** Double-click opens a folder; files are opened by the agent, not here. */
function onRowDblClick(e: { path: string; folder: boolean }) {
  if (e.folder) enterFolder(e.path)
}

// ---- marquee selection -----------------------------------------------------

function onMarqueeMove(ev: MouseEvent) {
  marquee.x1 = ev.clientX
  marquee.y1 = ev.clientY
  const left = Math.min(marquee.x0, marquee.x1)
  const right = Math.max(marquee.x0, marquee.x1)
  const top = Math.min(marquee.y0, marquee.y1)
  const bottom = Math.max(marquee.y0, marquee.y1)
  const hit: string[] = []
  document.querySelectorAll<HTMLElement>('.tree-row').forEach(row => {
    const r = row.getBoundingClientRect()
    if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) {
      const path = row.dataset.path
      if (path) hit.push(path)
    }
  })
  setSelection(hit)
}

function onMarqueeUp() {
  marquee.active = false
  window.removeEventListener('mousemove', onMarqueeMove)
  window.removeEventListener('mouseup', onMarqueeUp)
}

function startMarquee(ev: MouseEvent) {
  if (ev.button !== 0) return
  marquee.active = true
  marquee.x0 = ev.clientX
  marquee.y0 = ev.clientY
  marquee.x1 = ev.clientX
  marquee.y1 = ev.clientY
  setSelection([])
  window.addEventListener('mousemove', onMarqueeMove)
  window.addEventListener('mouseup', onMarqueeUp)
}

// ---- drag to move, ctrl-drag to copy --------------------------------------

function onRowDragStart(e: { path: string }, ev: DragEvent) {
  if (!selection.value.has(e.path)) setSelection([e.path])
  ev.dataTransfer?.setData('text/plain', [...selection.value].join('\n'))
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copyMove'
}

function onRowDragOver(e: { path: string; folder: boolean }, ev: DragEvent) {
  const target = e.folder ? e.path : parentOf(e.path)
  dropTarget.value = target
  if (ev.dataTransfer) {
    ev.dataTransfer.dropEffect = (ev.ctrlKey || ev.metaKey) ? 'copy' : 'move'
  }
}

function onRowDragLeave(e: { path: string }) {
  if (dropTarget.value === e.path) dropTarget.value = null
}

function onDragEnd() {
  dropTarget.value = null
}

/**
 * True when the drag is over a row, which handles its own target.
 *
 * The panel handler runs after the row's (bubbling), so without this guard it
 * cleared the highlight the row had just set — the folder never lit up.
 */
function dragIsOverRow(ev: DragEvent): boolean {
  const el = ev.target as HTMLElement | null
  return !!el?.closest('.tree-row')
}

/** Dragging over empty space targets the folder currently open. */
function onBackgroundDragOver(ev: DragEvent) {
  if (dragIsOverRow(ev)) return
  dropTarget.value = null
  if (ev.dataTransfer) {
    ev.dataTransfer.dropEffect = (ev.ctrlKey || ev.metaKey) ? 'copy' : 'move'
  }
}

async function onBackgroundDrop(ev: DragEvent) {
  if (dragIsOverRow(ev)) return
  const paths = [...selection.value]
  if (paths.length === 0) return
  await transfer(paths, currentFolder.value, (ev.ctrlKey || ev.metaKey) ? 'copy' : 'cut')
}

async function onRowDrop(e: { path: string; folder: boolean }, ev: DragEvent) {
  const target = e.folder ? e.path : parentOf(e.path)
  dropTarget.value = null
  const paths = [...selection.value]
  if (paths.length === 0) return
  const copy = ev.ctrlKey || ev.metaKey
  await transfer(paths, target, copy ? 'copy' : 'cut')
}

// ---- move / copy / paste ---------------------------------------------------

/** Move or copy each path into [target]; the server de-duplicates copies. */
async function transfer(paths: string[], target: string, mode: 'copy' | 'cut') {
  if (!details.project || details.busy) return
  details.busy = true
  details.error = ''
  const failures: string[] = []
  for (const path of paths) {
    // Dropping something into the folder that already holds it is a no-op.
    if (mode === 'cut' && parentOf(path) === target) continue
    try {
      if (mode === 'copy') {
        await projectApi.copyEntry(details.project, path, target)
      } else {
        await projectApi.moveEntry(details.project, path, target)
      }
    } catch (err: any) {
      failures.push(`${path.split('/').pop()}: ${err?.response?.data?.error || err?.message || 'failed'}`)
    }
  }
  details.busy = false
  if (failures.length) details.error = failures.join('\n')
  setSelection([])
  await loadTree()
}

function openEntryMenu(e: { path: string }, ev: MouseEvent) {
  if (!selection.value.has(e.path)) setSelection([e.path])
  entryMenu.show = true
  entryMenu.path = e.path
  entryMenu.x = ev.clientX
  entryMenu.y = ev.clientY
}

function openBackgroundMenu(ev: MouseEvent) {
  entryMenu.show = true
  entryMenu.path = ''
  entryMenu.x = ev.clientX
  entryMenu.y = ev.clientY
}

/** Folder the menu acts on: the clicked folder, or the parent of a file. */
function menuTargetFolder(): string {
  if (!entryMenu.path) return currentFolder.value
  const entry = details.entries.find(x => x.path === entryMenu.path)
  return entry?.folder ? entry.path : parentOf(entryMenu.path)
}

function menuRename() {
  const entry = details.entries.find(x => x.path === entryMenu.path)
  entryMenu.show = false
  if (entry) startRename(entry)
}

function menuCopy() {
  clipboard.value = { mode: 'copy', paths: [...selection.value] }
  entryMenu.show = false
}

function menuCut() {
  clipboard.value = { mode: 'cut', paths: [...selection.value] }
  entryMenu.show = false
}

async function menuPaste() {
  const target = menuTargetFolder()
  const payload = clipboard.value
  entryMenu.show = false
  if (!payload) return
  await transfer(payload.paths, target, payload.mode)
  if (payload.mode === 'cut') clipboard.value = null
}

/** Paste one level up, so a subfolder's contents can go back without leaving it. */
async function menuPasteToParent() {
  const payload = clipboard.value
  entryMenu.show = false
  if (!payload) return
  await transfer(payload.paths, parentOf(currentFolder.value), payload.mode)
  if (payload.mode === 'cut') clipboard.value = null
}

async function menuDelete() {
  const paths = [...selection.value]
  entryMenu.show = false
  if (!paths.length) return
  for (const path of paths) {
    const entry = details.entries.find(x => x.path === path)
    if (entry) await deleteEntry(entry)
  }
  setSelection([])
}

async function menuNewFolder() {
  const target = menuTargetFolder()
  entryMenu.show = false
  const name = window.prompt('New folder name')
  if (!name?.trim()) return
  details.busy = true
  try {
    await projectApi.createFolder(details.project!, target, name.trim())
    await loadTree()
  } catch (e: any) {
    details.error = e?.response?.data?.error || e?.message || 'Could not create the folder.'
  } finally {
    details.busy = false
  }
}

/** Ctrl/Cmd+C, X, V and Delete act on the selection while Details is open. */
function onDetailsKeydown(ev: KeyboardEvent) {
  if (!details.open || !(ev.ctrlKey || ev.metaKey)) return
  const target = document.activeElement as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
  const key = ev.key.toLowerCase()
  if (key === 'c' && selection.value.size) {
    clipboard.value = { mode: 'copy', paths: [...selection.value] }
    ev.preventDefault()
  } else if (key === 'x' && selection.value.size) {
    clipboard.value = { mode: 'cut', paths: [...selection.value] }
    ev.preventDefault()
  } else if (key === 'v' && clipboard.value) {
    void transfer(clipboard.value.paths, currentFolder.value, clipboard.value.mode)
    if (clipboard.value.mode === 'cut') clipboard.value = null
    ev.preventDefault()
  }
}

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

function onGlobalMouseDown(ev: MouseEvent) {
  // Any click outside the entry menu dismisses it.
  const el = ev.target as HTMLElement | null
  if (entryMenu.show && el && !el.closest('.ctx-menu')) entryMenu.show = false
}

onMounted(() => {
  void fetchProjects()
  window.addEventListener('keydown', onDetailsKeydown)
  window.addEventListener('mousedown', onGlobalMouseDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onDetailsKeydown)
  window.removeEventListener('mousedown', onGlobalMouseDown)
})
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

/** Reset to the root whenever a different project is opened. */
async function loadTree() {
  const known = new Set(details.entries.map(e => e.path))
  if (currentFolder.value && !known.has(currentFolder.value)) currentFolder.value = ''
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
    await projectApi.createFolder(details.project, currentFolder.value, name)
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

.fb-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
  background: #f6f7f9;
  border: 1px solid #e3e6ea;
  border-radius: 8px;
}

.fb-up {
  padding: 2px 8px;
  font-size: 0.9rem;
  color: #4a7dff;
  background: #fff;
  border: 1px solid #d6d9de;
  border-radius: 6px;
  cursor: pointer;
}

.fb-up:disabled {
  color: #c3c8cf;
  cursor: default;
}

.fb-crumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  font-size: 0.82rem;
}

.fb-crumb {
  color: #4a7dff;
  cursor: pointer;
}

.fb-crumb:hover {
  text-decoration: underline;
}

.fb-sep {
  color: #b6bcc5;
}

.fb-hint {
  margin-left: auto;
  font-size: 0.72rem;
  color: #9aa0a8;
}

.tree-wrap {
  position: relative;
  min-height: 260px;
}

.marquee-box {
  position: fixed;
  z-index: 40;
  border: 1px solid #4a7dff;
  background: rgba(74, 125, 255, 0.12);
  pointer-events: none;
}

.tree-row-selected {
  background: rgba(74, 125, 255, 0.14);
}

.tree-row-drop .tree-icon {
  transform: scale(1.2);
}

.tree-icon {
  display: inline-block;
  transition: transform 0.12s ease;
}

.tree-row-drop {
  outline: 2px dashed #4a7dff;
  outline-offset: -2px;
  background: rgba(74, 125, 255, 0.08);
}

.ctx-menu {
  position: fixed;
  z-index: 60;
  min-width: 180px;
  padding: 4px 0;
  background: #fff;
  border: 1px solid #dfe3e8;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.ctx-menu-item {
  padding: 7px 12px;
  font-size: 0.82rem;
  cursor: pointer;
  white-space: nowrap;
}

.ctx-menu-item:hover {
  background: rgba(74, 125, 255, 0.1);
}

.ctx-menu-item.danger {
  color: #c0392b;
}

.ctx-menu-sep {
  height: 1px;
  margin: 4px 0;
  background: #eceef1;
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
