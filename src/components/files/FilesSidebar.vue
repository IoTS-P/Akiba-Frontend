<template>
  <div class="files-sidebar">
    <div class="search-row">
      <input v-model="query" type="search" placeholder="Search files…" aria-label="Search files" @input="onSearch" />
    </div>

    <div class="list" @contextmenu.self.prevent="closeMenu">
      <div v-if="loading && !files.length" class="hint">Loading…</div>
      <div v-else-if="!files.length" class="hint">
        No files yet. Import binaries from the Files page or by importing into a project.
      </div>

      <div
        v-for="f in files"
        :key="f.id"
        class="row"
        :class="{ selected: selectedId === f.id }"
        :title="f.name"
        @click="select(f)"
        @contextmenu.prevent="openMenu($event, f)"
      >
        <span class="id">{{ f.id }}</span>
        <span class="divider"></span>
        <span class="name">{{ f.name }}</span>
      </div>

      <button v-if="hasMore && !query" class="more" @click="loadMore">Load more</button>
    </div>

    <div
      v-if="ctx.show"
      class="ctx"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
      @click.self="ctx.show = false"
    >
      <div class="ctx-item danger" @click="remove">Delete file</div>
    </div>

    <!-- A file is not just its name: the row carries the architecture the loader
         will use, and getting that wrong is why an import opens as raw bytes. -->
    <div v-if="detail" class="detail">
      <div class="detail-name" :title="detail.originalPath">{{ baseName(detail.originalPath) }}</div>

      <div v-for="field in fields" :key="field.key" class="field">
        <span class="label">{{ field.label }}</span>
        <input
          v-if="editing === field.key"
          ref="editInput"
          v-model="draft"
          class="edit-input"
          :placeholder="field.label"
          @keyup.enter="commitEdit"
          @keyup.esc="editing = ''"
          @blur="commitEdit"
        />
        <span
          v-else
          class="value"
          :class="{ editable: field.editable, empty: !field.value }"
          :title="field.editable ? 'Click to change' : ''"
          @click="field.editable && startEdit(field.key)"
        >{{ field.value || (field.editable ? 'set' : '—') }}</span>
      </div>

      <div v-if="saveError" class="hint error">{{ saveError }}</div>
    </div>

    <div v-if="error" class="hint error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { fileApi, type BinaryDetail, type FileEntry } from '@/services/api'

const PAGE = 50

const files = ref<FileEntry[]>([])
const query = ref('')
const loading = ref(false)
const hasMore = ref(false)
const error = ref('')
const ctx = reactive({ show: false, x: 0, y: 0, file: null as FileEntry | null })

const selectedId = ref<number | null>(null)
const detail = ref<BinaryDetail | null>(null)
const editing = ref('')
const draft = ref('')
const saveError = ref('')
const editInput = ref<HTMLInputElement[] | null>(null)

const baseName = (path: string | null | undefined): string =>
  (path ?? '').split('/').filter(Boolean).pop() ?? ''

const formatSize = (bytes: number | null | undefined): string => {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Read-only rows are shown; only the three the importer guesses can be changed. */
const fields = computed(() => {
  const d = detail.value
  if (!d) return []
  return [
    { key: 'format', label: 'Format', value: d.format ?? '', editable: true },
    { key: 'arch', label: 'Architecture', value: d.arch ?? '', editable: true },
    { key: 'compilerSpec', label: 'Compiler', value: d.compilerSpec ?? '', editable: true },
    { key: 'size', label: 'Size', value: formatSize(d.size), editable: false },
    { key: 'checksum', label: 'MD5', value: d.checksum ?? '', editable: false },
    { key: 'originalPath', label: 'Source', value: d.originalPath ?? '', editable: false },
  ]
})

async function select(file: FileEntry) {
  selectedId.value = file.id
  editing.value = ''
  saveError.value = ''
  try {
    const { data } = await fileApi.get(file.id)
    detail.value = data
  } catch (e: any) {
    saveError.value = e?.response?.data?.error || 'Could not read this file record.'
  }
}

function startEdit(key: string) {
  const field = fields.value.find(f => f.key === key)
  editing.value = key
  draft.value = field?.value ?? ''
  saveError.value = ''
  nextTick(() => {
    const input = editInput.value?.[0]
    input?.focus()
    input?.select()
  })
}

async function commitEdit() {
  const key = editing.value
  if (!key || !detail.value) return
  const value = draft.value.trim()
  editing.value = ''
  if (!value) return
  const field = fields.value.find(f => f.key === key)
  if (field && value === field.value) return
  try {
    const { data } = await fileApi.updateMetadata(detail.value.id, { [key]: value })
    detail.value = data
    // Keep the list in step: the row shows what the record says.
    const row = files.value.find(f => f.id === data.id)
    if (row) {
      row.arch = data.arch ?? undefined
      row.compilerSpec = data.compilerSpec ?? undefined
      row.type = data.format ?? row.type
    }
  } catch (e: any) {
    saveError.value = e?.response?.data?.error || 'Could not save that change.'
  }
}

async function load(offset = 0) {
  loading.value = true
  error.value = ''
  try {
    const { data } = await fileApi.list(offset, PAGE)
    const rows = [...(data.files ?? [])].sort((a, b) => a.id - b.id)
    files.value = offset === 0 ? rows : [...files.value, ...rows]
    hasMore.value = files.value.length < (data.total ?? 0)
  } catch {
    error.value = 'Could not load files.'
  } finally {
    loading.value = false
  }
}

function loadMore() {
  void load(files.value.length)
}

let searchTimer: number | undefined
function onSearch() {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(async () => {
    const q = query.value.trim()
    if (!q) return void load(0)
    try {
      const { data } = await fileApi.search(q)
      files.value = data.files as unknown as FileEntry[]
      hasMore.value = false
    } catch {
      error.value = 'Search failed.'
    }
  }, 250)
}

function openMenu(ev: MouseEvent, file: FileEntry) {
  ctx.show = true
  ctx.x = ev.clientX
  ctx.y = ev.clientY
  ctx.file = file
}

function closeMenu() {
  ctx.show = false
}

async function remove() {
  const file = ctx.file
  ctx.show = false
  if (!file) return
  if (!window.confirm(`Delete ${file.name}? Projects using it will lose the binary.`)) return
  try {
    await fileApi.delete([file.id])
    files.value = files.value.filter(f => f.id !== file.id)
  } catch {
    error.value = 'Delete failed.'
  }
}

onMounted(() => {
  void load(0)
  window.addEventListener('click', closeMenu)
})
onUnmounted(() => window.removeEventListener('click', closeMenu))
</script>

<style scoped>
.files-sidebar {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.search-row {
  padding: 0 10px 8px;
}

.search-row input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  font-size: 12px;
}

.list {
  flex: 1;
  overflow: auto;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--akiba-chat-text-muted);
  cursor: default;
}

.row:hover {
  background: var(--akiba-chat-hover);
  color: var(--vscode-editor-foreground);
}

/* The id is a reference, not a title: right aligned, low contrast, fenced by a hairline. */
.id {
  flex: 0 0 auto;
  min-width: 34px;
  text-align: right;
  color: var(--akiba-chat-text-faint);
  font-variant-numeric: tabular-nums;
}

.divider {
  flex: 0 0 auto;
  width: 1px;
  height: 11px;
  background: var(--vscode-panel-border);
}

.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more {
  width: 100%;
  padding: 6px;
  background: transparent;
  border: none;
  color: var(--akiba-info-text);
  font-size: 12px;
  cursor: pointer;
}

.hint {
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--akiba-chat-text-faint);
}

.hint.error {
  color: var(--akiba-danger-text);
}

.ctx {
  position: fixed;
  z-index: 60;
  padding: 4px 0;
  min-width: 160px;
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--akiba-radius-sm);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  font-size: 12px;
  color: var(--vscode-editor-foreground);
}

.ctx-item {
  padding: 5px 12px;
  cursor: pointer;
}

.ctx-item.danger:hover {
  background: var(--akiba-danger);
  color: #fff;
}

/* The record panel: read it at a glance, change a value in place. */
.detail {
  flex: 0 0 auto;
  max-height: 46%;
  overflow: auto;
  border-top: 1px solid var(--vscode-panel-border);
  padding: 8px 10px 10px;
}

.detail-name {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--vscode-editor-foreground);
}

.field {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
  font-size: 12px;
  min-height: 18px;
}

.field .label {
  flex: 0 0 84px;
  color: var(--vscode-descriptionForeground);
}

.field .value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vscode-editor-foreground);
}

.field .value.editable {
  cursor: text;
  border-bottom: 1px dashed transparent;
}

.field .value.editable:hover {
  border-bottom-color: var(--vscode-focusBorder);
}

.field .value.empty {
  color: var(--akiba-chat-text-faint);
  font-style: italic;
}

.edit-input {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  padding: 1px 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-editor-foreground);
  border: 1px solid var(--vscode-focusBorder);
  border-radius: 2px;
  outline: none;
}

.row.selected {
  background: var(--vscode-focusBorder);
  color: #fff;
}

.row.selected .id {
  color: rgba(255, 255, 255, 0.75);
}
</style>
