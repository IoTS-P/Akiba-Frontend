<template>
  <div class="scripts">
    <div class="actions">
      <button @click="showCreateModal = true" class="btn-primary">New Script</button>
    </div>
    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="scripts.length === 0" class="empty">No scripts yet</div>
    <div v-else class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="script in scripts" :key="script.id">
            <td>{{ script.id }}</td>
            <td>{{ script.name }}</td>
            <td><span :class="['status', script.status]">{{ script.status }}</span></td>
            <td>{{ formatDate(script.createdAt) }}</td>
            <td>
              <button @click="viewScript(script)" class="btn-action">View</button>
              <button @click="runScript(script)" class="btn-action">Run</button>
              <button @click="deleteScript(script)" class="btn-action danger">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showCreateModal" class="modal" @click.self="showCreateModal = false">
      <div class="modal-content">
        <h2>New Script</h2>
        <div class="form-group">
          <label>Name</label>
          <input v-model="newScript.name" placeholder="Script name" />
        </div>
        <div class="form-group">
          <label>Code</label>
          <textarea v-model="newScript.code" placeholder="bash code..." rows="10"></textarea>
        </div>
        <div class="modal-actions">
          <button @click="showCreateModal = false" class="btn-secondary">Cancel</button>
          <button @click="createScript" class="btn-primary">Create & Run</button>
        </div>
      </div>
    </div>

    <div v-if="showViewModal" class="modal" @click.self="showViewModal = false">
      <div class="modal-content wide">
        <h2>{{ selectedScript?.name }}</h2>
        <div class="section-label">Code</div>
        <pre class="code-block">{{ selectedScript?.code }}</pre>
        <div class="section-label">Output</div>
        <pre class="code-block output">{{ selectedScript?.output || 'No output' }}</pre>
        <div class="modal-actions">
          <button @click="showViewModal = false" class="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { scriptApi } from '@/services/api'
import type { Script } from '@/types'

const scripts = ref<Script[]>([])
const loading = ref(false)
const showCreateModal = ref(false)
const showViewModal = ref(false)
const selectedScript = ref<Script | null>(null)
const newScript = ref({ name: '', code: '' })

onMounted(async () => {
  await loadScripts()
})

async function loadScripts() {
  loading.value = true
  try {
    const response = await scriptApi.list()
    scripts.value = response.data.scripts || []
  } catch (e) {
    console.error('Failed to load scripts:', e)
  } finally {
    loading.value = false
  }
}

async function createScript() {
  if (!newScript.value.name || !newScript.value.code) return
  try {
    await scriptApi.run(newScript.value.name, newScript.value.code)
    showCreateModal.value = false
    newScript.value = { name: '', code: '' }
    await loadScripts()
  } catch (e) {
    console.error('Failed to create script:', e)
  }
}

async function runScript(script: Script) {
  try {
    await scriptApi.run(script.name, script.code)
    await loadScripts()
  } catch (e) {
    console.error('Failed to run script:', e)
  }
}

function viewScript(script: Script) {
  selectedScript.value = script
  showViewModal.value = true
}

async function deleteScript(script: Script) {
  if (!confirm(`Delete script "${script.name}"?`)) return
  try {
    await scriptApi.delete(script.id)
    await loadScripts()
  } catch (e) {
    console.error('Failed to delete script:', e)
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleString()
}
</script>

<style scoped>
.scripts {
  background: #fff;
  padding: 24px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.actions {
  margin-bottom: 20px;
}

.btn-primary {
  padding: 10px 20px;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-secondary {
  padding: 10px 20px;
  background: #f5f5f5;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
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

.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-content {
  background: #fff;
  padding: 30px;
  border-radius: 10px;
  width: 500px;
  max-width: 90vw;
}

.modal-content.wide {
  width: 800px;
}

.modal-content h2 {
  margin-bottom: 20px;
  font-size: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  font-family: monospace;
}

.form-group textarea {
  resize: vertical;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.section-label {
  font-size: 14px;
  font-weight: 500;
  color: #666;
  margin: 16px 0 8px;
}

.code-block {
  background: #f8f9fa;
  padding: 14px;
  border-radius: 6px;
  font-size: 13px;
  font-family: monospace;
  overflow-x: auto;
  white-space: pre-wrap;
}

.code-block.output {
  max-height: 200px;
  overflow-y: auto;
}
</style>