<template>
  <div class="workflows">
    <!-- Start bar -->
    <div class="actions">
      <div class="input-group">
        <select v-model="selectedRuntimeConfig" class="config-select">
          <option value="">— Select a runtime configuration —</option>
          <option v-for="c in runtimeConfigs" :key="c.name" :value="c.name">{{ c.name }}</option>
        </select>
        <button @click="startWorkflow" :disabled="starting || !selectedRuntimeConfig">
          {{ starting ? 'Starting…' : 'Start' }}
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button :class="{ active: activeTab === 'running' }" @click="activeTab = 'running'">Running</button>
      <button :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">History</button>
    </div>

    <!-- Table -->
    <div v-if="loading && workflows.length === 0" class="loading">Loading...</div>
    <div v-else-if="displayWorkflows.length === 0" class="empty">No workflows</div>
    <div v-else class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>ID</th><th>Status</th><th>Progress</th><th>Success</th><th>Fail</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="wf in displayWorkflows" :key="wf.id">
            <td>{{ wf.id.slice(0, 8) }}...</td>
            <td><span :class="['status', wf.status]">{{ wf.status }}</span></td>
            <td>
              <div class="progress-cell">
                <div class="progress-bar"><div class="progress" :style="{ width: (wf.progress || 0) * 100 + '%' }"></div></div>
                <span class="progress-text">{{ ((wf.progress || 0) * 100).toFixed(1) }}%</span>
              </div>
            </td>
            <td>{{ wf.successCount }}</td>
            <td>{{ wf.failCount }}</td>
            <td class="actions-cell">
              <button v-if="wf.status === 'running'" @click="stopWorkflow(wf.id)" class="btn-action danger">Stop</button>
              <button @click="openLogViewer(wf.id, wf.status)" class="btn-action">Logs</button>
              <button @click="openDetail(wf.id, wf.status)" class="btn-action">Detail</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="message" :class="['message', messageType]">{{ message }}</div>

    <!-- Log Viewer Modal -->
    <div v-if="showLogModal" class="modal" @click.self="showLogModal = false">
      <div class="modal-content wide">
        <h2>Workflow Logs — {{ logWorkflowId?.slice(0, 8) }}...</h2>
        <div class="log-container" ref="logContainerRef">
          <div v-if="logLines.length === 0" class="log-empty">Waiting for logs…</div>
          <div v-for="(line, i) in logLines" :key="i" class="log-line">{{ line }}</div>
          <div v-if="logStatus === 'running'" class="log-line log-pending">Running…</div>
        </div>
        <div class="log-footer">
          <span :class="['status-badge', logStatus]">{{ logStatus }}</span>
          <div class="modal-actions"><button @click="showLogModal = false" class="btn-secondary">Close</button></div>
        </div>
      </div>
    </div>

    <!-- Detail Panel -->
    <div v-if="showDetail" class="detail-overlay" @click.self="showDetail = false">
      <div class="detail-panel">
        <div class="detail-header">
          <h2>Workflow Detail — {{ detailWorkflowId?.slice(0, 8) }}...</h2>
          <button @click="showDetail = false" class="btn-close">&times;</button>
        </div>

        <!-- File grid -->
        <div class="detail-section">
          <div class="section-title">Files (page {{ detailPage }} / {{ detailTotalPages }})</div>
          <div v-if="detailFiles.length === 0" class="muted">No file information yet. Waiting for the workflow to report file IDs…</div>
          <div v-else class="file-grid">
            <div
              v-for="f in pagedFiles"
              :key="f.id"
              :class="['file-tile', f.status, { selected: selectedFileId === f.id }]"
              :title="`File #${f.id}: ${f.status}`"
              @click="selectFile(f.id)"
            >
              {{ f.id }}
            </div>
          </div>
          <div v-if="detailTotalPages > 1" class="page-nav">
            <button class="btn-page" :disabled="detailPage <= 1" @click="detailPage--">&laquo; Prev</button>
            <span>{{ detailPage }} / {{ detailTotalPages }}</span>
            <button class="btn-page" :disabled="detailPage >= detailTotalPages" @click="detailPage++">Next &raquo;</button>
          </div>
        </div>

        <!-- File detail -->
        <div v-if="selectedFileId != null" class="detail-section">
          <div class="section-title">File #{{ selectedFileId }}</div>
          <div v-if="fileModuleLogs.length === 0" class="muted">No module data for this file yet.</div>
          <div v-else v-for="(ml, i) in fileModuleLogs" :key="i" class="module-entry">
            <div class="module-header">
              <span :class="['module-status', ml.status]">{{ ml.status }}</span>
              <span class="module-name">{{ ml.name }}</span>
            </div>
            <pre class="module-log">{{ ml.log }}</pre>
          </div>
          <!-- Real-time log for running file -->
          <div v-if="detailFileRunning" class="log-container mini">
            <div v-for="(line, i) in detailFileLogs" :key="i" class="log-line">{{ line }}</div>
            <div class="log-line log-pending">Processing…</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { workflowApi, runtimeConfigApi, type RuntimeConfigEntry } from '@/services/api'
import type { WorkflowStatus } from '@/types'

const PAGE_SIZE = 50

const workflows = ref<WorkflowStatus[]>([])
const loading = ref(false)
const starting = ref(false)
const activeTab = ref<'running' | 'history'>('running')
const message = ref('')
const messageType = ref('success')
const runtimeConfigs = ref<RuntimeConfigEntry[]>([])
const selectedRuntimeConfig = ref('')
let pollInterval: number | null = null

// Log viewer
const showLogModal = ref(false)
const logWorkflowId = ref<string | null>(null)
const logLines = ref<string[]>([])
const logStatus = ref<'running' | 'completed' | 'failed'>('running')
const logContainerRef = ref<HTMLElement | null>(null)

// Detail panel
const showDetail = ref(false)
const detailWorkflowId = ref<string | null>(null)
const detailWorkflowStatus = ref<string>('')
const detailFiles = ref<Array<{ id: number; status: string }>>([])
const detailPage = ref(1)
const selectedFileId = ref<number | null>(null)
const fileModuleLogs = ref<Array<{ name: string; status: string; log: string }>>([])
const detailFileRunning = ref(false)
const detailFileLogs = ref<string[]>([])

const detailTotalPages = computed(() => Math.max(1, Math.ceil(detailFiles.value.length / PAGE_SIZE)))
const pagedFiles = computed(() => {
  const start = (detailPage.value - 1) * PAGE_SIZE
  return detailFiles.value.slice(start, start + PAGE_SIZE)
})

// Watch for page change
watch(detailPage, () => { selectedFileId.value = null; fileModuleLogs.value = []; detailFileLogs.value = [] })

const displayWorkflows = computed(() => {
  if (activeTab.value === 'running') return workflows.value.filter(w => w.status === 'running')
  return workflows.value
})

onMounted(async () => {
  await Promise.all([loadWorkflows(), loadRuntimeConfigs()])
  pollInterval = window.setInterval(() => loadWorkflows(), 3000)
})

onUnmounted(() => { if (pollInterval) clearInterval(pollInterval) })

async function loadRuntimeConfigs() {
  try {
    const { data } = await runtimeConfigApi.list()
    runtimeConfigs.value = data.configs || []
  } catch (_e: any) { runtimeConfigs.value = [] }
}

async function loadWorkflows() {
  try {
    const response = activeTab.value === 'running'
      ? await workflowApi.running() : await workflowApi.history()
    workflows.value = response.data.workflows || []
  } catch (e) { console.error('Failed to load workflows:', e) }
}

async function startWorkflow() {
  if (!selectedRuntimeConfig.value) return
  starting.value = true
  try {
    const { data } = await workflowApi.start('akiba-instance', selectedRuntimeConfig.value, 1)
    showMessage('Workflow started', 'success')
    workflows.value.unshift({ id: data.workflowId, status: 'running', progress: 0, successCount: 0, failCount: 0 })
    activeTab.value = 'running'
    openLogViewer(data.workflowId, 'running')
  } catch (e: any) {
    showMessage(e.response?.data?.error || 'Failed to start workflow', 'error')
  } finally { starting.value = false }
}

async function stopWorkflow(id: string) {
  try { await workflowApi.stop(id); showMessage('Workflow stopped', 'success') }
  catch (e: any) { showMessage(e.response?.data?.error || 'Failed to stop workflow', 'error') }
}

// ---- Log viewer (SSE) ------------------------------------------------------
async function openLogViewer(id: string, initialStatus: string) {
  logWorkflowId.value = id
  logLines.value = []
  logStatus.value = initialStatus as 'running' | 'completed' | 'failed'
  showLogModal.value = true

  // First, fetch persistent log history
  try {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
    const baseUrl = `${protocol}//${window.location.host}/api`
    const resp = await fetch(`${baseUrl}/workflow/logs/${id}`)
    const data = await resp.json()
    if (data.logs && Array.isArray(data.logs) && data.logs.length > 0) {
      logLines.value = data.logs
    }
  } catch (_e: any) { /* ignore */ }

  // Then connect SSE for real-time updates
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
  const baseUrl = `${protocol}//${window.location.host}/api`
  const es = new EventSource(`${baseUrl}/workflow/stream/${id}`)
  es.onmessage = (event) => {
    const line = event.data
    if (line === '[DONE]') { es.close(); return }
    if (line.startsWith('[STATUS] ')) { logStatus.value = line.slice(9) as any; return }
    logLines.value.push(line)
    nextTick(() => { const el = logContainerRef.value; if (el) el.scrollTop = el.scrollHeight })
  }
  es.onerror = () => { es.close() }
}

// ---- Detail panel (SSE) ----------------------------------------------------
let detailEventSource: EventSource | null = null

function parseFileProgress(line: string, files: Array<{ id: number; status: string }>) {
  // Parse [FILES] 1,2,3,4,5
  if (line.startsWith('[FILES] ')) {
    const ids = line.slice(8).split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n))
    return ids.map((id: number) => ({ id, status: 'pending' as string }))
  }
  // Parse [FILE:id] status
  const fileMatch = line.match(/^\[FILE:(\d+)\]\s*(.+)$/)
  if (fileMatch) {
    const fid = parseInt(fileMatch[1])
    const fstatus = fileMatch[2].trim()
    const idx = files.findIndex(f => f.id === fid)
    if (idx >= 0) files[idx].status = fstatus
  }
  return null
}

async function openDetail(id: string, initialStatus: string) {
  // Close previous SSE if any
  if (detailEventSource) { detailEventSource.close(); detailEventSource = null }

  showDetail.value = true
  detailWorkflowId.value = id
  detailWorkflowStatus.value = initialStatus
  detailFiles.value = []
  detailPage.value = 1
  selectedFileId.value = null
  fileModuleLogs.value = []
  detailFileRunning.value = false
  detailFileLogs.value = []

  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
  const baseUrl = `${protocol}//${window.location.host}/api`

  // First, load history from persistent log to populate file grid
  try {
    const resp = await fetch(`${baseUrl}/workflow/logs/${id}`)
    const data = await resp.json()
    if (data.logs && Array.isArray(data.logs)) {
      for (const line of data.logs) {
        const result = parseFileProgress(line, detailFiles.value)
        if (result !== null && result.length > 0) {
          // Only replace files array if FILES was parsed (first time)
          if (line.startsWith('[FILES] ')) {
            detailFiles.value = result
          }
        }
      }
    }
  } catch (_e: any) { /* ignore */ }

  // Connect SSE for real-time updates
  detailEventSource = new EventSource(`${baseUrl}/workflow/stream/${id}`)
  detailEventSource.onmessage = (event) => {
    const line = event.data
    if (line === '[DONE]' || line.startsWith('[STATUS]')) return

    const result = parseFileProgress(line, detailFiles.value)
    if (result !== null && result.length > 0) {
      detailFiles.value = result
      return
    }

    // General log — add to file detail logs if a file is selected
    detailFileLogs.value.push(line)
    if (selectedFileId.value != null) {
      detailFileRunning.value = true
    }
  }
  detailEventSource.onerror = () => { if (detailEventSource) { detailEventSource.close(); detailEventSource = null } }
}

function selectFile(fid: number) {
  selectedFileId.value = fid
  fileModuleLogs.value = []
  detailFileLogs.value = []

  // Check if this file is still running
  const f = detailFiles.value.find(f => f.id === fid)
  detailFileRunning.value = f?.status === 'running' || f?.status === 'pending'

  // Try to fetch module logs from log files
  const wfId = detailWorkflowId.value
  if (!wfId) return
  // Fetch logs from the module log directory
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
  fetch(`${protocol}//${window.location.host}/api/workflow/file-logs/${wfId}/${fid}`)
    .then(res => res.json())
    .then(data => {
      if (data.modules) fileModuleLogs.value = data.modules
    })
    .catch(() => { /* ignore */ })
}

function showMessage(msg: string, type: 'success' | 'error') {
  message.value = msg
  messageType.value = type
  setTimeout(() => { message.value = '' }, 3000)
}
</script>

<style scoped>
.workflows { background: #fff; padding: 24px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.actions { margin-bottom: 20px; }
.input-group { display: flex; gap: 10px; }
.config-select { flex: 1; padding: 10px 14px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; background: #fff; min-width: 200px; }
.input-group button { padding: 10px 24px; background: #e94560; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
.input-group button:disabled { opacity: 0.6; cursor: not-allowed; }
.tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid #eee; }
.tabs button { padding: 10px 20px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-size: 14px; color: #666; }
.tabs button.active { color: #e94560; border-bottom-color: #e94560; }
.loading, .empty { text-align: center; padding: 40px; color: #999; }
.table-wrapper { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 14px 16px; text-align: left; border-bottom: 1px solid #eee; }
.table th { font-weight: 600; color: #666; font-size: 14px; }
.progress-cell { display: flex; align-items: center; gap: 8px; }
.progress-bar { width: 100px; height: 6px; background: #e0e0e0; border-radius: 3px; }
.progress { height: 100%; background: #e94560; border-radius: 3px; }
.progress-text { font-size: 12px; color: #666; white-space: nowrap; }
.actions-cell { white-space: nowrap; }
.status { font-size: 12px; padding: 4px 10px; border-radius: 12px; font-weight: 500; }
.status.running { background: #e3f2fd; color: #1976d2; }
.status.completed { background: #e8f5e9; color: #388e3c; }
.status.failed { background: #ffebee; color: #d32f2f; }
.status.cancelled { background: #fff3e0; color: #f57c00; }
.btn-action { padding: 6px 12px; margin-right: 6px; border: 1px solid #ddd; background: #fff; border-radius: 4px; font-size: 13px; cursor: pointer; }
.btn-action.danger { color: #e94560; border-color: #e94560; }
.btn-action.danger:hover { background: #e94560; color: #fff; }
.message { margin-top: 16px; padding: 12px; border-radius: 6px; font-size: 14px; }
.message.success { background: #e8f5e9; color: #388e3c; }
.message.error { background: #ffebee; color: #d32f2f; }
.muted { color: #999; font-size: 13px; padding: 10px 0; }

/* Modal (log viewer) */
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal-content { background: #fff; padding: 24px; border-radius: 10px; width: 700px; max-width: 90vw; max-height: 85vh; display: flex; flex-direction: column; }
.modal-content.wide { width: 750px; }
.modal-content h2 { margin: 0 0 14px; font-size: 16px; }
.log-container { flex: 1; min-height: 200px; max-height: 500px; overflow-y: auto; background: #1a1a2e; color: #e0e0e0; font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.5; padding: 14px; border-radius: 6px; }
.log-container.mini { max-height: 250px; }
.log-empty { color: #888; text-align: center; padding: 40px 0; }
.log-line { white-space: pre-wrap; word-break: break-all; }
.log-pending { color: #888; font-style: italic; }
.log-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
.status-badge { font-size: 12px; padding: 4px 12px; border-radius: 10px; font-weight: 500; text-transform: lowercase; }
.status-badge.running { background: #e3f2fd; color: #1976d2; }
.status-badge.completed { background: #e8f5e9; color: #388e3c; }
.status-badge.failed { background: #ffebee; color: #d32f2f; }
.modal-actions { display: flex; gap: 10px; }
.btn-secondary { padding: 8px 18px; background: #f5f5f5; color: #333; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }

/* Detail panel */
.detail-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.detail-panel { background: #fff; border-radius: 12px; width: 800px; max-width: 92vw; max-height: 88vh; overflow-y: auto; padding: 24px; }
.detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
.detail-header h2 { margin: 0; font-size: 18px; }
.btn-close { background: none; border: none; font-size: 28px; color: #999; cursor: pointer; line-height: 1; padding: 0 4px; }
.btn-close:hover { color: #333; }
.detail-section { margin-bottom: 20px; }
.section-title { font-size: 13px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }

/* File grid */
.file-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.file-tile {
  width: 44px; height: 44px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-family: monospace; font-weight: 500;
  cursor: pointer; border: 2px solid transparent; transition: all 0.15s;
}
.file-tile.pending { background: #f0f0f0; color: #999; }
.file-tile.running { background: #e3f2fd; color: #1976d2; border-color: #90caf9; }
.file-tile.completed { background: #e8f5e9; color: #388e3c; border-color: #a5d6a7; }
.file-tile.failed { background: #ffebee; color: #d32f2f; border-color: #ef9a9a; }
.file-tile.selected { border-color: #1a1a2e; box-shadow: 0 0 0 2px #1a1a2e; }
.file-tile:hover { transform: scale(1.1); }

.page-nav { display: flex; align-items: center; gap: 14px; margin-top: 12px; font-size: 13px; color: #666; }
.btn-page { padding: 4px 12px; border: 1px solid #ddd; border-radius: 4px; background: #fff; font-size: 12px; cursor: pointer; }
.btn-page:disabled { opacity: 0.4; cursor: not-allowed; }

/* Module entry */
.module-entry { background: #f9f9f9; border: 1px solid #eee; border-radius: 6px; margin-bottom: 8px; overflow: hidden; }
.module-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #fafafa; border-bottom: 1px solid #eee; }
.module-status { font-size: 11px; padding: 2px 8px; border-radius: 8px; font-weight: 500; }
.module-status.running { background: #e3f2fd; color: #1976d2; }
.module-status.completed { background: #e8f5e9; color: #388e3c; }
.module-status.failed { background: #ffebee; color: #d32f2f; }
.module-name { font-size: 13px; font-weight: 500; color: #333; }
.module-log { margin: 0; padding: 10px 12px; font-size: 12px; font-family: 'Courier New', monospace; color: #555; white-space: pre-wrap; max-height: 150px; overflow-y: auto; background: #f5f5f5; }
</style>
