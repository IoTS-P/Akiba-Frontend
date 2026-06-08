<template>
  <div class="files-page">
    <div class="page-header">
      <h2>Files</h2>
      <div class="header-actions">
        <button @click="loadFiles" class="btn-secondary" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
        <button @click="showImportDialog = true" class="btn-primary">
          + Import
        </button>
      </div>
    </div>

    <!-- Import Dialog -->
    <div v-if="showImportDialog" class="dialog-overlay" @click.self="closeImportDialog">
      <div class="dialog">
        <h3>Import Files</h3>
        <p class="dialog-hint">
          Select binary files to upload. Multiple files can be selected at once.
        </p>
        <div
          class="file-drop-zone"
          :class="{ 'drag-over': isDragOver }"
          @click="triggerFileInput"
          @dragover.prevent="onDragOver"
          @dragleave.prevent="onDragLeave"
          @drop.prevent="onDrop"
        >
          <input
            ref="fileInputRef"
            type="file"
            multiple
            @change="onFilesSelected"
            class="file-input"
          />
          <p class="drop-placeholder">
            Click to select files, or drag &amp; drop here
          </p>
        </div>

        <!-- Selected file list (outside drop zone) -->
        <div v-if="selectedFiles.length > 0" class="file-list">
          <div class="file-list-header">
            <span>Selected files ({{ selectedFiles.length }})</span>
            <button class="btn-link" @click="clearSelectedFiles">Clear all</button>
          </div>
          <div v-for="(f, i) in selectedFiles" :key="i" class="file-item">
            <span class="file-name">{{ f.name }}</span>
            <span class="file-size">{{ formatSize(f.size) }}</span>
            <button class="btn-remove" @click="removeSelectedFile(i)" title="Remove">&times;</button>
          </div>
        </div>
        <!-- Import progress (SSE streaming) -->
        <div v-if="importing || importLog.length > 0" class="import-progress">
          <div class="progress-header">
            <span>Import Progress</span>
            <span :class="['status-badge', importStatus]">{{ importStatus }}</span>
          </div>
          <div class="progress-log" ref="progressLogEl">
            <div v-for="(line, i) in importLog" :key="i" class="log-line">{{ line }}</div>
            <div v-if="importing" class="log-line log-pending">Running…</div>
          </div>
        </div>

        <div v-if="importError" class="error-msg">{{ importError }}</div>
        <div v-if="importResult" class="success-msg">{{ importResult }}</div>

        <div class="dialog-actions">
          <button @click="closeImportDialog" class="btn-secondary" :disabled="importing">Cancel</button>
          <button @click="doImport" class="btn-primary" :disabled="importing || selectedFiles.length === 0">
            {{ importing ? 'Importing...' : `Import (${selectedFiles.length})` }}
          </button>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div v-if="error" class="error-msg">{{ error }}</div>
    <div v-else-if="files.length === 0 && !loading" class="empty-state">
      <p>No files found.</p>
      <p class="hint">Use the "Import" button to upload binary files for analysis.</p>
    </div>
    <div v-else class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Format</th>
            <th>Architecture</th>
            <th>Compiler</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="file in files" :key="file.id">
            <td class="cell-id">{{ file.id }}</td>
            <td class="cell-name" :title="file.originalPath">{{ file.name }}</td>
            <td><span class="badge">{{ file.type }}</span></td>
            <td>{{ file.arch || '-' }}</td>
            <td>{{ file.compilerSpec || '-' }}</td>
            <td>
              <button @click="deleteFile(file)" class="btn-action danger" title="Delete">
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div class="pagination" v-if="totalItems > 0">
        <span class="page-info">
          Showing {{ Math.min((currentPage - 1) * pageSize + 1, totalItems) }}–{{ Math.min(currentPage * pageSize, totalItems) }} of {{ totalItems }}
        </span>
        <div class="page-controls">
          <button
            @click="goToPage(currentPage - 1)"
            :disabled="currentPage <= 1"
            class="btn-page"
          >
            ‹ Previous
          </button>
          <span class="page-indicator">Page {{ currentPage }} / {{ totalPages }}</span>
          <button
            @click="goToPage(currentPage + 1)"
            :disabled="currentPage >= totalPages"
            class="btn-page"
          >
            Next ›
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import api, { fileApi, type FileEntry } from '@/services/api'

const files = ref<FileEntry[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Pagination state
const currentPage = ref(1)
const pageSize = ref(20)
const totalItems = ref(0)

const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pageSize.value)))

// Import dialog state
const showImportDialog = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFiles = ref<File[]>([])
const importing = ref(false)
const importError = ref<string | null>(null)
const importResult = ref<string | null>(null)
const isDragOver = ref(false)
const progressLogEl = ref<HTMLElement | null>(null)
const importLog = ref<string[]>([])
const importStatus = ref<'running' | 'completed' | 'failed'>('running')

onMounted(async () => {
  await loadFiles()
})

async function loadFiles() {
  loading.value = true
  error.value = null
  try {
    const offset = (currentPage.value - 1) * pageSize.value
    const response = await fileApi.list(offset, pageSize.value)
    files.value = response.data.files || []
    totalItems.value = response.data.total || 0
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Failed to load files'
    console.error('Failed to load files:', e)
  } finally {
    loading.value = false
  }
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  loadFiles()
}

function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    for (let i = 0; i < input.files.length; i++) {
      const f = input.files[i]
      // Avoid duplicates by name+size
      if (!selectedFiles.value.some(s => s.name === f.name && s.size === f.size)) {
        selectedFiles.value.push(f)
      }
    }
  }
  // Reset input so re-selecting the same file triggers change again
  if (input) input.value = ''
}

function removeSelectedFile(index: number) {
  selectedFiles.value.splice(index, 1)
}

function clearSelectedFiles() {
  selectedFiles.value = []
  importError.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function onDragOver(_event: DragEvent) {
  isDragOver.value = true
}

function onDragLeave(_event: DragEvent) {
  isDragOver.value = false
}

function onDrop(event: DragEvent) {
  isDragOver.value = false
  const dt = event.dataTransfer
  if (dt && dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i]
      if (!selectedFiles.value.some(s => s.name === f.name && s.size === f.size)) {
        selectedFiles.value.push(f)
      }
    }
  }
}

function closeImportDialog() {
  showImportDialog.value = false
  selectedFiles.value = []
  importError.value = null
  importResult.value = null
  importLog.value = []
  importStatus.value = 'running'
  importing.value = false
  isDragOver.value = false
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function doImport() {
  if (selectedFiles.value.length === 0) {
    importError.value = 'Please select at least one file'
    return
  }

  importing.value = true
  importError.value = null
  importResult.value = null
  importLog.value = []
  importStatus.value = 'running'

  try {
    const formData = new FormData()
    for (const file of selectedFiles.value) {
      formData.append('files', file)
    }
    // Initiate import — returns taskId immediately
    const initRes = await api.post('/files/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    const taskId = initRes.data.taskId
    importLog.value.push(`[Task] ${initRes.data.message}`)

    // Stream progress via SSE
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
    const baseUrl = `${protocol}//${window.location.host}/api`
    const eventSource = new EventSource(`${baseUrl}/files/import/stream/${taskId}`)

    const finalStatus = await new Promise<'completed' | 'failed'>((resolve, reject) => {
      eventSource.onmessage = (event) => {
        const line = event.data
        if (line.startsWith('[STATUS] ')) {
          importStatus.value = line.slice(9) as 'running' | 'completed' | 'failed'
          if (line.slice(9) === 'completed' || line.slice(9) === 'failed') {
            resolve(line.slice(9) as 'completed' | 'failed')
          }
        } else if (line === '[DONE]') {
          eventSource.close()
          resolve('completed')
        } else {
          importLog.value.push(line)
          nextTick(() => {
            const el = progressLogEl.value
            if (el) el.scrollTop = el.scrollHeight
          })
        }
      }
      eventSource.onerror = () => {
        eventSource.close()
        if (importStatus.value !== 'failed') {
          resolve('completed')
        } else {
          reject(new Error('SSE connection error'))
        }
      }
    })

    // Refresh file list after import completes
    if (finalStatus === 'completed') {
      importResult.value = 'Import completed successfully.'
      currentPage.value = 1
      await loadFiles()
    } else {
      importError.value = 'Import process failed. Check the log above.'
    }
  } catch (e: any) {
    importError.value = e?.response?.data?.error || e?.message || 'Import failed'
    importStatus.value = 'failed'
    console.error('Import failed:', e)
  } finally {
    importing.value = false
  }
}

async function deleteFile(file: FileEntry) {
  if (!confirm(`Delete file "${file.name}" (ID: ${file.id})?`)) return
  try {
    await fileApi.delete([file.id])
    // If we deleted the last item on the page, go back one page
    if (files.value.length === 1 && currentPage.value > 1) {
      currentPage.value--
    }
    await loadFiles()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Failed to delete file'
    console.error('Failed to delete file:', e)
  }
}
</script>

<style scoped>
.files-page {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 1.4rem;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.btn-primary {
  background: var(--primary, #4f46e5);
  color: #fff;
  border: none;
  padding: 8px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-primary:hover { opacity: 0.9; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  background: var(--bg-secondary, #f3f4f6);
  color: var(--text, #374151);
  border: 1px solid var(--border, #d1d5db);
  padding: 8px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-secondary:hover { background: var(--bg-hover, #e5e7eb); }

.btn-action.danger {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.btn-action.danger:hover { background: #fecaca; }

.table-wrapper {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.table th,
.table td {
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border, #e5e7eb);
}

.table th {
  background: var(--bg-secondary, #f9fafb);
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  white-space: nowrap;
}

.cell-id {
  font-family: monospace;
  color: var(--text-secondary, #6b7280);
  width: 60px;
}

.cell-name {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e0e7ff;
  color: #4338ca;
  font-size: 0.8rem;
  font-weight: 500;
}

.empty-state {
  text-align: center;
  padding: 60px 0;
  color: var(--text-secondary, #6b7280);
}

.empty-state p { margin: 6px 0; }
.empty-state .hint { font-size: 0.85rem; }

.error-msg {
  color: #dc2626;
  background: #fee2e2;
  padding: 10px 16px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 0.85rem;
}

.success-msg {
  color: #059669;
  background: #d1fae5;
  padding: 10px 16px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 0.85rem;
}

/* Dialog */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  background: #fff;
  border-radius: 10px;
  padding: 28px;
  width: 520px;
  max-width: 90vw;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
}

.dialog h3 {
  margin: 0 0 8px;
  font-size: 1.15rem;
}

.dialog-hint {
  color: var(--text-secondary, #6b7280);
  font-size: 0.85rem;
  margin-bottom: 14px;
}

.file-drop-zone {
  border: 2px dashed var(--border, #d1d5db);
  border-radius: 8px;
  padding: 28px 20px;
  text-align: center;
  transition: border-color 0.2s, background 0.2s;
  cursor: pointer;
  margin-bottom: 0;
}

.file-drop-zone:hover {
  border-color: var(--primary, #4f46e5);
}

.file-drop-zone.drag-over {
  border-color: var(--primary, #4f46e5);
  background: #eef2ff;
}

.file-input {
  display: none;
}

.drop-placeholder {
  color: var(--text-secondary, #6b7280);
  margin: 0;
  font-size: 0.85rem;
}

/* File list (outside drop zone) */
.file-list {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  margin-top: 12px;
  max-height: 220px;
  overflow-y: auto;
}

.file-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 14px;
  background: var(--bg-secondary, #f9fafb);
  border-bottom: 1px solid var(--border, #e5e7eb);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
}

.btn-link {
  background: none;
  border: none;
  color: var(--primary, #4f46e5);
  cursor: pointer;
  font-size: 0.78rem;
  padding: 2px 6px;
}
.btn-link:hover { text-decoration: underline; }

.file-item {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.85rem;
}
.file-item:last-child { border-bottom: none; }
.file-item:hover { background: #fafafa; }

.file-item .file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
}

.file-item .file-size {
  color: var(--text-secondary, #6b7280);
  margin: 0 12px;
  flex-shrink: 0;
  font-size: 0.8rem;
}

.btn-remove {
  background: none;
  border: none;
  color: #999;
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
  flex-shrink: 0;
}
.btn-remove:hover {
  color: #dc2626;
}

.selected-files {
  list-style: none;
  padding: 0;
  margin: 0;
  text-align: left;
}

.selected-files li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 0.85rem;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  font-family: monospace;
}

.file-size {
  color: var(--text-secondary, #6b7280);
  margin-left: 12px;
  flex-shrink: 0;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

/* Pagination */
.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  padding: 10px 0;
  font-size: 0.85rem;
  color: var(--text-secondary, #6b7280);
}

.page-info {
  white-space: nowrap;
}

.page-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-indicator {
  min-width: 100px;
  text-align: center;
}

.btn-page {
  background: var(--bg-secondary, #f3f4f6);
  color: var(--text, #374151);
  border: 1px solid var(--border, #d1d5db);
  padding: 5px 14px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.85rem;
}

.btn-page:hover:not(:disabled) {
  background: var(--bg-hover, #e5e7eb);
}

.btn-page:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Import progress */
.import-progress {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
}
.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 14px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.8rem;
  font-weight: 500;
  color: #374151;
}
.status-badge {
  font-size: 0.75rem;
  padding: 2px 10px;
  border-radius: 10px;
  text-transform: lowercase;
}
.status-badge.running { background: #e3f2fd; color: #1976d2; }
.status-badge.completed { background: #e8f5e9; color: #388e3c; }
.status-badge.failed { background: #ffebee; color: #d32f2f; }

.progress-log {
  max-height: 240px;
  overflow-y: auto;
  padding: 8px 14px;
  background: #1a1a2e;
  font-family: 'Courier New', monospace;
  font-size: 0.78rem;
  line-height: 1.5;
  color: #e0e0e0;
}
.log-line { white-space: pre-wrap; word-break: break-all; }
.log-pending { color: #888; font-style: italic; }
</style>
