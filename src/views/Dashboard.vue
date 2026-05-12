<template>
  <div class="dashboard">
    <div class="stats">
      <div class="stat-card">
        <div class="stat-icon">🗄️</div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.instances }}</div>
          <div class="stat-label">Instances</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📜</div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.scripts }}</div>
          <div class="stat-label">Scripts</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⚙️</div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.workflows }}</div>
          <div class="stat-label">Workflows</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.running }}</div>
          <div class="stat-label">Running</div>
        </div>
      </div>
    </div>
    <div class="sections">
      <div class="section">
        <h2>Recent Scripts</h2>
        <div v-if="recentScripts.length === 0" class="empty">No scripts yet</div>
        <div v-else class="list">
          <div v-for="script in recentScripts" :key="script.id" class="list-item">
            <span class="name">{{ script.name }}</span>
            <span :class="['status', script.status]">{{ script.status }}</span>
          </div>
        </div>
      </div>
      <div class="section">
        <h2>Running Workflows</h2>
        <div v-if="runningWorkflows.length === 0" class="empty">No running workflows</div>
        <div v-else class="list">
          <div v-for="wf in runningWorkflows" :key="wf.id" class="list-item">
            <span class="name">{{ wf.id.slice(0, 8) }}...</span>
            <div class="progress-bar">
              <div class="progress" :style="{ width: wf.progress * 100 + '%' }"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { instanceApi, scriptApi, workflowApi } from '@/services/api'
import type { Script, WorkflowStatus } from '@/types'

const stats = ref({ instances: 0, scripts: 0, workflows: 0, running: 0 })
const recentScripts = ref<Script[]>([])
const runningWorkflows = ref<WorkflowStatus[]>([])

onMounted(async () => {
  await Promise.all([loadStats(), loadRecentScripts(), loadRunningWorkflows()])
})

async function loadStats() {
  try {
    const [instances, scripts, workflows, running] = await Promise.all([
      instanceApi.list(),
      scriptApi.list(),
      workflowApi.history(),
      workflowApi.running()
    ])
    stats.value = {
      instances: (instances.data.instances || []).length,
      scripts: (scripts.data.scripts || []).length,
      workflows: (workflows.data.workflows || []).length,
      running: (running.data.workflows || []).length
    }
  } catch (e) {
    console.error('Failed to load stats:', e)
  }
}

async function loadRecentScripts() {
  try {
    const response = await scriptApi.list()
    recentScripts.value = (response.data.scripts || []).slice(0, 5)
  } catch (e) {
    console.error('Failed to load scripts:', e)
  }
}

async function loadRunningWorkflows() {
  try {
    const response = await workflowApi.running()
    runningWorkflows.value = response.data.workflows || []
  } catch (e) {
    console.error('Failed to load workflows:', e)
  }
}
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.stat-card {
  background: #fff;
  padding: 24px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.stat-icon {
  font-size: 32px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a2e;
}

.stat-label {
  font-size: 14px;
  color: #666;
}

.sections {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.section {
  background: #fff;
  padding: 24px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.section h2 {
  font-size: 18px;
  margin-bottom: 16px;
  color: #1a1a2e;
}

.empty {
  color: #999;
  font-size: 14px;
  text-align: center;
  padding: 20px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
}

.name {
  font-size: 14px;
  color: #333;
}

.status {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: 500;
}

.status.running {
  background: #e3f2fd;
  color: #1976d2;
}

.status.completed {
  background: #e8f5e9;
  color: #388e3c;
}

.status.failed {
  background: #ffebee;
  color: #d32f2f;
}

.progress-bar {
  width: 100px;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  overflow: hidden;
}

.progress {
  height: 100%;
  background: #e94560;
  transition: width 0.3s;
}
</style>