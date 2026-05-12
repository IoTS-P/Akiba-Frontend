<template>
  <div class="files">
    <div class="actions">
      <button @click="loadFiles" class="btn-secondary">Refresh</button>
    </div>
    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="files.length === 0" class="empty">No files found</div>
    <div v-else class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Type</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="file in files" :key="file.id">
            <td>{{ file.id }}</td>
            <td>{{ file.name || file.file_name || '-' }}</td>
            <td>{{ file.type || file.file_type || '-' }}</td>
            <td>
              <button @click="deleteFile(file)" class="btn-action danger">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fileApi } from '@/services/api'

const files = ref<any[]>([])
const loading = ref(false)

onMounted(async () => {
  await loadFiles()
})

async function loadFiles() {
  loading.value = true
  try {
    const response = await fileApi.list()
    files.value = response.data.files || []
  } catch (e) {
    console.error('Failed to load files:', e)
  } finally {
    loading.value = false
  }
}

async function deleteFile(file: any) {
  if (!confirm(`Delete file ${file.id}?`)) return
  try {
    await fileApi.delete('', [file.id])
    await loadFiles()
  } catch (e) {
    console.error('Failed to delete file:', e)
  }
}
</script>

<style scoped>
.files {
  background: #fff;
  padding: 24px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.actions {
  margin-bottom: 20px;
}

.btn-secondary {
  padding: 10px 20px;
  background: #f5f5f5;
  color: #333;
  border: 1px solid #ddd;
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

.btn-action {
  padding: 6px 12px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.btn-action.danger { color: #e94560; border-color: #e94560; }
.btn-action.danger:hover { background: #e94560; color: #fff; }
</style>