<template>
  <div class="agent-sidebar">
    <div class="search-row">
      <input v-model="query" type="search" placeholder="Search sessions…" aria-label="Search sessions" />
      <button class="new-btn" title="New session" @click="newSession">+</button>
    </div>

    <div v-if="loading" class="hint">Loading…</div>
    <div v-else-if="!groups.length" class="hint">No sessions match.</div>

    <div v-for="group in groups" :key="group.label" class="group">
      <div class="group-label">{{ group.label }}</div>
      <button
        v-for="s in group.sessions"
        :key="s.sessionId"
        class="session"
        :class="{ active: s.sessionId === activeId }"
        @click="open(s.sessionId)"
      >
        <span class="dot" :class="statusClass(s.status)"></span>
        <span class="name" :title="s.sessionName || s.sessionId">{{ s.sessionName || shortId(s.sessionId) }}</span>
        <span class="meta">{{ s.projectName || '—' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { agentApi } from '@/services/api'
import { shortId } from '@/utils/agentFormat'
import type { AgentSession } from '@/types'

const props = defineProps<{ activeId: string | null }>()
const emit = defineEmits<{ open: [id: string]; create: [] }>()

const route = useRoute()
const router = useRouter()

const sessions = ref<AgentSession[]>([])
const query = ref('')
const loading = ref(false)

/**
 * Sessions grouped the way they are actually looked for: what is running, what is idle,
 * and everything older. A flat list of fifty rows is a list nobody scans.
 */
const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const visible = sessions.value.filter(s => {
    if (!q) return true
    return (s.sessionName ?? '').toLowerCase().includes(q)
      || (s.projectName ?? '').toLowerCase().includes(q)
      || s.sessionId.toLowerCase().includes(q)
  })

  const running = visible.filter(s => s.status === 'running' || s.status === 'standby' || s.status === 'msghandle')
  const idle = visible.filter(s => s.status === 'closed')
  const other = visible.filter(s => !running.includes(s) && !idle.includes(s))

  const out: { label: string; sessions: AgentSession[] }[] = []
  if (running.length) out.push({ label: `Running (${running.length})`, sessions: running })
  if (other.length) out.push({ label: `Paused or failed (${other.length})`, sessions: other })
  if (idle.length) out.push({ label: `Closed (${idle.length})`, sessions: idle })
  return out
})

function statusClass(status: string): string {
  if (status === 'running' || status === 'standby' || status === 'msghandle') return 'on'
  if (status === 'error') return 'error'
  if (status === 'closed') return 'off'
  return 'idle'
}

function open(id: string) {
  if (id === props.activeId) return
  emit('open', id)
  router.push({ path: '/agent', query: { sessionId: id } })
}

function newSession() {
  emit('create')
}

async function load() {
  loading.value = true
  try {
    const { data } = await agentApi.listSessions(200)
    sessions.value = data.sessions || []
  } catch {
    // The list is a convenience; the conversation still works without it.
  } finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  void load()
  timer = setInterval(() => void load(), 15000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

// The route is the single source of truth for "which conversation is open".
void route
</script>

<style scoped>
.agent-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.search-row {
  display: flex;
  gap: 6px;
  padding: 0 10px 8px;
}

.search-row input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  font-size: 12px;
}

.new-btn {
  width: 26px;
  background: transparent;
  color: var(--vscode-editor-foreground);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--akiba-radius-sm);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.new-btn:hover {
  background: var(--akiba-chat-hover);
}

.hint {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--akiba-chat-text-faint);
}

.group {
  margin-bottom: 4px;
}

.group-label {
  padding: 6px 12px 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--akiba-chat-text-faint);
}

.session {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 12px;
  background: transparent;
  border: none;
  color: var(--akiba-chat-text-muted);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.session:hover {
  background: var(--akiba-chat-hover);
  color: var(--vscode-editor-foreground);
}

.session.active {
  background: color-mix(in srgb, var(--vscode-focusBorder) 18%, transparent);
  color: var(--vscode-editor-foreground);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: var(--akiba-chat-text-faint);
}

.dot.on { background: var(--akiba-success-text); }
.dot.error { background: var(--akiba-danger-text); }
.dot.off { background: var(--akiba-chat-text-faint); }

.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  flex: 0 0 auto;
  color: var(--akiba-chat-text-faint);
  font-size: 11px;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
