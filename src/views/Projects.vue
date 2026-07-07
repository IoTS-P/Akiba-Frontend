<template>
  <div class="projects-page">
    <div class="toolbar">
      <span class="title">Ghidra Projects – {{ projects.length }} project(s)</span>
      <button class="refresh-btn" @click="fetchProjects" :disabled="loading">Refresh</button>
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
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="project in projects" :key="project.name">
          <td class="project-name">{{ project.name }}</td>
          <td>{{ project.sessionCount }}</td>
          <td>{{ project.fileCount }}</td>
          <td class="actions-cell">
            <button
              class="export-btn"
              @click="exportProject(project.name)"
              :disabled="exporting === project.name"
            >
              {{ exporting === project.name ? 'Exporting…' : 'Export .gar' }}
            </button>
            <button
              class="export-text-btn"
              @click="startTextExport(project.name)"
              :disabled="textExporting === project.name"
            >
              {{ textExporting === project.name ? 'Exporting…' : 'Export Text' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Text export options modal -->
    <div v-if="textExportModal.show" class="modal-overlay" @click.self="closeTextExportModal">
      <div class="modal-content">
        <div class="modal-header">
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { projectApi } from '@/services/api'
import type { ExportTextStatus } from '@/services/api'
import type { GhidraProjectInfo } from '@/types'

const projects = ref<GhidraProjectInfo[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const exporting = ref<string | null>(null)
const textExporting = ref<string | null>(null)

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

onMounted(fetchProjects)
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

.export-btn, .export-text-btn {
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
.export-btn:hover:not(:disabled), .export-text-btn:hover:not(:disabled) {
  background: #e94560;
  color: #fff;
}
.export-text-btn:hover:not(:disabled) {
  background: #4a90d9;
  color: #fff;
}
.export-btn:disabled, .export-text-btn:disabled {
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
</style>
