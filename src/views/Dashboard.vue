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
        <div class="stat-icon">📁</div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.projects }}</div>
          <div class="stat-label">Projects</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.conversations }}</div>
          <div class="stat-label">Conversations</div>
        </div>
      </div>
    </div>
    <!-- Host resources: the numbers that explain a killed worker or a full disk. -->
    <div class="resources">
      <div class="res-card">
        <div class="res-head">
          <span class="res-title">CPU</span>
          <span class="res-value">{{ metrics ? percent(metrics.cpu.usagePercent) : '—' }}</span>
        </div>
        <div class="res-bar"><div class="res-fill" :style="{ width: pct(metrics?.cpu.usagePercent) }"></div></div>
        <div class="res-sub">
          {{ metrics ? metrics.cpu.cores + ' cores · load ' + (metrics.cpu.loadAverage[0]?.toFixed(2) ?? '—') : 'unavailable' }}
        </div>
      </div>
      <div class="res-card">
        <div class="res-head">
          <span class="res-title">Memory</span>
          <span class="res-value">{{ metrics ? percent(metrics.memory.usagePercent) : '—' }}</span>
        </div>
        <div class="res-bar">
          <div class="res-fill" :class="{ warn: (metrics?.memory.usagePercent ?? 0) > 85 }"
               :style="{ width: pct(metrics?.memory.usagePercent) }"></div>
        </div>
        <div class="res-sub">
          {{ metrics ? bytes(metrics.memory.usedBytes) + ' / ' + bytes(metrics.memory.totalBytes) : 'unavailable' }}
        </div>
      </div>
      <div class="res-card">
        <div class="res-head">
          <span class="res-title">Disk</span>
          <span class="res-value">{{ metrics ? percent(metrics.disk.usagePercent) : '—' }}</span>
        </div>
        <div class="res-bar">
          <div class="res-fill" :class="{ warn: (metrics?.disk.usagePercent ?? 0) > 85 }"
               :style="{ width: pct(metrics?.disk.usagePercent) }"></div>
        </div>
        <div class="res-sub">
          {{ metrics ? bytes(metrics.disk.usedBytes) + ' / ' + bytes(metrics.disk.totalBytes) + ' · ' + bytes(metrics.disk.freeBytes) + ' free' : 'unavailable' }}
        </div>
      </div>
    </div>

    <div class="section" v-if="metrics && metrics.processes.length">
      <h2>Java processes</h2>
      <div class="list">
        <div v-for="p in metrics.processes" :key="p.pid" class="list-item">
          <span class="name">{{ p.role }} <span class="pid">pid {{ p.pid }}</span></span>
          <span class="status">{{ bytes(p.rssBytes) }}</span>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { agentApi, instanceApi, projectApi, scriptApi, systemApi } from '@/services/api'
import type { SystemMetrics } from '@/services/api'
import type { Script } from '@/types'

const stats = ref({ instances: 0, scripts: 0, projects: 0, conversations: 0 })
const recentScripts = ref<Script[]>([])

const metrics = ref<SystemMetrics | null>(null)
let metricsTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await Promise.all([loadStats(), loadRecentScripts(), loadMetrics()])
  // Two seconds keeps the bars alive without hammering /proc.
  metricsTimer = setInterval(loadMetrics, 2000)
})

onUnmounted(() => {
  if (metricsTimer) clearInterval(metricsTimer)
})

async function loadMetrics() {
  try {
    const { data } = await systemApi.metrics()
    metrics.value = data
  } catch {
    metrics.value = null
  }
}

/** Render a percentage that may be missing on an older/broken payload. */
function percent(value: number | undefined | null): string {
  return (typeof value === 'number' && isFinite(value) ? value : 0).toFixed(0) + '%'
}

/** Clamp a percentage into a CSS width. */
function pct(value: number | undefined): string {
  return Math.min(100, Math.max(0, value ?? 0)).toFixed(1) + '%'
}

function bytes(value: number | undefined): string {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = value
  let u = 0
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++ }
  return `${v.toFixed(u === 0 ? 0 : 1)} ${units[u]}`
}

async function loadStats() {
  try {
    const [instances, scripts, projects, sessions] = await Promise.all([
      instanceApi.list(),
      scriptApi.list(),
      projectApi.list(),
      agentApi.listSessions(),
    ])
    stats.value = {
      instances: (instances.data.instances || []).length,
      scripts: (scripts.data.scripts || []).length,
      projects: (projects.data.projects || []).length,
      conversations: (sessions.data.sessions || []).length,
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

</script>

<style scoped>
.resources {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 4px 0 22px;
}

.res-card {
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e3e6ea;
  border-radius: 10px;
}

.res-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}

.res-title {
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8a8f98;
}

.res-value {
  font-size: 1.15rem;
  font-weight: 600;
}

.res-bar {
  height: 6px;
  background: #eef0f3;
  border-radius: 4px;
  overflow: hidden;
}

.res-fill {
  height: 100%;
  background: #4a7dff;
  transition: width 0.4s ease;
}

.res-fill.warn {
  background: #e0703a;
}

.res-sub {
  margin-top: 8px;
  font-size: 0.75rem;
  color: #9aa0a8;
}

.pid {
  font-size: 0.72rem;
  color: #9aa0a8;
}

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