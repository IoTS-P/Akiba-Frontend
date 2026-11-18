<template>
  <div class="layout">
    <!-- Activity bar: which family of things you are looking at. -->
    <nav class="activity-bar" aria-label="Activities">
      <button
        v-for="item in primaryViews"
        :key="item.path"
        class="activity"
        :class="{ active: isActive(item.path) }"
        :title="item.title"
        :aria-label="item.title"
        @click="go(item.path)"
      >
        <span class="activity-icon">{{ item.icon }}</span>
      </button>
      <div class="activity-spacer"></div>
      <button
        v-if="utilityView"
        class="activity"
        :class="{ active: isActive(utilityView.path) }"
        :title="utilityView.title"
        :aria-label="utilityView.title"
        @click="go(utilityView.path)"
      >
        <span class="activity-icon">{{ utilityView.icon }}</span>
      </button>
    </nav>

    <!-- Sidebar: the list of things in the active family. -->
    <aside class="sidebar" :style="{ width: sidebarWidth + 'px' }">
      <div class="sidebar-header">
        <span class="sidebar-title">{{ currentRoute }}</span>
      </div>
      <!-- Agent lists conversations; the other activities still list their views. -->
      <div v-if="isAgentActivity" class="sidebar-split">
        <AgentSidebar
          :active-id="activeSessionId"
          class="split-top"
          @open="openConversation"
          @workspace="openWorkspace"
        />
        <div
          v-if="workspaceSessionId"
          class="resizer-h"
          role="separator"
          aria-orientation="horizontal"
          @pointerdown="startSplitDrag"
        ></div>
        <WorkspacePanel
          v-if="workspaceSessionId"
          :session-id="workspaceSessionId"
          class="split-bottom"
          :style="{ flexBasis: splitPercent + '%' }"
          @close="workspaceSessionId = null"
        />
      </div>
      <div v-else class="sidebar-search">
        <input v-model="filter" type="search" placeholder="Filter views…" aria-label="Filter views" />
      </div>
      <nav v-if="!isAgentActivity" class="nav">
        <button
          v-for="item in filteredViews"
          :key="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
          @click="go(item.path)"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.title }}</span>
        </button>
      </nav>
      <div class="sidebar-footer">
        <div class="instance">
          <span class="instance-label">Instance</span>
          <span class="instance-value" :title="instanceStore.selected || ''">
            {{ instanceStore.selected || '—' }}
          </span>
          <button class="link-btn" @click="switchInstance">Switch</button>
        </div>
        <div class="account">
          <span class="account-name">{{ authStore.user?.username }}</span>
          <button class="link-btn" @click="handleLogout">Logout</button>
        </div>
      </div>
    </aside>

    <!-- Dragging the edge is how a sidebar earns its width. -->
    <div class="resizer-v" role="separator" aria-orientation="vertical" @pointerdown="startWidthDrag"></div>

    <!-- Editor area: the tab bar, the page, nothing below it. -->
    <main class="editor">
      <div class="tab-bar">
        <div class="tab active" :title="currentRoute">
          <span class="tab-icon">{{ currentViewIcon }}</span>
          <span class="tab-label">{{ currentRoute }}</span>
        </div>
        <div class="tab-spacer"></div>
        <SystemStatus />
      </div>
      <div class="content">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useInstanceStore } from '@/stores/instance'
import SystemStatus from '@/components/SystemStatus.vue'
import AgentSidebar from '@/components/sidebar/AgentSidebar.vue'
import WorkspacePanel from '@/components/sidebar/WorkspacePanel.vue'

interface ViewItem {
  path: string
  title: string
  icon: string
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const instanceStore = useInstanceStore()

/**
 * The activities Akiba has, in the order they are worth reaching for.
 *
 * Each one owns the sidebar while it is active; Settings sits apart at the bottom, the way
 * an editor keeps its settings away from its work.
 */
const primaryViews: ViewItem[] = [
  { path: '/agent', title: 'Agent', icon: '💬' },
  { path: '/projects', title: 'Ghidra Projects', icon: '🗂️' },
  { path: '/files', title: 'Files', icon: '📁' },
  { path: '/instances', title: 'Instances', icon: '🗄️' },
  { path: '/scripts', title: 'Scripts', icon: '📜' },
  { path: '/skills', title: 'Skills', icon: '🧩' },
  { path: '/modules', title: 'Modules', icon: '📦' },
  { path: '/', title: 'Dashboard', icon: '📊' },
]

const utilityView: ViewItem = { path: '/settings', title: 'Settings', icon: '⚙️' }

const allViews = computed(() => [...primaryViews, utilityView])
const filter = ref('')

const filteredViews = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return q ? allViews.value.filter(v => v.title.toLowerCase().includes(q)) : allViews.value
})

function isActive(path: string): boolean {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}

function go(path: string) {
  router.push(path)
}

/** The agent activity owns its own sidebar: a list of conversations. */
const isAgentActivity = computed(() => route.path.startsWith('/agent'))
const activeSessionId = computed(() =>
  typeof route.query.sessionId === 'string' ? route.query.sessionId : null
)

const SIDEBAR_KEY = 'akiba.sidebar.width'
const SPLIT_KEY = 'akiba.sidebar.split'

const sidebarWidth = ref(Number(localStorage.getItem(SIDEBAR_KEY)) || 260)
const splitPercent = ref(Number(localStorage.getItem(SPLIT_KEY)) || 45)

/** Drag the sidebar's right edge. Clamped so neither side can disappear. */
function startWidthDrag(e: PointerEvent) {
  const startX = e.clientX
  const startWidth = sidebarWidth.value
  const move = (ev: PointerEvent) => {
    sidebarWidth.value = Math.min(520, Math.max(180, startWidth + (ev.clientX - startX)))
  }
  const up = () => {
    localStorage.setItem(SIDEBAR_KEY, String(sidebarWidth.value))
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/** Drag the boundary between the session tree and the workspace. */
function startSplitDrag(e: PointerEvent) {
  const area = (e.currentTarget as HTMLElement).parentElement
  if (!area) return
  const rect = area.getBoundingClientRect()
  const move = (ev: PointerEvent) => {
    const fromBottom = ((rect.bottom - ev.clientY) / rect.height) * 100
    splitPercent.value = Math.min(85, Math.max(15, Math.round(fromBottom)))
  }
  const up = () => {
    localStorage.setItem(SPLIT_KEY, String(splitPercent.value))
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/** The conversation whose workspace is open below the session tree, if any. */
const workspaceSessionId = ref<string | null>(null)

function openConversation(id: string) {
  router.push({ path: '/agent', query: { sessionId: id } })
}

function openWorkspace(id: string) {
  workspaceSessionId.value = id
}

const currentRoute = computed(() => allViews.value.find(v => isActive(v.path))?.title ?? 'Akiba')
const currentViewIcon = computed(() => allViews.value.find(v => isActive(v.path))?.icon ?? '◆')

function switchInstance() {
  instanceStore.clear()
  router.push('/select-instance')
}

async function handleLogout() {
  instanceStore.clear()
  await authStore.logout()
  router.push('/login')
}
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
}

/* ---- activity bar ------------------------------------------------------ */
.activity-bar {
  width: 48px;
  min-width: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  background: var(--akiba-chat-surface);
  border-right: 1px solid var(--vscode-panel-border);
}

.activity {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  border-radius: var(--akiba-radius-sm);
  cursor: pointer;
  opacity: 0.65;
  transition: opacity 0.15s, background 0.15s;
}

.activity:hover {
  opacity: 1;
  background: var(--akiba-chat-hover);
}

.activity.active {
  opacity: 1;
  border-left-color: var(--vscode-focusBorder);
  background: var(--akiba-chat-hover);
}

.activity-icon {
  font-size: 17px;
  line-height: 1;
}

.activity-spacer {
  flex: 1;
}

/* ---- sidebar ----------------------------------------------------------- */
.sidebar {
  width: 260px;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  background: var(--akiba-chat-surface);
  border-right: 1px solid var(--vscode-panel-border);
}

.sidebar-header {
  padding: 10px 14px 6px;
}

.sidebar-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vscode-descriptionForeground);
}

.sidebar-search {
  padding: 0 10px 8px;
}

.sidebar-search input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  font-size: 12px;
}

.resizer-v {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  flex: 0 0 auto;
  transition: background 0.15s;
}

.resizer-v:hover,
.resizer-v:active {
  background: var(--vscode-focusBorder);
}

.resizer-h {
  height: 4px;
  cursor: row-resize;
  background: transparent;
  flex: 0 0 auto;
  transition: background 0.15s;
}

.resizer-h:hover,
.resizer-h:active {
  background: var(--vscode-focusBorder);
}

.sidebar-split {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.split-top {
  flex: 1 1 55%;
  min-height: 120px;
}

.split-bottom {
  flex: 1 1 45%;
  min-height: 120px;
}

.nav {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  background: transparent;
  border: none;
  color: var(--akiba-chat-text-muted);
  text-align: left;
  font-size: 13px;
  cursor: pointer;
}

.nav-item:hover {
  background: var(--akiba-chat-hover);
  color: var(--vscode-editor-foreground);
}

.nav-item.active {
  background: color-mix(in srgb, var(--vscode-focusBorder) 18%, transparent);
  color: var(--vscode-editor-foreground);
}

.nav-icon {
  width: 18px;
  text-align: center;
}

.sidebar-footer {
  border-top: 1px solid var(--vscode-panel-border);
  padding: 8px 12px;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}

.instance,
.account {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
}

.instance-label {
  color: var(--akiba-chat-text-faint);
}

.instance-value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vscode-editor-foreground);
}

.account-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-btn {
  background: transparent;
  border: none;
  color: var(--akiba-info-text);
  cursor: pointer;
  padding: 0;
  font-size: 12px;
}

.link-btn:hover {
  text-decoration: underline;
}

/* ---- editor area ------------------------------------------------------- */
.editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tab-bar {
  display: flex;
  align-items: center;
  height: 36px;
  min-height: 36px;
  background: var(--akiba-chat-surface);
  border-bottom: 1px solid var(--vscode-panel-border);
  padding: 0 8px;
  gap: 8px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 12px;
  font-size: 12px;
  color: var(--akiba-chat-text-muted);
  border-top: 1px solid transparent;
  border-right: 1px solid var(--vscode-panel-border);
}

.tab.active {
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
  border-top-color: var(--vscode-focusBorder);
}

.tab-spacer {
  flex: 1;
}

.content {
  flex: 1;
  overflow: auto;
  padding: 0;
}
</style>
