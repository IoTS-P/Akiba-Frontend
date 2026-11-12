<template>
  <div
    class="pdw"
    :style="{ left: pos.x + 'px', top: pos.y + 'px', zIndex }"
    @mousedown="bringToFront"
  >
    <div class="pdw-head" @mousedown.prevent="startDrag">
      <span class="pdw-title">📁 {{ project }}</span>
      <span class="pdw-actions">
        <button class="pdw-btn" title="Refresh" :disabled="busy" @click="loadTree">⟳</button>
        <button class="pdw-btn" title="Close" @click="emit('close')">✕</button>
      </span>
    </div>

    <div class="pdw-body">
      <div v-if="locked" class="pdw-banner lock">
        In use by session {{ lockInfo?.sessionId || '?' }} — editing is disabled.
      </div>
      <div v-if="notice" class="pdw-banner note">{{ notice }}</div>
      <div v-if="error" class="pdw-banner">{{ error }}</div>

      <div class="pdw-toolbar">
        <input
          v-model="newFolder"
          class="pdw-input"
          :placeholder="`New folder in ${currentFolder || 'root'}`"
          @keyup.enter="createFolder"
        />
        <button class="pdw-primary" :disabled="!newFolder.trim() || busy || locked" @click="createFolder">
          New Folder
        </button>
      </div>

      <div class="pdw-toolbar">
        <select v-model="importBinaryId" class="pdw-input" :disabled="loadingBinaries || importing || locked">
          <option :value="null">{{ loadingBinaries ? 'Loading binaries…' : 'Select a binary…' }}</option>
          <option v-for="b in binaries" :key="b.id" :value="b.id">{{ b.name }} (#{{ b.id }})</option>
        </select>
        <button
          class="pdw-primary"
          :disabled="importBinaryId === null || importing || locked"
          @click="importBinary"
        >{{ importing ? 'Importing…' : 'Import' }}</button>
      </div>

      <div class="pdw-crumbs">
        <button class="pdw-up" :disabled="!currentFolder" title="Up one level" @click="goUp">↑</button>
        <span class="pdw-crumb" @click="enterFolder('')">root</span>
        <template v-for="(seg, i) in breadcrumbSegments" :key="i">
          <span class="pdw-sep">/</span>
          <span class="pdw-crumb" @click="enterFolder(pathUpTo(i))">{{ seg }}</span>
        </template>
      </div>

      <div
        class="pdw-list"
        @contextmenu.prevent="openBackgroundMenu"
        @dragover.prevent="onBackgroundDragOver"
        @drop.prevent="onBackgroundDrop"
        @mousedown.self="startMarquee"
        @click.self="clearSelection"
      >
        <div v-if="marquee.active" class="pdw-marquee" :style="marqueeStyle"></div>
        <div
          v-for="e in visibleEntries"
          :key="e.path"
          class="pdw-row"
          :class="{ selected: selection.has(e.path), drop: dropTarget === e.path }"
          :data-path="e.path"
          draggable="true"
          @click="onRowClick(e, $event)"
          @dblclick="onRowDblClick(e)"
          @contextmenu.prevent.stop="openEntryMenu(e, $event)"
          @dragstart="onRowDragStart(e, $event)"
          @dragend="dropTarget = null"
          @dragover.prevent="onRowDragOver(e, $event)"
          @drop.prevent="onRowDrop(e, $event)"
        >
          <span class="pdw-icon">{{ e.folder ? (dropTarget === e.path ? '📂' : '📁') : '📦' }}</span>
          <input
            v-if="editingPath === e.path"
            ref="renameInput"
            v-model="editValue"
            class="pdw-edit"
            @keyup.enter="commitRename(e)"
            @keyup.esc="cancelRename"
            @blur="commitRename(e)"
          />
          <span v-else class="pdw-name" :title="e.path">{{ e.name }}</span>
          <span v-if="!e.folder" class="pdw-size">{{ formatSize(e.size) }}</span>
        </div>
        <div v-if="visibleEntries.length === 0 && !loading" class="pdw-empty">
          {{ currentFolder ? 'This folder is empty.' : 'Empty project — import a binary to begin.' }}
        </div>
      </div>
    </div>

    <div
      v-if="menu.show"
      class="pdw-menu"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
    >
      <div v-if="menu.path" class="pdw-menu-item" @click="menuRename">✎ Rename</div>
      <div class="pdw-menu-item" @click="menuNewFolder">📁 New folder here</div>
      <div v-if="menu.path" class="pdw-menu-item" @click="menuCopy">⧉ Copy</div>
      <div v-if="menu.path" class="pdw-menu-item" @click="menuCut">✂ Cut</div>
      <div v-if="clipboard" class="pdw-menu-item" @click="menuPaste">
        📋 Paste
        {{ clipboard.mode === 'cut' ? '(move)' : '(copy)' }}
        <span v-if="clipboard.project !== project" class="pdw-menu-hint">from {{ clipboard.project }}</span>
      </div>
      <div v-if="clipboard && !menu.path && currentFolder" class="pdw-menu-item" @click="menuPasteToParent">
        ↩ Paste into parent ({{ parentOf(currentFolder) || 'root' }})
      </div>
      <div v-if="menu.path" class="pdw-menu-item danger" @click="menuDelete">🗑 Delete</div>
    </div>
  </div>
</template>

<script lang="ts">
import { ref } from 'vue'

/**
 * Clipboard shared by every detail window.
 *
 * It used to live inside the component, so a Copy in one window left the other
 * windows without a Paste entry — and cross-project paste is the whole point.
 */
export const detailsClipboard = ref<{ mode: 'copy' | 'cut'; project: string; paths: string[] } | null>(null)
</script>

<script setup lang="ts">
import { reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { projectApi, fileApi } from '@/services/api'

interface TreeEntry { path: string; name: string; folder: boolean; size: number }

const props = defineProps<{ project: string; startX: number; startY: number }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const pos = reactive({ x: props.startX, y: props.startY })
const zIndex = ref(900)
let nextZ = 900
const entries = ref<TreeEntry[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const lockInfo = ref<{ sessionId?: string } | null>(null)
const locked = computed(() => !!lockInfo.value)
const currentFolder = ref('')
const selection = ref<Set<string>>(new Set())
const clipboard = detailsClipboard
const dropTarget = ref<string | null>(null)
const marquee = reactive({ active: false, x0: 0, y0: 0, x1: 0, y1: 0 })
const menu = reactive({ show: false, x: 0, y: 0, path: '' })
const newFolder = ref('')
const editingPath = ref<string | null>(null)
const editValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const binaries = ref<Array<{ id: number; name: string }>>([])
const loadingBinaries = ref(false)
const importBinaryId = ref<number | null>(null)
const importing = ref(false)
let anchorPath: string | null = null
let dragOffset = { x: 0, y: 0 }

function parentOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx < 0 ? '' : path.slice(0, idx)
}

const visibleEntries = computed(() => entries.value.filter(e => parentOf(e.path) === currentFolder.value))
const breadcrumbSegments = computed(() => currentFolder.value ? currentFolder.value.split('/').filter(Boolean) : [])
const marqueeStyle = computed(() => ({
  left: Math.min(marquee.x0, marquee.x1) + 'px',
  top: Math.min(marquee.y0, marquee.y1) + 'px',
  width: Math.abs(marquee.x1 - marquee.x0) + 'px',
  height: Math.abs(marquee.y1 - marquee.y0) + 'px',
}))

function pathUpTo(i: number): string {
  return breadcrumbSegments.value.slice(0, i + 1).join('/')
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let u = 0
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++ }
  return `${v.toFixed(u === 0 ? 0 : 1)} ${units[u]}`
}

async function loadTree() {
  loading.value = true
  try {
    const { data } = await projectApi.tree(props.project)
    entries.value = data.entries ?? []
    // A folder that disappeared (moved/deleted) drops the view back to root.
    if (currentFolder.value && !entries.value.some(e => e.path === currentFolder.value)) {
      currentFolder.value = ''
    }
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Could not read the project.'
  } finally {
    loading.value = false
  }
}

async function loadBinaries() {
  loadingBinaries.value = true
  try {
    const res = await fileApi.list(0, 500)
    binaries.value = (res.data.files ?? []).map((f: any) => ({ id: f.id, name: f.name }))
  } catch {
    binaries.value = []
  } finally {
    loadingBinaries.value = false
  }
}

async function importBinary() {
  if (importBinaryId.value === null) return
  importing.value = true
  error.value = null
  try {
    await projectApi.importBinary(props.project, {
      binaryId: String(importBinaryId.value),
      folder: currentFolder.value,
    })
    await loadTree()
  } catch (e: any) {
    error.value = e?.response?.data?.error || String(e)
  } finally {
    importing.value = false
  }
}

async function createFolder() {
  const name = newFolder.value.trim()
  if (!name) return
  busy.value = true
  try {
    await projectApi.createFolder(props.project, currentFolder.value, name)
    newFolder.value = ''
    await loadTree()
  } catch (e: any) {
    error.value = e?.response?.data?.error || String(e)
  } finally {
    busy.value = false
  }
}

// ---- window dragging -------------------------------------------------------

function startDrag(ev: MouseEvent) {
  dragOffset = { x: ev.clientX - pos.x, y: ev.clientY - pos.y }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', stopDrag)
}

function onDragMove(ev: MouseEvent) {
  pos.x = Math.max(0, ev.clientX - dragOffset.x)
  pos.y = Math.max(0, ev.clientY - dragOffset.y)
}

function stopDrag() {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', stopDrag)
}

/** Clicking anywhere in the window raises it above the others. */
function bringToFront() {
  zIndex.value = ++nextZ
}

// ---- selection -------------------------------------------------------------

function clearSelection() {
  selection.value = new Set()
}

function enterFolder(path: string) {
  currentFolder.value = path
  clearSelection()
}

function goUp() {
  enterFolder(parentOf(currentFolder.value))
}

function onRowDblClick(e: TreeEntry) {
  if (e.folder) enterFolder(e.path)
}

function onRowClick(e: TreeEntry, ev: MouseEvent) {
  if (ev.ctrlKey || ev.metaKey) {
    const next = new Set(selection.value)
    if (next.has(e.path)) next.delete(e.path)
    else next.add(e.path)
    selection.value = next
    anchorPath = e.path
    return
  }
  if (ev.shiftKey && anchorPath) {
    const paths = visibleEntries.value.map(x => x.path)
    const from = paths.indexOf(anchorPath)
    const to = paths.indexOf(e.path)
    if (from >= 0 && to >= 0) {
      selection.value = new Set(paths.slice(Math.min(from, to), Math.max(from, to) + 1))
      return
    }
  }
  selection.value = new Set([e.path])
  anchorPath = e.path
}

// ---- marquee ---------------------------------------------------------------

function onMarqueeMove(ev: MouseEvent) {
  marquee.x1 = ev.clientX
  marquee.y1 = ev.clientY
  const left = Math.min(marquee.x0, marquee.x1)
  const right = Math.max(marquee.x0, marquee.x1)
  const top = Math.min(marquee.y0, marquee.y1)
  const bottom = Math.max(marquee.y0, marquee.y1)
  const hits: string[] = []
  document.querySelectorAll<HTMLElement>(`.pdw-row`).forEach(row => {
    const r = row.getBoundingClientRect()
    if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) {
      const p = row.dataset.path
      if (p) hits.push(p)
    }
  })
  selection.value = new Set(hits)
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
  clearSelection()
  window.addEventListener('mousemove', onMarqueeMove)
  window.addEventListener('mouseup', onMarqueeUp)
}

// ---- drag & drop -----------------------------------------------------------

function onRowDragStart(e: TreeEntry, ev: DragEvent) {
  if (!selection.value.has(e.path)) selection.value = new Set([e.path])
  ev.dataTransfer?.setData('text/plain', [...selection.value].join('\n'))
  // The project travels with the drag so another window knows the source.
  ev.dataTransfer?.setData(
    'application/x-akiba-entries',
    JSON.stringify({ project: props.project, paths: [...selection.value] }),
  )
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copyMove'
}

function onRowDragOver(e: TreeEntry, ev: DragEvent) {
  dropTarget.value = e.folder ? e.path : parentOf(e.path)
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = (ev.ctrlKey || ev.metaKey) ? 'copy' : 'move'
}

function dragOverRow(ev: DragEvent): boolean {
  return !!(ev.target as HTMLElement | null)?.closest('.pdw-row')
}

function onBackgroundDragOver(ev: DragEvent) {
  if (dragOverRow(ev)) return
  dropTarget.value = null
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = (ev.ctrlKey || ev.metaKey) ? 'copy' : 'move'
}

/** Payload of a drag that started in another details window. */
function readDragPayload(ev: DragEvent): { project: string; paths: string[] } | null {
  const raw = ev.dataTransfer?.getData('application/x-akiba-entries')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { project?: string; paths?: string[] }
    if (parsed?.project && Array.isArray(parsed.paths) && parsed.paths.length) {
      return { project: parsed.project, paths: parsed.paths }
    }
  } catch {
    return null
  }
  return null
}

/**
 * Warn when conversations hang off the entries about to move.
 *
 * They are re-pointed at the target project automatically, which is why the
 * user is told first rather than discovering it afterwards.
 */
async function confirmSessionMigration(paths: string[], sourceProject: string): Promise<boolean> {
  const affected: string[] = []
  for (const path of paths) {
    try {
      const { data } = await projectApi.entrySessions(sourceProject, path)
      for (const s of data.sessions ?? []) affected.push(s.sessionName || s.sessionId)
    } catch {
      // The lookup is advisory; a failed one must not block the move.
    }
  }
  if (!affected.length) return true
  const shown = affected.slice(0, 5).join(', ')
  const more = affected.length > 5 ? ` (+${affected.length - 5} more)` : ''
  return window.confirm(
    `${affected.length} conversation(s) are attached to what you are moving: ${shown}${more}.\n\n` +
      `They will be migrated to project '${props.project}' automatically. Continue?`,
  )
}

/** Move (default) or copy entries that belong to a different project. */
async function transferAcrossProjects(payload: { project: string; paths: string[] }, target: string, copy: boolean) {
  if (busy.value) return
  if (!copy) {
    const proceed = await confirmSessionMigration(payload.paths, payload.project)
    if (!proceed) return
  }
  notice.value = null
  busy.value = true
  error.value = null
  const failures: string[] = []
  let migrated = 0
  for (const path of payload.paths) {
    try {
      const { data } = await projectApi.transferEntry(props.project, {
        fromProject: payload.project,
        path,
        targetFolder: target,
        move: !copy,
      })
      migrated += data.migratedSessions ?? 0
    } catch (e: any) {
      failures.push(`${path.split('/').pop()}: ${e?.response?.data?.error || e?.message || 'failed'}`)
    }
  }
  if (migrated > 0) {
    notice.value = `${migrated} conversation(s) moved to '${props.project}'.`
    window.setTimeout(() => { notice.value = null }, 6000)
  }
  busy.value = false
  if (failures.length) error.value = failures.join('\n')
  clearSelection()
  // The source window shows the moved entries until it refreshes too.
  window.dispatchEvent(new CustomEvent('akiba:details-refresh'))
  await loadTree()
}

async function onRowDrop(e: TreeEntry, ev: DragEvent) {
  const target = e.folder ? e.path : parentOf(e.path)
  dropTarget.value = null
  const payload = readDragPayload(ev)
  if (payload && payload.project !== props.project) {
    // Cross-project drags move by default; Ctrl copies.
    await transferAcrossProjects(payload, target, ev.ctrlKey || ev.metaKey)
    return
  }
  await transfer([...selection.value], target, (ev.ctrlKey || ev.metaKey) ? 'copy' : 'cut')
}

async function onBackgroundDrop(ev: DragEvent) {
  if (dragOverRow(ev)) return
  const payload = readDragPayload(ev)
  if (payload && payload.project !== props.project) {
    await transferAcrossProjects(payload, currentFolder.value, ev.ctrlKey || ev.metaKey)
    return
  }
  await transfer([...selection.value], currentFolder.value, (ev.ctrlKey || ev.metaKey) ? 'copy' : 'cut')
}

async function transfer(paths: string[], target: string, mode: 'copy' | 'cut') {
  if (!paths.length || busy.value) return
  busy.value = true
  error.value = null
  const failures: string[] = []
  for (const path of paths) {
    if (mode === 'cut' && parentOf(path) === target) continue
    try {
      if (mode === 'copy') await projectApi.copyEntry(props.project, path, target)
      else await projectApi.moveEntry(props.project, path, target)
    } catch (e: any) {
      failures.push(`${path.split('/').pop()}: ${e?.response?.data?.error || e?.message || 'failed'}`)
    }
  }
  busy.value = false
  if (failures.length) error.value = failures.join('\n')
  clearSelection()
  await loadTree()
}

// ---- context menu ----------------------------------------------------------

function openEntryMenu(e: TreeEntry, ev: MouseEvent) {
  if (!selection.value.has(e.path)) selection.value = new Set([e.path])
  menu.show = true
  menu.path = e.path
  menu.x = ev.clientX
  menu.y = ev.clientY
}

function openBackgroundMenu(ev: MouseEvent) {
  menu.show = true
  menu.path = ''
  menu.x = ev.clientX
  menu.y = ev.clientY
}

function menuTargetFolder(): string {
  if (!menu.path) return currentFolder.value
  const entry = entries.value.find(x => x.path === menu.path)
  return entry?.folder ? entry.path : parentOf(menu.path)
}

function menuRename() {
  const entry = entries.value.find(x => x.path === menu.path)
  menu.show = false
  if (entry) startRename(entry)
}

function menuCopy() {
  clipboard.value = { mode: 'copy', project: props.project, paths: [...selection.value] }
  menu.show = false
}

function menuCut() {
  clipboard.value = { mode: 'cut', project: props.project, paths: [...selection.value] }
  menu.show = false
}

async function menuPaste() {
  const payload = clipboard.value
  const target = menuTargetFolder()
  menu.show = false
  if (!payload) return
  await pasteInto(payload, target)
}

/** Paste honours where the entries came from, not just this project. */
async function pasteInto(payload: { mode: 'copy' | 'cut'; project: string; paths: string[] }, target: string) {
  if (payload.project !== props.project) {
    await transferAcrossProjects({ project: payload.project, paths: payload.paths }, target, payload.mode === 'copy')
  } else {
    await transfer(payload.paths, target, payload.mode)
  }
  if (payload.mode === 'cut') clipboard.value = null
}

async function menuPasteToParent() {
  const payload = clipboard.value
  menu.show = false
  if (!payload) return
  await pasteInto(payload, parentOf(currentFolder.value))
}

function menuNewFolder() {
  menu.show = false
  const name = window.prompt('New folder name')
  if (!name?.trim()) return
  newFolder.value = name.trim()
  void createFolder()
}

async function menuDelete() {
  const paths = [...selection.value]
  menu.show = false
  for (const path of paths) {
    const entry = entries.value.find(x => x.path === path)
    if (entry) await deleteEntry(entry)
  }
  clearSelection()
}

// ---- rename / delete -------------------------------------------------------

function startRename(e: TreeEntry) {
  editingPath.value = e.path
  editValue.value = e.name
  nextTick(() => renameInput.value?.select())
}

function cancelRename() {
  editingPath.value = null
}

async function commitRename(e: TreeEntry) {
  if (editingPath.value !== e.path) return
  const name = editValue.value.trim()
  editingPath.value = null
  if (!name || name === e.name) return
  try {
    await projectApi.renameEntry(props.project, e.path, name)
    await loadTree()
  } catch (err: any) {
    error.value = err?.response?.data?.error || err?.message || 'Rename failed.'
  }
}

async function deleteEntry(e: TreeEntry) {
  if (!window.confirm(`Delete '${e.name}'?`)) return
  try {
    await projectApi.deleteEntry(props.project, e.path)
    await loadTree()
  } catch (err: any) {
    error.value = err?.response?.data?.error || err?.message || 'Delete failed.'
  }
}

// ---- keyboard / global -----------------------------------------------------

function onKeydown(ev: KeyboardEvent) {
  if (!(ev.ctrlKey || ev.metaKey)) return
  const el = document.activeElement as HTMLElement | null
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
  const key = ev.key.toLowerCase()
  if (key === 'c' && selection.value.size) {
    clipboard.value = { mode: 'copy', project: props.project, paths: [...selection.value] }
    ev.preventDefault()
  } else if (key === 'x' && selection.value.size) {
    clipboard.value = { mode: 'cut', project: props.project, paths: [...selection.value] }
    ev.preventDefault()
  } else if (key === 'v' && clipboard.value) {
    const payload = clipboard.value
    void pasteInto(payload, currentFolder.value)
    ev.preventDefault()
  }
}

function onGlobalMouseDown(ev: MouseEvent) {
  const el = ev.target as HTMLElement | null
  if (menu.show && el && !el.closest('.pdw-menu')) menu.show = false
}

function onPeerRefresh() {
  void loadTree()
}

onMounted(() => {
  void loadTree()
  void loadBinaries()
  window.addEventListener('akiba:details-refresh', onPeerRefresh)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('mousedown', onGlobalMouseDown)
})

onUnmounted(() => {
  window.removeEventListener('akiba:details-refresh', onPeerRefresh)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mousedown', onGlobalMouseDown)
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', stopDrag)
  window.removeEventListener('mousemove', onMarqueeMove)
  window.removeEventListener('mouseup', onMarqueeUp)
})
</script>

<style scoped>
.pdw {
  position: fixed;
  z-index: 900;
  width: 560px;
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #dfe3e8;
  border-radius: 10px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
}

.pdw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #eceef1;
  cursor: move;
  user-select: none;
  background: #f8f9fb;
  border-radius: 10px 10px 0 0;
}

.pdw-title {
  font-weight: 600;
  font-size: 0.9rem;
}

.pdw-actions {
  display: flex;
  gap: 4px;
}

.pdw-btn {
  padding: 2px 8px;
  font-size: 0.85rem;
  color: #5a6068;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}

.pdw-btn:hover {
  background: #eceef1;
}

.pdw-body {
  padding: 12px 14px 16px;
  overflow: auto;
}

.pdw-banner {
  padding: 6px 10px;
  margin-bottom: 8px;
  font-size: 0.78rem;
  color: #b3261e;
  background: #fdecea;
  border-radius: 6px;
  white-space: pre-wrap;
}

.pdw-banner.note {
  color: #1a5d2b;
  background: #e7f6ec;
}

.pdw-banner.lock {
  color: #8a5a00;
  background: #fff4e0;
}

.pdw-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.pdw-input {
  flex: 1;
  padding: 6px 8px;
  font-size: 0.8rem;
  border: 1px solid #d6d9de;
  border-radius: 6px;
}

.pdw-primary {
  padding: 6px 12px;
  font-size: 0.8rem;
  color: #fff;
  background: #4a7dff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.pdw-primary:disabled {
  background: #c3ccdd;
  cursor: default;
}

.pdw-crumbs {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 8px;
  margin-bottom: 8px;
  font-size: 0.78rem;
  background: #f6f7f9;
  border: 1px solid #e3e6ea;
  border-radius: 6px;
}

.pdw-up {
  padding: 0 6px;
  color: #4a7dff;
  background: #fff;
  border: 1px solid #d6d9de;
  border-radius: 5px;
  cursor: pointer;
}

.pdw-up:disabled { color: #c3c8cf; cursor: default; }
.pdw-crumb { color: #4a7dff; cursor: pointer; }
.pdw-sep { color: #b6bcc5; }

.pdw-list {
  position: relative;
  min-height: 220px;
  max-height: 46vh;
  overflow: auto;
  border: 1px solid #eceef1;
  border-radius: 6px;
}

.pdw-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 0.82rem;
  cursor: default;
  user-select: none;
}

.pdw-row:hover { background: #f6f7f9; }
.pdw-row.selected { background: rgba(74, 125, 255, 0.14); }
.pdw-row.drop { outline: 2px dashed #4a7dff; outline-offset: -2px; }
.pdw-row.drop .pdw-icon { transform: scale(1.2); }
.pdw-icon { display: inline-block; transition: transform 0.12s ease; }
.pdw-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pdw-size { font-size: 0.72rem; color: #9aa0a8; }

.pdw-edit {
  flex: 1;
  padding: 1px 4px;
  font: inherit;
  border: 1px solid #4a7dff;
  border-radius: 4px;
}

.pdw-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 0.8rem;
  color: #9aa0a8;
}

.pdw-marquee {
  position: fixed;
  z-index: 40;
  border: 1px solid #4a7dff;
  background: rgba(74, 125, 255, 0.12);
  pointer-events: none;
}

.pdw-menu {
  position: fixed;
  z-index: 1200;
  min-width: 180px;
  padding: 4px 0;
  background: #fff;
  border: 1px solid #dfe3e8;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.pdw-menu-item {
  padding: 7px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
}

.pdw-menu-item:hover { background: rgba(74, 125, 255, 0.1); }
.pdw-menu-item.danger { color: #c0392b; }

.pdw-menu-hint {
  margin-left: 6px;
  font-size: 0.7rem;
  color: #9aa0a8;
}
</style>
