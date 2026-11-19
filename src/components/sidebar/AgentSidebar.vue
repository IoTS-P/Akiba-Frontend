<template>
  <div class="agent-sidebar">
    <div class="search-row">
      <input v-model="query" type="search" placeholder="Search sessions…" aria-label="Search sessions" />
      <button class="new-btn" title="New session" @click="create">+</button>
    </div>

    <div class="tree">
      <div v-if="loading && !projects.length" class="hint">Loading…</div>
      <div v-else-if="!projects.length" class="hint">No sessions yet.</div>

      <div v-for="p in projects" :key="p.name" class="project">
        <button class="project-row" @click="toggle(p.name)">
          <span class="chevron">{{ isOpen(p.name) ? '▾' : '▸' }}</span>
          <span class="project-name" :title="p.name">{{ p.name }}</span>
          <span class="count">{{ p.sessions.length }}</span>
        </button>

        <div v-if="isOpen(p.name)" class="sessions">
          <button
            v-for="s in p.sessions"
            :key="s.sessionId"
            class="session"
            :class="{ active: s.sessionId === activeId }"
            :title="`${s.sessionName || s.sessionId}\n${s.sessionId}`"
            @click="select(s.sessionId)"
            @dblclick="open(s.sessionId)"
            @contextmenu.prevent="menu($event, s.sessionId)"
          >
            <span class="dot" :class="statusClass(s.status)"></span>
            <span class="name">{{ s.sessionName || shortId(s.sessionId) }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Right click: what you can do with a conversation besides looking at it. -->
    <div
      v-if="ctx.show"
      class="ctx"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
      @click.self="ctx.show = false"
    >
      <div class="ctx-item" @click="open(ctx.sessionId)">Open conversation</div>
      <div class="ctx-item" @click="openWorkspace(ctx.sessionId)">View workspace</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="exportOne(ctx.sessionId, 'self')">Export conversation</div>
      <div class="ctx-item" @click="exportOne(ctx.sessionId, 'tree')">Export with sub-agents</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" @click="remove(ctx.sessionId)">Delete conversation</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { agentApi } from '@/services/api'
import { shortId } from '@/utils/agentFormat'
import type { AgentSession } from '@/types'

defineProps<{ activeId: string | null }>()
const emit = defineEmits<{ open: [id: string]; workspace: [id: string] }>()

const router = useRouter()
const sessions = ref<AgentSession[]>([])
const query = ref('')
const loading = ref(false)
const openProjects = ref<Set<string>>(new Set())

const ctx = reactive({ show: false, x: 0, y: 0, sessionId: '' })

/**
 * Projects are the top level because a conversation only means something inside one:
 * "fix the parser" is a different conversation per project, and the same name in two
 * projects is not the same work.
 */
const projects = computed(() => {
  const q = query.value.trim().toLowerCase()
  const byProject = new Map<string, AgentSession[]>()

  for (const s of sessions.value) {
    if (q) {
      const hit = (s.sessionName ?? '').toLowerCase().includes(q)
        || s.sessionId.toLowerCase().includes(q)
        || (s.projectName ?? '').toLowerCase().includes(q)
      if (!hit) continue
    }
    const key = s.projectName || 'No project'
    const list = byProject.get(key) ?? []
    list.push(s)
    byProject.set(key, list)
  }

  return [...byProject.entries()]
    .map(([name, list]) => ({ name, sessions: list.sort(byActivity) }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

function byActivity(a: AgentSession, b: AgentSession): number {
  return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
}

function isOpen(name: string): boolean {
  // A search expands what it matched; otherwise the tree starts folded.
  return openProjects.value.has(name) || query.value.trim().length > 0
}

function toggle(name: string) {
  const next = new Set(openProjects.value)
  next.has(name) ? next.delete(name) : next.add(name)
  openProjects.value = next
}

function statusClass(status: string): string {
  if (status === 'running' || status === 'standby' || status === 'msghandle') return 'on'
  if (status === 'error') return 'error'
  if (status === 'closed') return 'off'
  return 'idle'
}

function select(id: string) {
  // Single click previews; the route carries the choice, the tab bar follows it.
  router.push({ path: '/agent', query: { sessionId: id } })
}

function open(id: string) {
  ctx.show = false
  emit('open', id)
  router.push({ path: '/agent', query: { sessionId: id } })
}

function openWorkspace(id: string) {
  ctx.show = false
  emit('workspace', id)
}

function create() {
  router.push({ path: '/agent', query: { new: '1' } })
}

function menu(event: MouseEvent, sessionId: string) {
  ctx.show = true
  ctx.x = event.clientX
  ctx.y = event.clientY
  ctx.sessionId = sessionId
}

async function remove(id: string) {
  ctx.show = false
  if (!window.confirm('Delete this conversation? This cannot be undone.')) return
  try {
    await agentApi.deleteSession(id)
    sessions.value = sessions.value.filter(s => s.sessionId !== id)
  } catch {
    // Leave the row in place: a failed delete must not look like a successful one.
  }
}

async function exportOne(id: string, scope: 'self' | 'tree') {
  ctx.show = false
  try {
    const { data } = await agentApi.exportSession(id, scope)
    const url = URL.createObjectURL(new Blob([data as unknown as BlobPart]))
    const a = document.createElement('a')
    a.href = url
    a.download = `session-${shortId(id)}${scope === 'tree' ? '-tree' : ''}.md`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // Nothing to show but the absence of a file.
  }
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

function closeMenu() {
  ctx.show = false
}

let timer: ReturnType<typeof setInterval> | null = null
/** Renamed elsewhere: take the new title now, not on the next poll. */
function onSessionRenamed(ev: Event) {
  const detail = (ev as CustomEvent<{ id: string; name: string }>).detail
  if (!detail?.id) return
  const row = sessions.value.find(r => r.sessionId === detail.id)
  if (row) row.sessionName = detail.name
}

onMounted(() => {
  void load()
  timer = setInterval(() => void load(), 15000)
  window.addEventListener('akiba:session-renamed', onSessionRenamed)
  window.addEventListener('click', closeMenu)
})
onUnmounted(() => {
  window.removeEventListener('akiba:session-renamed', onSessionRenamed)
  if (timer) clearInterval(timer)
  window.removeEventListener('click', closeMenu)
})
</script>

<style scoped>
.agent-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
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

.tree {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 8px;
}

.hint {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--akiba-chat-text-faint);
}

.project-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 4px 10px;
  background: transparent;
  border: none;
  color: var(--vscode-editor-foreground);
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.project-row:hover {
  background: var(--akiba-chat-hover);
}

.chevron {
  width: 10px;
  color: var(--akiba-chat-text-faint);
}

.project-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count {
  color: var(--akiba-chat-text-faint);
  font-weight: 400;
  font-size: 11px;
}

.session {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 10px 4px 24px;
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
  width: 6px;
  height: 6px;
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

.ctx {
  position: fixed;
  z-index: 50;
  min-width: 200px;
  padding: 4px 0;
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--akiba-radius-sm);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  font-size: 12px;
  color: var(--vscode-editor-foreground);
}

.ctx-item {
  padding: 5px 12px;
  cursor: pointer;
}

.ctx-item:hover {
  background: var(--vscode-focusBorder);
  color: #fff;
}

.ctx-item.danger:hover {
  background: var(--akiba-danger);
}

.ctx-sep {
  height: 1px;
  margin: 4px 0;
  background: var(--vscode-panel-border);
}
</style>
