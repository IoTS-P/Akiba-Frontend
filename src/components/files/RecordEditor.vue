<template>
  <div class="record-editor">
    <div class="bar">
      <span class="title">{{ title }}</span>
      <span v-if="dirtyCount" class="dirty">{{ dirtyCount }} changed</span>
      <span v-else class="clean">saved</span>
      <button class="save" :disabled="!dirtyCount || saving" @click="save">
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
      <button class="revert" :disabled="!dirtyCount || saving" @click="reload">Revert</button>
    </div>

    <div v-if="error" class="banner error">{{ error }}</div>
    <div v-if="!canEdit" class="banner">Editing records is disabled on this deployment.</div>

    <div class="body">
      <section v-for="table in tables" :key="table.name" class="table-block">
        <header class="table-head">
          <span class="table-name">{{ table.name }}</span>
          <span class="table-count">{{ table.rows.length }} row(s)</span>
        </header>

        <div v-for="(row, rowIndex) in table.rows" :key="rowIndex" class="row-block">
          <div v-for="column in table.columns" :key="column.name" class="field">
            <label class="label" :title="column.type">
              {{ column.name }}
              <span class="type">{{ column.type }}</span>
            </label>

            <span v-if="!editable(table, row, column)" class="value read-only">
              {{ display(row.values[column.name]) }}
              <span v-if="longLength(row, column.name)" class="length">
                ({{ longLength(row, column.name) }} chars)
              </span>
            </span>

            <textarea
              v-else-if="wantsMultiline(row.values[column.name])"
              class="input area"
              :value="current(rowIndex, table.name, column.name, row)"
              :class="{ dirty: isDirty(row, table.name, column.name) }"
              :rows="3"
              @input="edit(row, table.name, column.name, ($event.target as HTMLTextAreaElement).value)"
            ></textarea>

            <input
              v-else
              class="input"
              :type="inputType(column.type)"
              :value="current(rowIndex, table.name, column.name, row)"
              :class="{ dirty: isDirty(row, table.name, column.name) }"
              :placeholder="placeholder(column.type)"
              :title="hint(column.type)"
              @input="edit(row, table.name, column.name, ($event.target as HTMLInputElement).value)"
            />

            <span v-if="columnErrors[errorKey(table.name, row, column.name)]" class="field-error">
              {{ columnErrors[errorKey(table.name, row, column.name)] }}
            </span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { fileApi, type RecordRow, type RecordTable } from '@/services/api'

const props = defineProps<{ fileId: number; title: string }>()

const tables = ref<RecordTable[]>([])
const canEdit = ref(true)
const error = ref('')
const saving = ref(false)

/** Loaded value per cell, keyed by table/row/column; the original stays in [tables]. */
const edits = reactive(new Map<string, string>())
const columnErrors = reactive<Record<string, string>>({})

const PROTECTED = new Set(['id', 'size', 'checksum', 'original_path', 'processed_checksum'])

const cellKey = (table: string, rowIndex: number, column: string) => `${table}.${rowIndex}.${column}`

function rowId(row: RecordRow): number | null {
  const value = row.values['id']
  return typeof value === 'number' ? value : null
}

function rowKey(table: string, row: RecordRow): string {
  return `${table}.${rowId(row) ?? 'row'}`
}

function errorKey(table: string, row: RecordRow, column: string): string {
  return `${rowKey(table, row)}.${column}`
}

/** Bytes and anything binary-shaped are shown, never typed into. */
function isBinaryBlob(type: string): boolean {
  const lower = type.toLowerCase()
  return lower.includes('bytea') || lower.includes('binary') || lower.includes('blob')
}

/** Provenance and identity columns are shown, never written. */
function editable(table: RecordTable, row: RecordRow, column: { name: string; type: string }): boolean {
  if (!canEdit.value) return false
  if (table.name === 'binaries' && PROTECTED.has(column.name)) return false
  if (isBinaryBlob(column.type)) return false
  if (column.name === 'id') return false
  return rowId(row) !== null
}

function display(value: unknown): string {
  if (value === null || value === undefined) return '—'
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function longLength(row: RecordRow, column: string): number | null {
  const reported = row.lengths?.[column]
  return typeof reported === 'number' && reported > 10 * 1024 ? reported : null
}

function current(rowIndex: number, table: string, column: string, row: RecordRow): string {
  const key = cellKey(table, rowIndex, column)
  if (edits.has(key)) return edits.get(key) as string
  const value = row.values[column]
  return value === null || value === undefined ? '' : String(value)
}

function isDirty(row: RecordRow, table: string, column: string): boolean {
  const key = `${rowKey(table, row)}.${column}`
  return edits.has(key)
}

function edit(row: RecordRow, table: string, column: string, value: string) {
  const key = `${rowKey(table, row)}.${column}`
  const original = row.values[column]
  const originalText = original === null || original === undefined ? '' : String(original)
  if (value === originalText) edits.delete(key)
  else edits.set(key, value)
  delete columnErrors[key]
}

/** A long text column is a paragraph, not a line: it gets room. */
function wantsMultiline(value: unknown): boolean {
  return typeof value === 'string' && value.length > 120
}

function inputType(type: string): string {
  if (type.includes('int') || type.includes('numeric') || type.includes('double')) return 'text'
  return 'text'
}

function placeholder(type: string): string {
  if (type.includes('timestamp')) return '2026-11-19T12:00:00+08:00'
  if (type.includes('date')) return '2026-11-19'
  if (type.includes('uuid')) return '00000000-0000-0000-0000-000000000000'
  if (type.includes('ARRAY') || type.endsWith('[]')) return '["a", "b"]'
  if (type.includes('bool')) return 'true / false'
  if (type.includes('int') || type.includes('numeric')) return '123'
  return ''
}

function hint(type: string): string {
  if (type.includes('timestamp')) return `${type} — ISO 8601 with offset; the database rejects anything else`
  if (type.includes('boolean')) return 'true or false'
  if (type.includes('ARRAY') || type.endsWith('[]')) return 'JSON array'
  return type
}

const dirtyCount = computed(() => edits.size)

onMounted(() => void reload())

async function reload() {
  error.value = ''
  edits.clear()
  Object.keys(columnErrors).forEach(key => delete columnErrors[key])
  try {
    const { data } = await fileApi.records(props.fileId)
    const payload = (data.records ?? {}) as { tables?: RecordTable[] }
    tables.value = payload.tables ?? []
    canEdit.value = data.canEdit !== false
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Could not read this record.'
  }
}

/**
 * Send only what changed, one column at a time: the daemon validates each value with the
 * column's own type, so a bad timestamp fails alone instead of taking the whole page down.
 */
async function save() {
  if (!dirtyCount.value || saving.value) return
  saving.value = true
  error.value = ''
  const failures: string[] = []

  for (const [key, value] of [...edits.entries()]) {
    const [table, rowIdText, column] = splitKey(key)
    const id = Number(rowIdText)
    if (!table || !column || Number.isNaN(id)) continue
    try {
      await fileApi.updateRecord(table, id, column, value)
      edits.delete(key)
    } catch (e: any) {
      const message = e?.response?.data?.error || 'Rejected by the database.'
      columnErrors[key] = message
      failures.push(`${column}: ${message}`)
    }
  }

  saving.value = false
  if (failures.length) error.value = `${failures.length} value(s) were not saved.`
  else await reload()
}

function splitKey(key: string): [string, string, string] {
  const first = key.indexOf('.')
  const second = key.indexOf('.', first + 1)
  if (first < 0 || second < 0) return ['', '', '']
  return [key.slice(0, first), key.slice(first + 1, second), key.slice(second + 1)]
}
</script>

<style scoped>
.record-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
}

.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
  font-size: 12px;
}

.title {
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dirty {
  color: var(--akiba-warning-text, #ffce80);
}

.clean {
  color: var(--akiba-chat-text-faint);
}

.save,
.revert {
  font-size: 12px;
  padding: 2px 10px;
}

.banner {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--akiba-chat-text-faint);
  border-bottom: 1px solid var(--vscode-panel-border);
}

.banner.error {
  color: var(--akiba-danger-text);
}

.body {
  flex: 1 1 auto;
  overflow: auto;
  padding: 10px 12px 24px;
}

.table-block {
  margin-bottom: 18px;
}

.table-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--vscode-panel-border);
  margin-bottom: 6px;
}

.table-name {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--vscode-descriptionForeground);
}

.table-count {
  font-size: 11px;
  color: var(--akiba-chat-text-faint);
}

.row-block {
  border-left: 1px solid var(--vscode-panel-border);
  padding-left: 10px;
  margin-bottom: 10px;
}

.field {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 2px 0;
  font-size: 12px;
}

.label {
  flex: 0 0 190px;
  color: var(--vscode-descriptionForeground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.label .type {
  display: block;
  font-size: 10px;
  opacity: 0.6;
}

.value.read-only {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--akiba-chat-text-faint);
  white-space: pre-wrap;
  word-break: break-word;
}

.length {
  opacity: 0.7;
}

.input {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  padding: 2px 6px;
  background: var(--vscode-input-background);
  color: var(--vscode-editor-foreground);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 2px;
  outline: none;
}

.input:focus {
  border-color: var(--vscode-focusBorder);
}

.input.dirty {
  border-color: var(--akiba-warning-text, #ffce80);
}

.area {
  resize: vertical;
  font-family: var(--vscode-editor-font-family, monospace);
}

.field-error {
  flex: 1 1 100%;
  color: var(--akiba-danger-text);
  font-size: 11px;
}
</style>
