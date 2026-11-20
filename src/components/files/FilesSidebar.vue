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
        @dblclick="$emit('open', f.id, f.name)"
        @contextmenu.prevent="openFileMenu($event, f)"
      >
        <span class="id">{{ f.id }}</span>
        <span class="divider"></span>
        <span class="name">{{ f.name }}</span>
      </div>

      <button v-if="hasMore && !query" class="more" @click="loadMore">Load more</button>
    </div>

    <!-- A binary id is more than one row: sessions, executions and whatever a
         module wrote all point at it, and the record is all of them. -->
    <div v-if="records.length" class="detail">
      <div class="detail-name" :title="selectedName">{{ selectedName }}</div>

      <details v-for="table in records" :key="table.name" class="table-block" open>
        <summary>
          <span class="table-name">{{ table.name }}</span>
          <span class="table-count">{{ table.rows.length }}</span>
        </summary>

        <div v-for="(row, rowIndex) in table.rows" :key="rowIndex" class="row-block">
          <div v-for="column in table.columns" :key="column.name" class="field">
            <span class="label">{{ column.name }}</span>

            <input
              v-if="editing.key === `${table.name}.${rowIndex}.${column.name}`"
              v-model="draft"
              class="edit-input"
              @keyup.enter="commitEdit(table, row, rowIndex, column.name)"
              @keyup.esc="editing.key = ''"
              @blur="commitEdit(table, row, rowIndex, column.name)"
            />
            <span
              v-else
              class="value"
              :class="{
                editable: isEditable(table, row, column.name),
                long: isLong(row, column.name),
              }"
              :title="fullValue(row.values[column.name])"
              @click="isEditable(table, row, column.name) && startEdit(table.name, rowIndex, column.name, row)"
              @contextmenu.prevent="openValueMenu($event, row.values[column.name])"
            >{{ shortValue(row.values[column.name]) }}<span v-if="isLong(row, column.name)" class="length"> ({{ lengthOf(row, column.name) }} chars)</span></span>
          </div>
        </div>
      </details>

      <div v-if="!canEdit" class="hint">Editing records is disabled on this deployment.</div>
    </div>

    <div
      v-if="menu.show"
      class="ctx"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
    >
      <template v-if="menu.kind === 'value'">
        <div class="ctx-item" @click="copyValue">Copy value</div>
      </template>
      <template v-else>
        <div class="ctx-item danger" @click="remove">Delete file</div>
      </template>
    </div>

    <div v-if="error" class="hint error">{{ error }}</div>
    <div v-if="saveError" class="hint error">{{ saveError }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { fileApi, type FileEntry, type RecordRow, type RecordTable } from '@/services/api'

defineEmits<{ open: [id: number, name: string] }>()

const PAGE = 50
const SHORT_LIMIT = 200
const LONG_HINT = 10 * 1024

const files = ref<FileEntry[]>([])
const query = ref('')
const loading = ref(false)
const hasMore = ref(false)
const error = ref('')
const saveError = ref('')

const selectedId = ref<number | null>(null)
const selectedName = ref('')
const records = ref<RecordTable[]>([])
const canEdit = ref(true)

const editing = reactive({ key: '' })
const draft = ref('')

const menu = reactive({
  show: false,
  x: 0,
  y: 0,
  kind: 'file' as 'file' | 'value',
  file: null as FileEntry | null,
  value: '' as string,
})

/** Columns a correction must never rewrite: identity, size and what was imported. */
const PROTECTED = new Set(['id', 'size', 'checksum', 'original_path', 'processed_checksum'])

function rowId(row: RecordRow): number | null {
  const value = row.values['id']
  return typeof value === 'number' ? value : null
}

function isEditable(table: RecordTable, row: RecordRow, column: string): boolean {
  if (!canEdit.value) return false
  if (table.name === 'binaries' && PROTECTED.has(column)) return false
  return rowId(row) !== null
}

/** The daemon cuts long cells and sends the real length beside the prefix. */
function lengthOf(row: RecordRow, column: string): number {
  const reported = row.lengths?.[column]
  if (typeof reported === 'number') return reported
  const value = row.values[column]
  if (value == null) return 0
  return typeof value === 'string' ? value.length : JSON.stringify(value).length
}

function isLong(row: RecordRow, column: string): boolean {
  return lengthOf(row, column) > LONG_HINT
}

function fullValue(value: unknown): string {
  if (value == null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function shortValue(value: unknown): string {
  const text = fullValue(value).replace(/\s+/g, ' ')
  return text.length > SHORT_LIMIT ? `${text.slice(0, SHORT_LIMIT)}…` : (text || '—')
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

async function select(file: FileEntry) {
  selectedId.value = file.id
  selectedName.value = file.name
  editing.key = ''
  saveError.value = ''
  records.value = []
  try {
    const { data } = await fileApi.records(file.id)
    const payload = (data.records ?? {}) as { tables?: RecordTable[] }
    records.value = payload.tables ?? []
    canEdit.value = data.canEdit !== false
  } catch (e: any) {
    saveError.value = e?.response?.data?.error || 'Could not read this record.'
  }
}

function startEdit(table: string, rowIndex: number, column: string, row: RecordRow) {
  editing.key = `${table}.${rowIndex}.${column}`
  draft.value = row.values[column] == null ? '' : String(row.values[column])
}

async function commitEdit(
  table: RecordTable,
  row: RecordRow,
  rowIndex: number,
  column: string,
) {
  const key = `${table.name}.${rowIndex}.${column}`
  if (editing.key !== key) return
  const value = draft.value
  editing.key = ''
  if (value === String(row.values[column] ?? '')) return
  const id = rowId(row)
  if (id === null) return
  try {
    await fileApi.updateRecord(table.name, id, column, value)
    row.values[column] = value
    saveError.value = ''
  } catch (e: any) {
    saveError.value = e?.response?.data?.error || 'Could not save that change.'
  }
}

function openFileMenu(ev: MouseEvent, file: FileEntry) {
  menu.show = true
  menu.kind = 'file'
  menu.x = ev.clientX
  menu.y = ev.clientY
  menu.file = file
}

function openValueMenu(ev: MouseEvent, value: unknown) {
  menu.show = true
  menu.kind = 'value'
  menu.x = ev.clientX
  menu.y = ev.clientY
  menu.value = fullValue(value)
}

function closeMenu() {
  menu.show = false
}

async function copyValue() {
  menu.show = false
  const text = menu.value
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const host = document.createElement('textarea')
    host.value = text
    host.style.position = 'fixed'
    host.style.opacity = '0'
    document.body.appendChild(host)
    host.select()
    document.execCommand('copy')
    host.remove()
  }
}

async function remove() {
  const file = menu.file
  menu.show = false
  if (!file) return
  if (!window.confirm(`Delete ${file.name}? Projects using it will lose the binary.`)) return
  try {
    await fileApi.delete([file.id])
    files.value = files.value.filter(f => f.id !== file.id)
    if (selectedId.value === file.id) {
      selectedId.value = null
      records.value = []
    }
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
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding-bottom: 4px;
}

.row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: default;
}

.row:hover {
  background: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.05));
}

.row.selected {
  background: var(--vscode-focusBorder);
  color: #fff;
}

.row.selected .id {
  color: rgba(255, 255, 255, 0.75);
}

.row .id {
  flex: 0 0 auto;
  color: var(--akiba-chat-text-faint);
  font-variant-numeric: tabular-nums;
}

.row .divider {
  flex: 0 0 auto;
  width: 1px;
  height: 11px;
  background: var(--vscode-panel-border);
}

.row .name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more {
  margin: 6px 10px;
  font-size: 12px;
}

.detail {
  flex: 0 1 auto;
  max-height: 52%;
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

.table-block {
  margin-bottom: 6px;
}

.table-block > summary {
  cursor: pointer;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--vscode-descriptionForeground);
  padding: 2px 0;
}

.table-count {
  margin-left: 6px;
  opacity: 0.7;
}

.row-block {
  border-left: 1px solid var(--vscode-panel-border);
  padding-left: 8px;
  margin: 2px 0 6px;
}

.field {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 1px 0;
  font-size: 12px;
  min-height: 17px;
}

.field .label {
  flex: 0 0 108px;
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

.field .value.long {
  color: var(--akiba-chat-text-faint);
}

.field .length {
  color: var(--akiba-chat-text-faint);
  font-variant-numeric: tabular-nums;
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

.ctx {
  position: fixed;
  z-index: 60;
  padding: 4px 0;
  min-width: 150px;
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

.ctx-item:hover {
  background: var(--vscode-focusBorder);
  color: #fff;
}

.ctx-item.danger {
  color: var(--akiba-danger-text);
}

.hint {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--akiba-chat-text-faint);
}

.hint.error {
  color: var(--akiba-danger-text);
}
</style>
