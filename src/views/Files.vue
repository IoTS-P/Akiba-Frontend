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
          Enter absolute file paths, one per line. The server must have access to these paths.
        </p>
        <textarea
          v-model="importPaths"
          rows="6"
          placeholder="/data/samples/binary.elf&#10;/data/samples/firmware.bin"
          class="import-textarea"
        ></textarea>
        <div v-if="importError" class="error-msg">{{ importError }}</div>
        <div v-if="importResult" class="success-msg">{{ importResult }}</div>
        <div class="dialog-actions">
          <button @click="closeImportDialog" class="btn-secondary">Cancel</button>
          <button @click="doImport" class="btn-primary" :disabled="importing">
            {{ importing ? 'Importing...' : 'Import' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div v-if="error" class="error-msg">{{ error }}</div>
    <div v-else-if="files.length === 0 && !loading" class="empty-state">
      <p>No files found.</p>
      <p class="hint">Use the "Import" button to add binary files for analysis.</p>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fileApi, type FileEntry } from '@/services/api'

const files = ref<FileEntry[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Import dialog state
const showImportDialog = ref(false)
const importPaths = ref('')
const importing = ref(false)
const importError = ref<string | null>(null)
const importResult = ref<string | null>(null)

onMounted(async () => {
  await loadFiles()
})

async function loadFiles() {
  loading.value = true
  error.value = null
  try {
    const response = await fileApi.list()
    files.value = response.data.files || []
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Failed to load files'
    console.error('Failed to load files:', e)
  } finally {
    loading.value = false
  }
}

function closeImportDialog() {
  showImportDialog.value = false
  importPaths.value = ''
  importError.value = null
  importResult.value = null
}

async function doImport() {
  const paths = importPaths.value
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  if (paths.length === 0) {
    importError.value = 'Please enter at least one file path'
    return
  }

  importing.value = true
  importError.value = null
  importResult.value = null

  try {
    const response = await fileApi.import(paths)
    importResult.value = `Successfully imported ${response.data.fileIds.length} file(s): [${response.data.fileIds.join(', ')}]`
    closeImportDialog()
    await loadFiles()
  } catch (e: any) {
    importError.value = e?.response?.data?.error || 'Import failed'
    console.error('Import failed:', e)
  } finally {
    importing.value = false
  }
}

async function deleteFile(file: FileEntry) {
  if (!confirm(`Delete file "${file.name}" (ID: ${file.id})?`)) return
  try {
    await fileApi.delete([file.id])
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

.import-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  font-family: monospace;
  font-size: 0.85rem;
  resize: vertical;
  box-sizing: border-box;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
</style>
