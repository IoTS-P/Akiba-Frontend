<template>
  <div class="instances">
    <div class="actions">
      <div class="input-group">
        <input v-model="newInstanceName" placeholder="Instance name" @keyup.enter="createInstance" />
        <button @click="createInstance" :disabled="loading || !newInstanceName">Create</button>
      </div>
    </div>
    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="instances.length === 0" class="empty">No instances found</div>
    <div v-else class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="instance in instances" :key="instance">
            <td>{{ instance }}</td>
            <td>
              <button @click="startInstance(instance)" class="btn-action">Start</button>
              <button @click="shutdownInstance(instance)" class="btn-action">Shutdown</button>
              <button @click="backupInstance(instance)" class="btn-action">Backup</button>
              <button @click="deleteInstance(instance)" class="btn-action danger">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="message" :class="['message', messageType]">{{ message }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { instanceApi } from '@/services/api'

const instances = ref<string[]>([])
const newInstanceName = ref('')
const loading = ref(false)
const message = ref('')
const messageType = ref('success')

onMounted(async () => {
  await loadInstances()
})

async function loadInstances() {
  loading.value = true
  try {
    const response = await instanceApi.list()
    instances.value = response.data.instances || []
  } catch (e) {
    showMessage('Failed to load instances', 'error')
  } finally {
    loading.value = false
  }
}

async function createInstance() {
  if (!newInstanceName.value) return
  loading.value = true
  try {
    await instanceApi.create(newInstanceName.value)
    showMessage('Instance created', 'success')
    newInstanceName.value = ''
    await loadInstances()
  } catch (e: any) {
    showMessage(e.response?.data?.instanceName || 'Failed to create instance', 'error')
  } finally {
    loading.value = false
  }
}

async function startInstance(name: string) {
  try {
    await instanceApi.start(name)
    showMessage('Instance started', 'success')
  } catch (e: any) {
    showMessage(e.response?.data?.message || 'Failed to start instance', 'error')
  }
}

async function shutdownInstance(name: string) {
  try {
    await instanceApi.shutdown(name)
    showMessage('Instance shutdown', 'success')
  } catch (e: any) {
    showMessage(e.response?.data?.message || 'Failed to shutdown instance', 'error')
  }
}

async function backupInstance(name: string) {
  try {
    await instanceApi.backup(name)
    showMessage('Backup created', 'success')
  } catch (e: any) {
    showMessage(e.response?.data?.message || 'Failed to create backup', 'error')
  }
}

async function deleteInstance(name: string) {
  if (!confirm(`Delete instance "${name}"?`)) return
  try {
    await instanceApi.delete(name)
    showMessage('Instance deleted', 'success')
    await loadInstances()
  } catch (e: any) {
    showMessage(e.response?.data?.message || 'Failed to delete instance', 'error')
  }
}

function showMessage(msg: string, type: 'success' | 'error') {
  message.value = msg
  messageType.value = type
  setTimeout(() => { message.value = '' }, 3000)
}
</script>

<style scoped>
.instances {
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
  max-width: 400px;
}

.input-group input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
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

.table td {
  color: #333;
}

.btn-action {
  padding: 6px 12px;
  margin-right: 6px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-action:hover {
  background: #f5f5f5;
}

.btn-action.danger {
  color: #e94560;
  border-color: #e94560;
}

.btn-action.danger:hover {
  background: #e94560;
  color: #fff;
}

.message {
  margin-top: 16px;
  padding: 12px;
  border-radius: 6px;
  font-size: 14px;
}

.message.success {
  background: #e8f5e9;
  color: #388e3c;
}

.message.error {
  background: #ffebee;
  color: #d32f2f;
}
</style>