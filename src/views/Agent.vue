<template>
  <div class="agent-page">
    <aside class="session-list">
      <div class="session-header">
        <h3>Sessions</h3>
        <button class="btn-primary small" @click="openNewSessionModal" :disabled="creatingSession">
          {{ creatingSession ? '…' : '+ New' }}
        </button>
      </div>
      <div v-if="loadingSessions" class="muted small">Loading…</div>
      <div v-else-if="sessions.length === 0" class="muted small">No sessions yet</div>
      <ul v-else class="sessions">
        <li
          v-for="s in sessions"
          :key="s.sessionId"
          :class="{ active: s.sessionId === activeSessionId }"
          @click="selectSession(s.sessionId)"
          @contextmenu.prevent="openContextMenu($event, s.sessionId, s.sessionName || '')"
        >
          <div class="title">
            {{ s.sessionName || 'Untitled' }}
            <span v-if="s.moduleName && s.moduleName !== 'chat'" class="module-badge">{{ s.moduleName }}</span>
          </div>
          <div class="sub">
            <span :class="['status', s.status]">{{ s.status }}</span>
            <span class="time">{{ formatDate(s.updatedAt || s.createdAt) }}</span>
          </div>
          <button
            class="del"
            title="Delete"
            @click.stop="deleteSession(s.sessionId)"
          >×</button>
        </li>
      </ul>

      <!-- Right-click context menu -->
      <div
        v-if="ctxMenu.show"
        class="ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
        @click.self="ctxMenu.show = false"
      >
        <div class="ctx-menu-item" @click="exportSession(ctxMenu.sessionId)">📥 Export</div>
      </div>
    </aside>

    <main class="chat">
      <div v-if="!activeSessionId" class="empty-state">
        <p>Select a session on the left, or create a new one to start chatting.</p>
      </div>
      <template v-else>
        <div class="messages" ref="messagesEl" @scroll="onMessagesScroll">
          <div v-if="loadingMessages" class="muted small">Loading messages…</div>
          <div v-else-if="messages.length === 0" class="muted small">
            No messages yet. Send a message to start the conversation.
          </div>
          <div
            v-for="m in messages"
            :key="m.messageId"
            :class="['msg', m.role]"
          >
            <div class="msg-header">
              <span class="role">{{ roleLabel(m) }}</span>
              <span class="time">{{ formatTime(m.createdAt) }}{{ m.role === 'tool' ? toolDurationLabel(m) : '' }}</span>
            </div>
            <div v-if="m.role === 'tool'" :class="['tool-call', toolStatus(m)]">
              <details>
                <summary>{{ toolSummary(m) }}</summary>
                <div class="tool-detail">
                  <div class="tool-section">
                    <div class="tool-label">Parameters</div>
                    <pre class="tool-args-text">{{ toolArgs(m) }}</pre>
                  </div>
                  <div class="tool-section">
                    <div class="tool-label">Output</div>
                    <pre class="tool-result-text" v-html="renderedToolResult(m)"></pre>
                  </div>
                </div>
              </details>
            </div>
            <div v-else class="content" v-html="renderMarkdown(m.content)"></div>
          </div>
          <div v-if="sending" class="msg assistant pending">
            <div class="role">Akiba</div>
            <div class="content"><span class="dot-flash">Thinking…</span></div>
          </div>
        </div>

        <div class="token-bar">
          <span class="token-label">Token usage</span>
          <span class="token-value">I:{{ roundInputTokens.toLocaleString() }}</span>
          <span class="token-value">O:{{ roundOutputTokens.toLocaleString() }}</span>
          <span class="token-value total">T:{{ totalTokens.toLocaleString() }}</span>
          <span v-if="lastInputTokens != null && contextLength != null" class="token-value context">
            Last input: {{ lastInputTokens.toLocaleString() }} / {{ contextLength.toLocaleString() }}
          </span>
          <span v-if="lastInputTokens != null && contextLength == null" class="token-value context-dim" title="Failed to fetch model context limit. The remote model registry may be unreachable.">
            Last input: {{ lastInputTokens.toLocaleString() }}<span class="hint-icon"> ⚠</span>
          </span>
          <span v-if="sessionModelName" class="token-model">{{ sessionModelName }}</span>
        </div>

        <div v-if="isAutomatedSession" class="automated-banner">
          ⚠ Current session is in an automated task, you need to go to Workflows to abort it.
        </div>

        <div v-if="errorMsg" class="error-banner">{{ errorMsg }}</div>

        <!-- LLM config selector + composer -->
        <div class="composer-area">
          <!-- LLM config selector -->
          <div v-if="llmConfigs.length > 0" class="llm-selector">
            <div class="llm-selector-row">
              <select v-model="selectedLlmConfig" class="llm-select" @change="onLlmConfigChange" :disabled="isAutomatedSession">
                <option value="" disabled>— Select API Key —</option>
                <option v-for="c in llmConfigs" :key="c.id" :value="c.id">
                  {{ c.provider }} / {{ c.modelNames.length }} models{{ c.baseUrl ? ` (${c.baseUrl})` : '' }}
                </option>
              </select>
              <select v-model="selectedLlmModel" class="llm-select" :disabled="!availableModels.length || isAutomatedSession">
                <option value="" disabled>— Select model —</option>
                <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
          </div>
          <div v-else class="llm-selector llm-empty">
            <span>No LLM configuration found. </span>
            <a href="#/settings" class="llm-link">Create one in Settings</a>
          </div>

          <form class="composer" @submit.prevent="sendMessage">
            <textarea
              v-model="input"
              :placeholder="isAutomatedSession ? 'This is an automated analysis session — chat is read-only' : 'Type your message and press Ctrl/⌘ + Enter to send…'"
              rows="3"
              @keydown="onComposerKeydown"
              :disabled="sending || isAutomatedSession"
            ></textarea>
            <button class="btn-primary" type="submit" :disabled="sending || !input.trim() || isAutomatedSession">
              {{ sending ? 'Sending…' : 'Send' }}
            </button>
          </form>
        </div>
      </template>
    </main>

    <!-- New session file selector modal -->
    <div v-if="showNewModal" class="modal" @click.self="showNewModal = false">
      <div class="modal-content wide">
        <h2>New Agent Session</h2>
        <p class="subtitle">Select a binary file to analyze, or skip to start an empty session.</p>

        <div v-if="llmConfigs.length === 0" class="no-llm-warning">
          <strong>No LLM configuration found.</strong>
          You need to create an LLM configuration in
          <a href="#/settings" class="llm-link">Settings</a> before the agent can respond.
        </div>

        <div class="form-group">
          <label>Search files</label>
          <div class="search-row">
            <input
              v-model="fileSearchQuery"
              placeholder="Search by name, ID, architecture…"
              @keydown.enter="searchFiles"
              class="search-input"
            />
            <button class="btn-secondary" @click="searchFiles" :disabled="searching">
              {{ searching ? 'Searching…' : 'Search' }}
            </button>
          </div>
        </div>

        <div v-if="searchError" class="error">{{ searchError }}</div>

        <div v-if="searchResults.length > 0" class="file-list">
          <div
            v-for="f in searchResults"
            :key="f.id"
            :class="['file-item', { selected: selectedFile?.id === f.id }]"
            @click="selectFileForSession(f)"
          >
            <div class="file-name">{{ f.name }}</div>
            <div class="file-meta">
              <span class="tag">ID: {{ f.id }}</span>
              <span v-if="f.arch" class="tag">{{ f.arch }}</span>
              <span v-if="f.format" class="tag">{{ f.format }}</span>
            </div>
          </div>
        </div>
        <div v-else-if="fileSearchQuery && !searching" class="muted small">
          No matching files found.
        </div>

        <div v-if="selectedFile" class="form-group project-group">
          <label>Ghidra project</label>
          <div class="project-mode-row">
            <label class="radio-label">
              <input type="radio" value="new" v-model="projectMode" />
              Create new project
            </label>
            <label class="radio-label">
              <input type="radio" value="existing" v-model="projectMode" :disabled="ghidraProjects.length === 0" />
              Use existing project
            </label>
          </div>
          <input
            v-if="projectMode === 'new'"
            v-model="selectedProjectName"
            class="search-input"
            placeholder="Project name"
          />
          <select v-else v-model="selectedProjectName" class="search-input">
            <option value="" disabled>— Select project —</option>
            <option v-for="p in ghidraProjects" :key="p" :value="p">{{ p }}</option>
          </select>
          <div class="muted small project-hint">
            run_module and Ghidra scripts will use this project for the selected binary.
          </div>
          <div v-if="projectNameError" class="error project-error">{{ projectNameError }}</div>
        </div>

        <div class="modal-actions">
          <button @click="showNewModal = false" class="btn-secondary">Cancel</button>
          <button @click="createSession" class="btn-primary" :disabled="!canCreateSession">
            {{ creatingSession ? 'Creating…' : selectedFile ? `Analyze "${selectedFile.name}"` : 'Start Empty' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { agentApi, fileApi, llmConfigApi, workflowApi } from '@/services/api'
import type { AgentSession, AgentMessage } from '@/types'
import type { FileSearchResult, StoredKeyEntry } from '@/services/api'
import { renderMarkdown, fixLiteralNewlines } from '@/utils/format'

const sessions = ref<AgentSession[]>([])
const messages = ref<AgentMessage[]>([])
const activeSessionId = ref<string | null>(null)

const loadingSessions = ref(false)
const loadingMessages = ref(false)
const creatingSession = ref(false)
const sending = ref(false)
const errorMsg = ref('')
const modalError = ref('')
const input = ref('')
const tokenUsage = ref<{ input: number; output: number } | null>(null)

// Token tracking (computed from all assistant messages)
const roundInputTokens = ref(0)
const roundOutputTokens = ref(0)
const totalTokens = ref(0)
const lastInputTokens = ref<number | null>(null)
const contextLength = ref<number | null>(null)
const sessionModelName = ref('')

// Whether the active session is an automated (non-chat) agent session
const isAutomatedSession = computed(() => {
  const s = sessions.value.find(s => s.sessionId === activeSessionId.value)
  return !!s?.moduleName && s.moduleName !== 'chat' &&
    (s?.status === 'active' || s?.status === 'running')
})

const messagesEl = ref<HTMLElement | null>(null)

// ---- Context menu ----------------------------------------------------------
const ctxMenu = reactive({ show: false, x: 0, y: 0, sessionId: '' })

function openContextMenu(e: MouseEvent, sessionId: string, _name: string) {
  ctxMenu.show = true
  ctxMenu.x = e.clientX
  ctxMenu.y = e.clientY
  ctxMenu.sessionId = sessionId
}

// Close context menu on any click outside
document.addEventListener('click', () => {
  if (ctxMenu.show) ctxMenu.show = false
})

async function exportSession(sessionId: string) {
  ctxMenu.show = false
  try {
    const resp = await agentApi.exportSession(sessionId)
    const url = URL.createObjectURL(new Blob([resp.data], { type: 'text/markdown' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `session_${sessionId.slice(0, 8)}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (_e: any) {
    errorMsg.value = 'Failed to export session.'
  }
}

// ---- LLM config ------------------------------------------------------------
const llmConfigs = ref<StoredKeyEntry[]>([])
const selectedLlmConfig = ref('')
const selectedLlmModel = ref('')
const availableModels = ref<string[]>([])

onMounted(async () => {
  await Promise.all([loadSessions(), loadLlmConfigs()])

  // Check URL params for a pre-selected session (e.g. from workflow detail)
  const params = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search)
  const presetSession = params.get('sessionId')

  if (presetSession) {
    // Find it in the loaded sessions list
    const found = sessions.value.find(s => s.sessionId === presetSession)
    if (found) {
      await selectSession(found.sessionId)
      return
    }
    // Session not yet loaded — fetch it directly
    try {
      const { data } = await agentApi.getMessages(presetSession)
      // Add a stub session entry to the list
      sessions.value.unshift({
        sessionId: presetSession,
        sessionName: 'Workflow Agent',
        status: 'running',
        modelName: null,
        createdAt: null,
        updatedAt: null
      })
      activeSessionId.value = presetSession
      messages.value = data.messages || []
      await scrollToBottom()
    } catch {
      // Fallback to default
      if (sessions.value.length > 0 && llmConfigs.value.length > 0) {
        selectedLlmConfig.value = llmConfigs.value[0].id
        onLlmConfigChange()
        await selectSession(sessions.value[0].sessionId)
      }
    }
  } else if (sessions.value.length > 0 && llmConfigs.value.length > 0) {
    selectedLlmConfig.value = llmConfigs.value[0].id
    onLlmConfigChange()
    await selectSession(sessions.value[0].sessionId)
  }
})

onUnmounted(() => {
  if (messagePollInterval) { clearInterval(messagePollInterval); messagePollInterval = null }
})

async function loadLlmConfigs() {
  try {
    const { data } = await llmConfigApi.keys()
    llmConfigs.value = data.keys || []
    if (llmConfigs.value.length > 0 && !selectedLlmConfig.value) {
      selectedLlmConfig.value = llmConfigs.value[0].id
      onLlmConfigChange()
    }
  } catch (_e: any) {
    llmConfigs.value = []
  }
}

function onLlmConfigChange() {
  availableModels.value = []
  selectedLlmModel.value = ''
  const config = llmConfigs.value.find(c => c.id === selectedLlmConfig.value)
  if (config && config.modelNames.length > 0) {
    availableModels.value = config.modelNames
    selectedLlmModel.value = config.modelNames[0]
  }
}

// ---- Sessions ---------------------------------------------------------------
const showNewModal = ref(false)
const fileSearchQuery = ref('')
const searchResults = ref<FileSearchResult[]>([])
const searching = ref(false)
const searchError = ref('')
const selectedFile = ref<FileSearchResult | null>(null)
const ghidraProjects = ref<string[]>([])
const projectMode = ref<'new' | 'existing'>('new')
const selectedProjectName = ref('')
const validProjectName = /^[A-Za-z0-9._-]{1,64}$/
const projectNameError = computed(() => {
  if (!selectedFile.value) return ''
  const name = selectedProjectName.value.trim()
  if (!name) return 'Project name is required.'
  if (!validProjectName.test(name) || name.includes('..')) {
    return 'Use 1-64 chars: letters, digits, dot, underscore or hyphen.'
  }
  return ''
})
const canCreateSession = computed(() => !creatingSession.value)

async function loadSessions() {
  loadingSessions.value = true
  try {
    const { data } = await agentApi.listSessions()
    sessions.value = data.sessions || []
  } catch (e) {
    console.error('Failed to load sessions:', e)
  } finally {
    loadingSessions.value = false
  }
}

function openNewSessionModal() {
  showNewModal.value = true
  fileSearchQuery.value = ''
  searchResults.value = []
  searchError.value = ''
  modalError.value = ''
  selectedFile.value = null
  projectMode.value = 'new'
  selectedProjectName.value = defaultProjectName()
  loadGhidraProjects()
}

function defaultProjectName(file?: FileSearchResult | null): string {
  const base = (file?.name || 'agent-session')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'agent-session'
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return `${base}-${stamp}`
}

function selectFileForSession(file: FileSearchResult) {
  selectedFile.value = file
  modalError.value = ''
  if (projectMode.value === 'new') selectedProjectName.value = defaultProjectName(file)
}

async function loadGhidraProjects() {
  try {
    const { data } = await workflowApi.projects()
    ghidraProjects.value = data.projects || []
    if (projectMode.value === 'existing') {
      selectedProjectName.value = ghidraProjects.value[0] || ''
    }
  } catch {
    ghidraProjects.value = []
    if (projectMode.value === 'existing') selectedProjectName.value = ''
  }
}

watch(projectMode, (mode) => {
  modalError.value = ''
  if (mode === 'existing') {
    selectedProjectName.value = ghidraProjects.value[0] || ''
  } else {
    selectedProjectName.value = defaultProjectName(selectedFile.value)
  }
})

watch(selectedProjectName, () => {
  modalError.value = ''
})

async function searchFiles() {
  if (!fileSearchQuery.value.trim()) return
  searching.value = true
  searchError.value = ''
  try {
    const { data } = await fileApi.search(fileSearchQuery.value.trim())
    searchResults.value = data.files || []
  } catch (e: any) {
    searchError.value = e?.response?.data?.error || e?.message || 'Search failed.'
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

async function createSession() {
  if (creatingSession.value) return
  modalError.value = ''
  if (selectedFile.value && projectNameError.value) {
    modalError.value = projectNameError.value
    return
  }
  creatingSession.value = true
  errorMsg.value = ''
  try {
    const payload: any = {
      modelName: selectedLlmModel.value || undefined
    }
    if (selectedFile.value) {
      payload.binaryId = selectedFile.value.id
      payload.sessionName = `Analysis of ${selectedFile.value.name}`
      payload.projectName = selectedProjectName.value.trim()
      payload.projectMode = projectMode.value
    }
    const { data } = await agentApi.createSession(payload)
    sessions.value.unshift(data)
    showNewModal.value = false
    tokenUsage.value = null
    await selectSession(data.sessionId)
  } catch (e: any) {
    modalError.value = e?.response?.data?.error || e?.message || 'Failed to create session.'
  } finally {
    creatingSession.value = false
  }
}

let messagePollInterval: number | null = null
const NORMAL_POLL_MS = 3000
const ACTIVE_CHAT_POLL_MS = 750

async function refreshMessages() {
  if (!activeSessionId.value) return
  try {
    const { data } = await agentApi.getMessages(activeSessionId.value)
    const nextMessages = data.messages || []
    const messagesChanged = JSON.stringify(nextMessages) !== JSON.stringify(messages.value)
    messages.value = nextMessages
    // Use backend-provided token stats; update even when message text is unchanged.
    roundInputTokens.value = data.totalInputTokens ?? 0
    roundOutputTokens.value = data.totalOutputTokens ?? 0
    totalTokens.value = roundInputTokens.value + roundOutputTokens.value
    lastInputTokens.value = data.lastInputTokens ?? null
    contextLength.value = data.contextLength ?? null
    if (messagesChanged) await scrollToBottom()
  } catch { /* ignore */ }
}

function startMessagePolling(intervalMs = NORMAL_POLL_MS) {
  if (messagePollInterval) clearInterval(messagePollInterval)
  messagePollInterval = window.setInterval(refreshMessages, intervalMs)
}

async function selectSession(id: string) {
  activeSessionId.value = id
  errorMsg.value = ''
  messages.value = []
  tokenUsage.value = null
  loadingMessages.value = true
  // Stop previous polling
  if (messagePollInterval) { clearInterval(messagePollInterval); messagePollInterval = null }

  // Set model name from session info
  const session = sessions.value.find(s => s.sessionId === id)
  sessionModelName.value = session?.modelName || ''

  try {
    const { data } = await agentApi.getMessages(id)
    messages.value = data.messages || []
    roundInputTokens.value = data.totalInputTokens ?? 0
    roundOutputTokens.value = data.totalOutputTokens ?? 0
    totalTokens.value = roundInputTokens.value + roundOutputTokens.value
    lastInputTokens.value = data.lastInputTokens ?? null
    contextLength.value = data.contextLength ?? null
    await scrollToBottom()
    // Start auto-polling while this session is active
    startMessagePolling()
  } catch (e) {
    console.error('Failed to load messages:', e)
  } finally {
    loadingMessages.value = false
  }
}

async function deleteSession(id: string) {
  if (!confirm('Delete this session?')) return
  try {
    await agentApi.deleteSession(id)
    sessions.value = sessions.value.filter((s) => s.sessionId !== id)
    if (activeSessionId.value === id) {
      activeSessionId.value = null
      messages.value = []
      tokenUsage.value = null
    }
  } catch (e) {
    console.error('Failed to delete session:', e)
  }
}

async function sendMessage() {
  if (!activeSessionId.value || !input.value.trim() || sending.value) return
  const content = input.value
  input.value = ''
  errorMsg.value = ''
  sending.value = true
  startMessagePolling(ACTIVE_CHAT_POLL_MS)

  // Optimistic user message
  const tempUser: AgentMessage = {
    messageId: -Date.now(),
    messageIndex: messages.value.length,
    role: 'user',
    content,
    createdAt: new Date().toISOString()
  }
  messages.value.push(tempUser)
  await scrollToBottom()

  try {
    await agentApi.chat(activeSessionId.value, content)
    // Reload all messages from server to capture tool calls too
    await refreshMessages()
  } catch (e: any) {
    messages.value = messages.value.filter((m) => m.messageId !== tempUser.messageId)
    errorMsg.value = e?.response?.data?.error || e?.message || 'Chat failed.'
    input.value = content
  } finally {
    sending.value = false
    startMessagePolling()
  }
}

function onComposerKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    sendMessage()
  }
}

/** Whether the user has manually scrolled away from the bottom. */
let userScrolledAway = false

function onMessagesScroll() {
  const el = messagesEl.value
  if (!el) return
  // Consider "near bottom" if within 100px of the bottom
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  userScrolledAway = !nearBottom
}

async function scrollToBottom() {
  await nextTick()
  const el = messagesEl.value
  if (!el || userScrolledAway) return
  el.scrollTop = el.scrollHeight
}

function formatDate(date: string | null | undefined) {
  if (!date) return ''
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

function formatTime(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function toolDurationLabel(m: AgentMessage): string {
  const text = m.toolResult || m.content || ''
  const m2 = text.match(/duration=(\d+)ms/)
  return m2 ? `  ·  ${m2[1]}ms` : ''
}

function roleLabel(m: AgentMessage): string {
  if (m.role === 'assistant') return 'Akiba'
  if (m.role === 'user') return 'You'
  if (m.role === 'tool') return 'Tool'
  return m.role
}

function toolSummary(m: AgentMessage): string {
  const name = m.toolName || 'tool'
  return `🛠 ${name}`
}

function toolArgs(m: AgentMessage): string {
  const text = m.toolResult || m.content || ''
  const args = parseToolArgs(text)
  return args ? JSON.stringify(args, null, 2) : '(no parameters)'
}

function parseToolArgs(text: string): Record<string, any> | null {
  const argsIdx = text.indexOf('args=')
  if (argsIdx < 0) return null
  const jsonStart = text.indexOf('{', argsIdx)
  if (jsonStart < 0) return null
  let depth = 0
  for (let i = jsonStart; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') { depth--; if (depth === 0) {
      try { return JSON.parse(text.slice(jsonStart, i + 1)) } catch { break }
    }}
  }
  return null
}

function toolStatus(m: AgentMessage): string {
  const text = m.toolResult || m.content || ''
  // Strip observation prefix to get just the output
  const obsEnd = text.indexOf(':** ')
  const outputText = (obsEnd >= 0 ? text.slice(obsEnd + 4) : text).trim()

  // Check for error indicators in the raw text first
  if (text.includes('Error:') || text.includes('failed:') ||
      text.startsWith('Unknown tool') || text.startsWith('Error ') ||
      text.includes('execution error')) return 'status-error'

  // Try parsing as JSON to detect success/failure
  if (outputText.startsWith('[')) {
    try {
      const arr = JSON.parse(outputText)
      if (Array.isArray(arr) && arr.length > 0) {
        const first = arr[0]
        if (typeof first === 'string') return 'status-success'
        const s = first?.success
        if (s === true || s === 'true') return 'status-success'
        if (s === false || s === 'false') return 'status-error'
        return 'status-success'
      }
    } catch { /* fall through */ }
  }

  if (outputText.startsWith('{')) {
    try {
      const parsed = JSON.parse(outputText)
      const success = parsed.success
      if (success === true || success === 'true') return 'status-success'
      if (success === false || success === 'false') return 'status-error'
      if (!('success' in parsed) && !('error' in parsed)) return 'status-success'
    } catch { /* not valid JSON, treat as success */ }
  }

  // Plain text results that aren't errors are successful
  return 'status-success'
}

function renderedToolResult(m: AgentMessage): string {
  let text = m.toolResult || m.content || ''
  // Strip the "**Observation (anything)**: " prefix
  const obsEnd = text.indexOf(':** ')
  if (obsEnd >= 0) text = text.slice(obsEnd + 4)
  // Fix literal \n in JSON strings
  text = fixLiteralNewlines(text)
  // If the result is JSON, pretty-print it
  const trimmed = text.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2)
    } catch { /* not valid JSON, fall through */ }
  }
  return text
}
</script>

<style scoped>
.agent-page {
  display: flex;
  gap: 20px;
  height: calc(100vh - 140px);
  min-height: 480px;
}

.session-list {
  width: 280px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.session-header h3 {
  font-size: 16px;
  margin: 0;
}

.btn-primary {
  padding: 10px 18px;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-primary.small { padding: 6px 12px; font-size: 13px; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.sessions { list-style: none; padding: 0; margin: 0; }

.sessions li {
  position: relative;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  border: 1px solid transparent;
}
.sessions li:hover { background: #fafafa; }
.sessions li.active {
  background: #fff5f7;
  border-color: #e94560;
}
.sessions li .title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
  padding-right: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.module-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 500;
  background: #e3f2fd;
  color: #1976d2;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 4px;
  vertical-align: middle;
}
.sessions li .sub {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #888;
}
.sessions li .del {
  position: absolute;
  top: 6px;
  right: 6px;
  background: transparent;
  border: none;
  color: #aaa;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}
.sessions li .del:hover { color: #e94560; }

.status {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 8px;
  background: #f0f0f0;
}
.status.active, .status.running { background: #e3f2fd; color: #1976d2; }
.status.completed { background: #e8f5e9; color: #388e3c; }
.status.cancelled { background: #f5f5f5; color: #777; }
.status.failed { background: #ffebee; color: #d32f2f; }

.chat {
  flex: 1;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.msg {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 80%;
}

.msg.user {
  align-self: flex-end;
  align-items: flex-end;
}

.msg.assistant {
  align-self: flex-start;
}

.msg .msg-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.msg .msg-header .role {
  font-size: 11px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
}
.msg .msg-header .time {
  font-size: 10px;
  color: #aaa;
  font-weight: 400;
}

.msg .content {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.msg.user .content {
  background: #e94560;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.msg.assistant .content {
  background: #f5f5f7;
  color: #222;
  border-bottom-left-radius: 4px;
}

.msg.assistant.pending .content {
  font-style: italic;
  color: #888;
}

.msg.tool {
  align-self: flex-start;
  max-width: 90%;
}
.tool-call {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 0;
  font-size: 12px;
  width: 100%;
  overflow: hidden;
}
.tool-call.status-success { border-color: #a5d6a7; background: #f1f8e9; }
.tool-call.status-error   { border-color: #ef9a9a; background: #fff5f5; }
.tool-call.status-default { border-color: #e0e0e0; background: #fafafa; }
.tool-call details { padding: 0; }
.tool-call summary {
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  color: #555;
  font-weight: 500;
  user-select: none;
}
.tool-call.status-success summary { color: #2e7d32; }
.tool-call.status-error summary   { color: #c62828; }
.tool-call summary:hover { background: rgba(0,0,0,0.03); }

/* Two-column tool detail layout */
.tool-detail {
  display: flex;
  flex-direction: row;
  border-top: 1px solid #e0e0e0;
  min-height: 40px;
}
.tool-section {
  flex: 1;
  width: 50%;
  min-width: 0;
}
.tool-section + .tool-section {
  border-top: none;
  border-left: 1px solid #eee;
}
.tool-label {
  font-size: 10px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 5px 10px 0;
}
.tool-args-text, .tool-result-text {
  margin: 0;
  padding: 4px 10px 8px;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}
.tool-result-text {
  background: #1a1a2e;
  color: #e0e0e0;
}

.dot-flash {
  animation: pulse 1.2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

/* Token bar */
.token-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px;
  background: #f8f9fa;
  border-top: 1px solid #eee;
  font-size: 12px;
  color: #666;
}
.token-label {
  font-weight: 500;
  color: #888;
}
.token-value {
  background: #eef2f7;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 11px;
}

/* Token bar */
.token-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
  font-size: 11px;
  color: #666;
  border-top: 1px solid #eee;
  min-height: 22px;
}
.token-label { font-weight: 500; color: #888; margin-right: 4px; }
.token-value {
  background: #eef2f7; padding: 1px 6px; border-radius: 4px;
  font-family: monospace; font-size: 11px;
}
.token-value.total { background: #fce4ec; color: #c62828; }
.token-value.context { background: #e8f5e9; color: #2e7d32; }
.token-value.context-dim { background: #fff3e0; color: #e65100; }
.token-model {
  margin-left: auto; font-size: 10px; color: #aaa;
  max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.automated-banner {
  background: #fff3cd;
  color: #856404;
  padding: 8px 16px;
  font-size: 12px;
  border-top: 1px solid #ffeeba;
  text-align: center;
}

.error-banner {
  background: #ffebee;
  color: #d32f2f;
  padding: 10px 16px;
  font-size: 13px;
  border-top: 1px solid #ffcdd2;
}

/* LLM selector + composer */
.composer-area {
  border-top: 1px solid #eee;
}

.llm-selector {
  padding: 8px 16px;
  background: #fafafa;
  border-bottom: 1px solid #eee;
}
.llm-selector-row {
  display: flex;
  gap: 8px;
}
.llm-selector-row .llm-select { flex: 1; }

.llm-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 13px;
  font-family: inherit;
  background: #fff;
}
.llm-empty {
  font-size: 13px;
  color: #888;
}
.llm-link {
  color: #e94560;
  text-decoration: underline;
  cursor: pointer;
}

.composer {
  display: flex;
  gap: 10px;
  padding: 14px 16px;
  background: #fafafa;
}

.composer textarea {
  flex: 1;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
}

.composer textarea:disabled { background: #f0f0f0; }

.muted {
  color: #999;
  text-align: center;
  padding: 14px;
}
.muted.small { font-size: 13px; }

/* ---- Context Menu --------------------------------------------------------- */
.ctx-menu {
  position: fixed;
  z-index: 200;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  padding: 4px 0;
  min-width: 120px;
}
.ctx-menu-item {
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.ctx-menu-item:hover { background: #fff5f7; color: #e94560; }

/* ---- New Session Modal ---------------------------------------------------- */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal-content {
  background: #fff;
  padding: 30px;
  border-radius: 10px;
  width: 500px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
}
.modal-content.wide { width: 650px; }
.modal-content h2 { margin-bottom: 6px; font-size: 20px; }
.subtitle { color: #666; font-size: 13px; margin: 0 0 18px; }

.no-llm-warning {
  background: #fff3cd;
  border: 1px solid #ffeeba;
  color: #856404;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 16px;
}

.form-group { margin-bottom: 16px; }
.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
}

.search-row {
  display: flex;
  gap: 10px;
}
.search-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
}
.project-mode-row {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #444;
}
.project-hint { margin-top: 6px; }
.project-error { margin-top: 6px; font-size: 12px; }
.modal-error {
  background: #ffebee;
  border: 1px solid #ffcdd2;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 14px;
}

.file-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 6px;
  margin-bottom: 16px;
}
.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}
.file-item:hover { background: #fafafa; }
.file-item.selected { background: #fff5f7; border-left: 3px solid #e94560; }
.file-item:last-child { border-bottom: none; }
.file-name { font-size: 14px; font-weight: 500; }
.file-meta { display: flex; gap: 6px; align-items: center; }
.tag {
  font-size: 11px;
  padding: 2px 8px;
  background: #f5f5f5;
  border-radius: 4px;
  color: #666;
  white-space: nowrap;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
.btn-secondary {
  padding: 10px 20px;
  background: #f5f5f5;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-secondary:hover:not(:disabled) { background: #eee; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.error {
  color: #d32f2f;
  font-size: 13px;
  margin: 8px 0;
}
</style>

<!-- Markdown rendering styles (non-scoped so they apply to v-html content) -->
<style>
/* Markdown rendering inside agent messages (non-scoped to reach v-html content) */
.msg .content h2, .msg .content h3, .msg .content h4 {
  margin: 12px 0 6px; font-size: inherit;
}
.msg .content p { margin: 6px 0; line-height: 1.5; }
.msg .content strong { font-weight: 600; }
.msg .content em { font-style: italic; }
.msg .content code.md-code-inline {
  background: #e8e8e8; padding: 1px 6px; border-radius: 4px;
  font-size: 12px; font-family: 'Courier New', monospace;
}
.msg .content pre.md-code-block {
  background: #1a1a2e; color: #e0e0e0; padding: 10px 14px;
  border-radius: 6px; overflow-x: auto; font-size: 12px;
  line-height: 1.5; margin: 8px 0;
}
.msg .content pre.md-code-block code {
  background: none; padding: 0; font-family: 'Courier New', monospace;
}
.msg .content ul.md-ul { margin: 6px 0; padding-left: 20px; }
.msg .content li.md-li { list-style: disc; margin: 2px 0; }
.msg .content a { color: #1565c0; text-decoration: underline; }
.msg .content hr.md-hr { border: none; border-top: 1px solid #ddd; margin: 12px 0; }
</style>
