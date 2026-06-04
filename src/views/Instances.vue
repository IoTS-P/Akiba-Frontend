<template>
  <div class="instances">
    <div class="actions">
      <div class="input-group">
        <input v-model="newInstanceName" placeholder="Instance name" @keyup.enter="createInstance" />
        <button @click="createInstance" :disabled="creating || !newInstanceName">
          {{ creating ? 'Creating…' : 'Create' }}
        </button>
      </div>
      <button class="btn-secondary" @click="store.refresh">Refresh</button>
    </div>

    <div v-if="store.loading" class="loading">Loading...</div>
    <div v-else-if="store.available.length === 0" class="empty">
      No instances found. Create one above.
    </div>
    <div v-else class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="instance in store.available" :key="instance">
            <td>{{ instance }}</td>
            <td>
              <span v-if="instance === store.selected" class="status active">selected</span>
              <span v-else class="status muted">available</span>
            </td>
            <td>
              <button
                v-if="instance !== store.selected"
                @click="store.select(instance)"
                class="btn-action"
              >Select</button>
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
import { useRouter } from 'vue-router'
import { instanceApi } from '@/services/api'
import { useInstanceStore } from '@/stores/instance'

const router = useRouter()
const store = useInstanceStore()

const newInstanceName = ref('')
const creating = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

onMounted(async () => {
  await store.refresh()
})

async function createInstance() {
  if (!newInstanceName.value) return
  const name = newInstanceName.value.trim()
  creating.value = true
  try {
    await instanceApi.create(name)
    store.select(name)
    newInstanceName.value = ''
    showMessage(`Instance "${name}" created`, 'success')
    await store.refresh()
  } catch (e: any) {
    showMessage(
      e?.response?.data?.message || e?.response?.data?.error || 'Failed to create instance',
      'error'
    )
  } finally {
    creating.value = false
  }
}

async function startInstance(name: string) {
  try {
    await instanceApi.start(name)
    showMessage(`Instance "${name}" started`, 'success')
  } catch (e: any) {
    showMessage(e?.response?.data?.error || 'Failed to start instance', 'error')
  }
}

async function shutdownInstance(name: string) {
  try {
    await instanceApi.shutdown(name)
    showMessage(`Instance "${name}" shutdown`, 'success')
  } catch (e: any) {
    showMessage(e?.response?.data?.error || 'Failed to shutdown instance', 'error')
  }
}

async function backupInstance(name: string) {
  try {
    await instanceApi.backup(name)
    showMessage('Backup created', 'success')
  } catch (e: any) {
    showMessage(e?.response?.data?.error || 'Failed to create backup', 'error')
  }
}

async function deleteInstance(name: string) {
  if (!confirm(`Delete instance "${name}"?`)) return
  try {
    await instanceApi.delete(name)
    const wasSelected = store.selected === name
    store.forget(name)
    showMessage(`Instance "${name}" deleted`, 'success')
    if (wasSelected) {
      router.push('/select-instance')
    } else {
      await store.refresh()
    }
  } catch (e: any) {
    showMessage(e?.response?.data?.error || 'Failed to delete instance', 'error')
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
  display: flex;
  align-items: center;
  gap: 12px;
}

.input-group {
  display: flex;
  gap: 10px;
  flex: 1;
  max-width: 420px;
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
.input-group button:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-secondary {
  padding: 10px 16px;
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

.table-wrapper { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid #eee;
}
.table th { font-weight: 600; color: #666; font-size: 14px; }
.table td { color: #333; }

.status {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 10px;
  font-weight: 500;
}
.status.active { background: #fff5f7; color: #e94560; }
.status.muted { background: #f5f5f5; color: #888; }

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
.btn-action:hover { background: #f5f5f5; }
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
