<template>
  <div class="workflows">
    <div class="actions">
      <div class="input-group">
        <input v-model="newWorkflow.instanceName" placeholder="Instance name" />
        <input v-model="newWorkflow.configPath" placeholder="Config path (optional)" />
        <input v-model.number="newWorkflow.threads" type="number" placeholder="Threads" min="1" />
        <button @click="startWorkflow" :disabled="loading || !newWorkflow.instanceName">Start</button>
      </div>
    </div>
    <div class="tabs">
      <button :class="{ active: activeTab === 'running' }" @click="activeTab = 'running'">Running</button>
      <button :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">History</button>
    </div>
    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="displayWorkflows.length === 0" class="empty">No workflows</div>
    <div v-else class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Success</th>
            <th>Fail</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="wf in displayWorkflows" :key="wf.id">
            <td>{{ wf.id.slice(0, 8) }}...</td>
            <td><span :class="['status', wf.status]">{{ wf.status }}</span></td>
            <td>
              <div class="progress-bar">
                <div class="progress" :style="{ width: wf.progress * 100 + '%' }"></div>
              </div>
              <span class="progress-text">{{ (wf.progress * 100).toFixed(1) }}%</span>
            </td>
            <td>{{ wf.successCount }}</td>
            <td>{{ wf.failCount }}</td>
            <td>
              <button v-if="wf.status === 'running'" @click="stopWorkflow(wf.id)" class="btn-action danger">Stop</button>
              <button @click="refreshWorkflow(wf.id)" class="btn-action">Refresh</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="message" :class="['message', messageType]">{{ message }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { workflowApi } from '@/services/api'
import type { WorkflowStatus } from '@/types'

const workflows = ref<WorkflowStatus[]>([])
const loading = ref(false)
const activeTab = ref<'running' | 'history'>('running')
const message = ref('')
const messageType = ref('success')
const newWorkflow = ref({ instanceName: '', configPath: '', threads: 1 })
let pollInterval: number | null = null

const displayWorkflows = computed(() => {
  if (activeTab.value === 'running') {
    return workflows.value.filter(w => w.status === 'running')
  }
  return workflows.value
})

onMounted(async () => {
  await loadWorkflows()
  pollInterval = window.setInterval(() => loadWorkflows(), 5000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})

async function loadWorkflows() {
  try {
    const response = activeTab.value === 'running'
      ? await workflowApi.running()
      : await workflowApi.history()
    workflows.value = response.data.workflows || []
  } catch (e) {
    console.error('Failed to load workflows:', e)
  }
}

async function startWorkflow() {
  if (!newWorkflow.value.instanceName) return
  loading.value = true
  try {
    await workflowApi.start(
      newWorkflow.value.instanceName,
      newWorkflow.value.configPath || undefined,
      newWorkflow.value.threads
    )
    showMessage('Workflow started', 'success')
    newWorkflow.value = { instanceName: '', configPath: '', threads: 1 }
    await loadWorkflows()
  } catch (e: any) {
    showMessage(e.response?.data?.error || 'Failed to start workflow', 'error')
  } finally {
    loading.value = false
  }
}

async function stopWorkflow(id: string) {
  try {
    await workflowApi.stop(id)
    showMessage('Workflow stopped', 'success')
    await loadWorkflows()
  } catch (e: any) {
    showMessage(e.response?.data?.error || 'Failed to stop workflow', 'error')
  }
}

async function refreshWorkflow(id: string) {
  try {
    const response = await workflowApi.status(id)
    const index = workflows.value.findIndex(w => w.id === id)
    if (index >= 0) {
      workflows.value[index] = response.data
    }
  } catch (e) {
    console.error('Failed to refresh workflow:', e)
  }
}

function showMessage(msg: string, type: 'success' | 'error') {
  message.value = msg
  messageType.value = type
  setTimeout(() => { message.value = '' }, 3000)
}
</script>

<style scoped>
.workflows {
  background: #fff;
  padding: 24px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.actions {
  margin-bottom: 20px;
}

.input-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.input-group input {
  padding: 10px 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.input-group input:first-child {
  flex: 1;
  min-width: 150px;
}

.input-group input[type="number"] {
  width: 80px;
}

.input-group button {
  padding: 10px 20px;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.input-group button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 1px solid #eee;
}

.tabs button {
  padding: 10px 20px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 14px;
  color: #666;
}

.tabs button.active {
  color: #e94560;
  border-bottom-color: #e94560;
}

.loading, .empty {
  text-align: center;
  padding: 40px;
  color: #999;
}

.table-wrapper {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th, .table td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.table th {
  font-weight: 600;
  color: #666;
  font-size: 14px;
}

.status {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: 500;
}

.status.running { background: #e3f2fd; color: #1976d2; }
.status.completed { background: #e8f5e9; color: #388e3c; }
.status.failed { background: #ffebee; color: #d32f2f; }
.status.cancelled { background: #fff3e0; color: #f57c00; }

.progress-bar {
  width: 100px;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  display: inline-block;
  vertical-align: middle;
}

.progress {
  height: 100%;
  background: #e94560;
}

.progress-text {
  font-size: 12px;
  color: #666;
  margin-left: 8px;
}

.btn-action {
  padding: 6px 12px;
  margin-right: 6px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.btn-action.danger { color: #e94560; border-color: #e94560; }
.btn-action.danger:hover { background: #e94560; color: #fff; }

.message {
  margin-top: 16px;
  padding: 12px;
  border-radius: 6px;
  font-size: 14px;
}

.message.success { background: #e8f5e9; color: #388e3c; }
.message.error { background: #ffebee; color: #d32f2f; }
</style>