<template>
  <div v-if="metrics" class="sys-status" :title="tooltip">
    <div v-for="g in gauges" :key="g.label" class="gauge" :class="{ warn: g.value >= 85 }">
      <span class="gauge-label">{{ g.label }}</span>
      <span class="gauge-track"><span class="gauge-fill" :style="{ width: g.value + '%' }"></span></span>
      <span class="gauge-value">{{ g.value.toFixed(0) }}%</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { systemApi } from '@/services/api'
import type { SystemMetrics } from '@/services/api'

/**
 * Host resources in the title bar.
 *
 * Lives here rather than on the dashboard so a worker that is about to be
 * killed for memory is visible from whichever page the operator is on.
 */
const metrics = ref<SystemMetrics | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

const gauges = computed(() => [
  { label: 'CPU', value: metrics.value?.cpu.usagePercent ?? 0 },
  { label: 'MEM', value: metrics.value?.memory.usagePercent ?? 0 },
  { label: 'DISK', value: metrics.value?.disk.usagePercent ?? 0 },
])

const tooltip = computed(() => {
  const m = metrics.value
  if (!m) return ''
  return [
    `CPU ${m.cpu.usagePercent.toFixed(0)}% · ${m.cpu.cores} cores · load ${m.cpu.loadAverage[0]?.toFixed(2) ?? '—'}`,
    `Memory ${bytes(m.memory.usedBytes)} / ${bytes(m.memory.totalBytes)}`,
    `Disk ${bytes(m.disk.freeBytes)} free of ${bytes(m.disk.totalBytes)}`,
  ].join('\n')
})

function bytes(value: number | undefined): string {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = value
  let u = 0
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++ }
  return `${v.toFixed(u === 0 ? 0 : 1)} ${units[u]}`
}

async function refresh() {
  try {
    const { data } = await systemApi.metrics()
    metrics.value = data
  } catch {
    // Unauthenticated or an old server: stay hidden rather than show zeros.
    metrics.value = null
  }
}

onMounted(() => {
  void refresh()
  timer = setInterval(refresh, 3000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.sys-status {
  display: flex;
  align-items: center;
  gap: 14px;
}

.gauge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  color: #8a8f98;
}

.gauge-label {
  letter-spacing: 0.04em;
}

.gauge-track {
  width: 44px;
  height: 5px;
  background: #eef0f3;
  border-radius: 3px;
  overflow: hidden;
}

.gauge-fill {
  display: block;
  height: 100%;
  background: #4a7dff;
  transition: width 0.4s ease;
}

.gauge.warn .gauge-fill {
  background: #e0703a;
}

.gauge.warn .gauge-value {
  color: #c0392b;
}

.gauge-value {
  min-width: 30px;
  font-variant-numeric: tabular-nums;
  color: #5a6068;
}
</style>
