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
      <div v-if="isAgentActivity || isProjectsActivity || isFilesActivity || isScriptsActivity || isInstancesActivity || isModulesActivity || isSkillsActivity" class="sidebar-split">
        <ProjectsSidebar
          v-if="isProjectsActivity"
          @open-workspace="openProgramWorkspace"
        />
        <FilesSidebar v-else-if="isFilesActivity" @open="openRecordTab" />
        <ScriptsSidebar v-else-if="isScriptsActivity" @open="openScriptTab" />
        <InstancesSidebar v-else-if="isInstancesActivity" />
        <ModulesSidebar v-else-if="isModulesActivity" />
        <SkillsSidebar v-else-if="isSkillsActivity" @open-file="openSkillFile" />
        <AgentSidebar
          v-else-if="isAgentActivity"
          :active-id="activeSessionId"
          class="split-top"
          @open="openConversation"
          @workspace="openWorkspace"
        />
        <div
          v-if="workspaceSessionId || programScope"
          class="resizer-h"
          role="separator"
          aria-orientation="horizontal"
          @pointerdown="startSplitDrag"
        ></div>
        <WorkspacePanel
          v-if="workspaceSessionId || programScope"
          :scope="programScope ?? sessionScope"
          class="split-bottom"
          @open-file="openAnyFile"
          :style="{ flexBasis: splitPercent + '%' }"
          @close="workspaceSessionId = null"
        />
      </div>
      <div v-else class="sidebar-search">
        <input v-model="filter" type="search" placeholder="Filter views…" aria-label="Filter views" />
      </div>
      <nav v-if="!isAgentActivity && !isProjectsActivity && !isFilesActivity && !isScriptsActivity && !isInstancesActivity && !isModulesActivity && !isSkillsActivity" class="nav">
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
        <!-- The page itself is a tab: with files open, an activity icon was the only
             way back to it, which is not where anyone looks. -->
        <button
          class="tab tab-page"
          :class="{ active: activeKey === 'view' }"
          :title="pageTabTitle"
          @click="activeKey = 'view'"
        >
          <span class="tab-label">{{ pageTabTitle }}</span>
        </button>
        <button
          v-for="t in fileTabs"
          :key="t.key"
          class="tab"
          :class="{ active: activeKey === t.key }"
          :title="t.path"
          @click="activeKey = t.key"
          @auxclick.middle.prevent="closeTab(t)"
        >
          <span v-if="t.dirty" class="tab-dot" title="Unsaved changes"></span>
          <span class="tab-label">{{ t.title }}</span>
          <span class="tab-close" title="Close" @click.stop="closeTab(t)">×</span>
        </button>
        <button
          v-for="t in scriptTabs"
          :key="t.key"
          class="tab"
          :class="{ active: activeKey === t.key }"
          :title="t.title"
          @click="activeKey = t.key"
          @auxclick.middle.prevent="closeScriptTab(t)"
        >
          <span v-if="t.dirty" class="tab-dot" title="Unsaved changes"></span>
          <span v-else class="tab-icon">📜</span>
          <span class="tab-label">{{ t.title }}</span>
          <span class="tab-close" title="Close" @click.stop="closeScriptTab(t)">×</span>
        </button>
        <button
          v-for="t in recordTabs"
          :key="t.key"
          class="tab"
          :class="{ active: activeKey === t.key }"
          :title="t.title"
          @click="activeKey = t.key"
          @auxclick.middle.prevent="closeRecordTab(t)"
        >
          <span class="tab-icon">🗃</span>
          <span class="tab-label">{{ t.title }}</span>
          <span class="tab-close" title="Close" @click.stop="closeRecordTab(t)">×</span>
        </button>
        <div class="tab-spacer"></div>
        <SystemStatus />
      </div>

      <div v-show="activeKey === 'view'" class="content">
        <router-view />
      </div>

      <div v-if="activeRecord" class="file-body">
        <RecordEditor :key="activeRecord.key" :file-id="activeRecord.fileId" :title="activeRecord.title" />
      </div>

      <div v-else-if="activeDoc" class="file-body">
        <WorkspaceEditor
          v-if="activeDoc.text !== null"
          ref="docEditorRef"
          :uri="activeDoc.uri"
          :language="activeDoc.language"
          @update:model-value="onDocEdit"
          @save="saveActiveDoc"
        />
        <div v-else class="file-note-block">
          This file is not text. Download it from the workspace tree to inspect it.
        </div>
      </div>

    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useInstanceStore } from '@/stores/instance'
import SystemStatus from '@/components/SystemStatus.vue'
import AgentSidebar from '@/components/sidebar/AgentSidebar.vue'
import ProjectsSidebar from '@/components/projects/ProjectsSidebar.vue'
import FilesSidebar from '@/components/files/FilesSidebar.vue'
import RecordEditor from '@/components/files/RecordEditor.vue'
import ScriptsSidebar from '@/components/scripts/ScriptsSidebar.vue'
import InstancesSidebar from '@/components/instances/InstancesSidebar.vue'
import ModulesSidebar from '@/components/modules/ModulesSidebar.vue'
import SkillsSidebar from '@/components/skills/SkillsSidebar.vue'
import WorkspacePanel from '@/components/workspace/WorkspacePanel.vue'
import WorkspaceEditor from '@/components/workspace/WorkspaceEditor.vue'
import { scriptApi } from '@/services/api'
import { workspaceApi, type WorkspaceScope } from '@/services/workspace'

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

/** Name of the tab that belongs to the page itself. */
const pageTabTitle = computed(() => {
  const hit = allViews.value.find(v => (v.path === '/' ? route.path === '/' : route.path.startsWith(v.path)))
  return hit?.title ?? 'Page'
})

function isActive(path: string): boolean {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}

function go(path: string) {
  router.push(path)
}

/** The agent activity owns its own sidebar: a list of conversations. */
const isAgentActivity = computed(() => route.path.startsWith('/agent'))
const isProjectsActivity = computed(() => route.path.startsWith('/projects'))
const isFilesActivity = computed(() => route.path.startsWith('/files'))
const isScriptsActivity = computed(() => route.path.startsWith('/scripts'))
const isInstancesActivity = computed(() => route.path.startsWith('/instances'))
const isModulesActivity = computed(() => route.path.startsWith('/modules'))
const isSkillsActivity = computed(() => route.path.startsWith('/skills'))

/** A skill's documents open like any other: same tabs, same editor. */
function openSkillFile(skill: string, path: string) {
  void openInScope({ kind: 'skill', name: skill }, path)
}

/** The program whose workspace is open below the project tree, if any. */
const programScope = ref<WorkspaceScope | null>(null)

function openProgramWorkspace(scope: { project: string; program: string }) {
  programScope.value = { kind: 'program', project: scope.project, program: scope.program }
}

/** A file belongs to whichever workspace it was opened from. */
function openAnyFile(path: string) {
  void openInScope(programScope.value ?? sessionScope.value, path)
}
const activeSessionId = computed(() =>
  typeof route.query.sessionId === 'string' ? route.query.sessionId : null
)

// A page container duplicated by a careless edit renders every view twice, which looks like a
// styling bug and is invisible to the compiler. Say so while developing.
if (import.meta.env.DEV) {
  onMounted(() => {
    const containers = document.querySelectorAll('.content').length
    if (containers !== 1) {
      console.warn(`[layout] expected one page container, found ${containers}`)
    }
  })
}

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

interface FileTab {
  key: string
  /** Stable monaco identity: the same file opened twice shares one model. */
  uri: string
  scope: WorkspaceScope
  path: string
  title: string
  content: string
  language: string
  binary: boolean
  dirty: boolean
}

interface ScriptTab {
  key: string
  id: number
  title: string
  uri: string
  /** The text belongs to the tab, not to whichever tab happens to be on screen. */
  text: string
  dirty: boolean
}

/** A binary's record, opened as its own tab so a big table can be edited at once. */
interface RecordTab {
  key: string
  fileId: number
  title: string
}

const recordTabs = ref<RecordTab[]>([])

const fileTabs = ref<FileTab[]>([])
const scriptTabs = ref<ScriptTab[]>([])
const scriptText = ref('')
const docEditorRef = ref<{ setText: (t: string) => void } | null>(null)

interface ActiveDoc {
  uri: string
  language: string
  /** null means the document cannot be shown as text. */
  text: string | null
  kind: 'file' | 'script'
}

const activeRecord = computed(() =>
  recordTabs.value.find(t => t.key === activeKey.value) ?? null
)

const activeDoc = computed<ActiveDoc | null>(() => {
  const script = activeScript.value
  if (script) return { uri: script.uri, language: 'kotlin', text: script.text, kind: 'script' }
  const file = activeFile.value
  if (!file) return null
  return {
    uri: file.uri,
    language: file.language,
    text: file.binary ? null : file.content,
    kind: 'file',
  }
})

function onDocEdit(text: string) {
  const doc = activeDoc.value
  if (!doc) return
  if (doc.kind === 'script') {
    const tab = activeScript.value
    if (!tab) return
    tab.text = text
    tab.dirty = true
    return
  }
  const file = activeFile.value
  if (file) onEdit(file, text)
}

/** Hand the current text to the editor, whichever document is showing. */
async function pushActiveText() {
  await nextTick()
  const doc = activeDoc.value
  if (!doc || doc.text === null) return
  docEditorRef.value?.setText(doc.text)
}

function saveActiveDoc() {
  if (activeDoc.value?.kind === 'script') void saveScript(activeScript.value)
  else if (activeFile.value) void saveTab(activeFile.value)
}
const activeFile = computed(() => fileTabs.value.find(t => t.key === activeKey.value) ?? null)
const activeScript = computed(() => scriptTabs.value.find(t => t.key === activeKey.value) ?? null)

/** A script opens in the same tab strip as a file; the editor does not care which it is. */
function openRecordTab(fileId: number, name: string) {
  const key = `record:${fileId}`
  if (!recordTabs.value.some(t => t.key === key)) {
    recordTabs.value.push({ key, fileId, title: name })
  }
  activeKey.value = key
}

function closeRecordTab(tab: RecordTab) {
  const index = recordTabs.value.findIndex(t => t.key === tab.key)
  if (index === -1) return
  recordTabs.value.splice(index, 1)
  if (activeKey.value === tab.key) activeKey.value = 'view'
}

async function openScriptTab(id: number, name: string) {
  const key = `script:${id}`
  const existing = scriptTabs.value.find(t => t.key === key)
  if (existing) {
    activeKey.value = key
    return
  }
  const tab: ScriptTab = { key, id, title: name, uri: `akiba://script/${id}`, text: '', dirty: false }
  scriptTabs.value.push(tab)
  // The watcher below fetches the text; doing it here as well was the reason a double click
  // produced two requests and, with a fast second click, two answers landing out of order.
  activeKey.value = key
}

const loadingScripts = new Set<number>()

async function loadScriptText(id: number) {
  if (loadingScripts.has(id)) return
  loadingScripts.add(id)
  const key = `script:${id}`
  try {
    const { data } = await scriptApi.get(id)
    // The answer is only applied if that tab is still the one on screen; otherwise a slow
    // response would drop one script's text into another's tab.
    if (activeKey.value !== key) return
    const tab = scriptTabs.value.find(t => t.key === key)
    if (tab) tab.text = data.code ?? ''
    await nextTick()
    await pushActiveText()
  } catch {
    if (activeKey.value === key) scriptText.value = ''
  } finally {
    loadingScripts.delete(id)
  }
}

async function saveScript(tab: ScriptTab | null = activeScript.value) {
  if (!tab) return
  try {
    const { data } = await scriptApi.get(tab.id)
    await scriptApi.update(tab.id, {
      name: data.name,
      description: data.description ?? '',
      code: tab.text,
      language: data.language ?? 'kotlin',
      saveResult: data.saveResult ?? true,
      maxOutputSize: data.maxOutputSize ?? 10485760,
    })
    tab.dirty = false
  } catch {
    // Leave the marker on: a failed write must not look saved.
  }
}

let scriptTimer: number | undefined
watch(() => activeScript.value?.text, () => {
  const tab = activeScript.value
  if (!tab) return
  window.clearTimeout(scriptTimer)
  scriptTimer = window.setTimeout(() => void saveScript(tab), 2500)
})

function closeScriptTab(tab: ScriptTab) {
  void saveScript(tab)
  scriptTabs.value = scriptTabs.value.filter(t => t.key !== tab.key)
  if (activeKey.value === tab.key) activeKey.value = 'view'
}
// Choosing another activity is a request to see that activity: a file tab must not keep the
// editor hostage while the sidebar has already moved on.
watch(() => route.fullPath, () => {
  activeKey.value = 'view'
})

watch(activeScript, tab => {
  if (tab) void loadScriptText(tab.id)
})

// Whichever tab is showing, its text is pushed after the editor exists.
watch(activeFile, async tab => {
  if (!tab || tab.binary) return
  await nextTick()
  await pushActiveText()
})
const activeKey = ref<string>('view')

watch(activeKey, async (_next, previous) => {
  const file = fileTabs.value.find(t => t.key === previous)
  if (file?.dirty) await saveTab(file)
  const script = scriptTabs.value.find(t => t.key === previous)
  if (script) {
    window.clearTimeout(scriptTimer)
    await saveScript(script)     // the tab that is being left, with its own text
  }
})

const saveTimers = new Map<string, number>()
/** Files being read right now, so a double click cannot open the same file twice. */
const opening = new Set<string>()

/** Monaco needs a language id, not an extension; common ones are enough here. */
function languageOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', kt: 'kotlin', kts: 'kotlin', java: 'java', py: 'python',
    md: 'markdown', txt: 'plaintext', log: 'plaintext', csv: 'plaintext',
    c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', rs: 'rust', go: 'go',
    sh: 'shell', yaml: 'yaml', yml: 'yaml', xml: 'xml', html: 'html', css: 'css',
  }
  return map[ext] ?? 'plaintext'
}

const sessionScope = computed<WorkspaceScope>(() => ({
  kind: 'session',
  sessionId: workspaceSessionId.value ?? '',
}))

/** A tab is named by its file, and by where that file lives when the name is not enough. */
function scopeLabel(scope: WorkspaceScope): string {
  if (scope.kind === 'session') return 'agent'
  if (scope.kind === 'skill') return scope.name
  return scope.project
}

/** A stable identity for the scope, whatever kind it is. */
function scopeId(scope: WorkspaceScope): string {
  if (scope.kind === 'session') return scope.sessionId
  if (scope.kind === 'skill') return `skill:${scope.name}`
  return `${scope.project}/${scope.program}`
}

function relabelTabs() {
  const byName = new Map<string, FileTab[]>()
  for (const tab of fileTabs.value) {
    const name = tab.path.split('/').pop() || tab.path
    const group = byName.get(name) ?? []
    group.push(tab)
    byName.set(name, group)
  }
  for (const [name, group] of byName) {
    for (const tab of group) {
      // Two files called notes.md are different files: say where each one is.
      tab.title = group.length === 1 ? name : `${scopeLabel(tab.scope)}: ${tab.path}`
    }
  }
}

async function openInScope(scope: WorkspaceScope | null, path: string) {
  if (!scope || (scope.kind === 'session' && !scope.sessionId)) return
  const existing = fileTabs.value.find(t => t.path === path)
  if (existing) {
    activeKey.value = existing.key
    return
  }
  if (opening.has(path)) return
  opening.add(path)
  try {
    const { data } = await workspaceApi.readFile(scope, path)
    // The read may have finished after another click already opened the same file.
    if (fileTabs.value.some(t => t.path === data.path)) {
      activeKey.value = fileTabs.value.find(t => t.path === data.path)!.key
      return
    }
    const tab: FileTab = {
      key: `${scope.kind}:${scopeId(scope)}:${path}`,
      uri: `akiba://${scope.kind}/${scopeId(scope)}/${path}`,
      scope,
      path: data.path,
      title: data.path.split('/').pop() || data.path,
      content: data.content,
      language: languageOf(data.path),
      binary: data.binary,
      dirty: false,
    }
    fileTabs.value.push(tab)
    relabelTabs()
    activeKey.value = tab.key
  } catch {
    // A file that cannot be read simply does not open; the tree still shows it exists.
  } finally {
    opening.delete(path)
  }
}

/**
 * Typing schedules a save; the dot in the tab is the only thing that reports it.
 *
 * There is no Save button on purpose: a workspace file is a note, not a document, and losing it
 * because someone closed a tab is worse than writing it a second time.
 */
function onEdit(tab: FileTab, content: string) {
  tab.content = content
  tab.dirty = true
  const pending = saveTimers.get(tab.key)
  if (pending) clearTimeout(pending)
  saveTimers.set(tab.key, window.setTimeout(() => void saveTab(tab), 700))
}

async function saveTab(tab: FileTab) {
  const pending = saveTimers.get(tab.key)
  if (pending) {
    clearTimeout(pending)
    saveTimers.delete(tab.key)
  }
  try {
    await workspaceApi.writeFile(tab.scope, tab.path, tab.content)
    tab.dirty = false
  } catch {
    // Leave it marked dirty: an unsaved change must not look saved.
  }
}

async function closeTab(tab: FileTab) {
  if (tab.dirty) await saveTab(tab)
  const index = fileTabs.value.findIndex(t => t.key === tab.key)
  if (index === -1) return
  fileTabs.value.splice(index, 1)
  relabelTabs()
  if (activeKey.value === tab.key) {
    activeKey.value = fileTabs.value[Math.min(index, fileTabs.value.length - 1)]?.key ?? 'view'
  }
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
  position: relative;
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
  font: inherit;
  font-size: 12px;
  background: transparent;
  border: none;
  border-top: 1px solid transparent;
  border-right: 1px solid var(--vscode-panel-border);
  color: var(--akiba-chat-text-faint);
  cursor: pointer;
}

.tab:hover {
  background: var(--akiba-chat-hover);
  color: var(--akiba-chat-text-muted);
}

.tab.active {
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
  border-top-color: var(--vscode-focusBorder);
}

.tab-spacer {
  flex: 1;
}

.file-note,
.file-note-block,
.bar-btn,
.save-state {
  color: var(--akiba-chat-text-faint);
}

.file-note-block {
  padding: 16px;
  font-size: 13px;
}

.file-body {
  position: absolute;
  inset: 36px 0 0 0;
  flex: 1;
  min-height: 0;
}

.tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--akiba-warning-text);
  flex: 0 0 auto;
}

.tab-close {
  opacity: 0.45;
  padding: 0 2px;
  border-radius: 2px;
}

.tab-close:hover {
  opacity: 1;
  background: var(--akiba-chat-hover);
}

.content {
  flex: 1;
  overflow: auto;
  padding: 0;
}
</style>
