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
          <td>
            <button
              class="export-btn"
              @click="exportProject(project.name)"
              :disabled="exporting === project.name"
            >
              {{ exporting === project.name ? 'Exporting…' : 'Export .gar' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { projectApi } from '@/services/api'
import type { GhidraProjectInfo } from '@/types'

const projects = ref<GhidraProjectInfo[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const exporting = ref<string | null>(null)

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

.export-btn {
  padding: 4px 14px;
  border: 1px solid #e94560;
  border-radius: 4px;
  background: #fff;
  color: #e94560;
  cursor: pointer;
  font-size: 13px;
}
.export-btn:hover:not(:disabled) {
  background: #e94560;
  color: #fff;
}
.export-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
