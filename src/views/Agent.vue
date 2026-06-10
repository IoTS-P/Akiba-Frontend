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
          <div class="title">{{ s.sessionName || 'Untitled' }}</div>
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
        <div class="messages" ref="messagesEl">
          <div v-if="loadingMessages" class="muted small">Loading messages…</div>
          <div v-else-if="messages.length === 0" class="muted small">
            No messages yet. Send a message to start the conversation.
          </div>
          <div
            v-for="m in messages"
            :key="m.messageId"
            :class="['msg', m.role]"
          >
            <div class="role">{{ roleLabel(m) }}</div>
            <div v-if="m.role === 'tool'" class="tool-call">
              <details>
                <summary>{{ toolSummary(m) }}</summary>
                <pre class="tool-result">{{ toolResult(m) }}</pre>
              </details>
            </div>
            <div v-else class="content">{{ m.content }}</div>
          </div>
          <div v-if="sending" class="msg assistant pending">
            <div class="role">Akiba</div>
            <div class="content"><span class="dot-flash">Thinking…</span></div>
          </div>
        </div>

        <div v-if="tokenUsage" class="token-bar">
          <span class="token-label">Token usage</span>
          <span class="token-value">I:{{ tokenUsage.input.toLocaleString() }}</span>
          <span class="token-value">O:{{ tokenUsage.output.toLocaleString() }}</span>
        </div>

        <div v-if="errorMsg" class="error-banner">{{ errorMsg }}</div>

        <!-- LLM config selector + composer -->
        <div class="composer-area">
          <!-- LLM config selector -->
          <div v-if="llmConfigs.length > 0" class="llm-selector">
            <div class="llm-selector-row">
              <select v-model="selectedLlmConfig" class="llm-select" @change="onLlmConfigChange">
                <option value="" disabled>— Select API Key —</option>
                <option v-for="c in llmConfigs" :key="c.id" :value="c.id">
                  {{ c.provider }} / {{ c.modelNames.length }} models{{ c.baseUrl ? ` (${c.baseUrl})` : '' }}
                </option>
              </select>
              <select v-model="selectedLlmModel" class="llm-select" :disabled="!availableModels.length">
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
              placeholder="Type your message and press Ctrl/⌘ + Enter to send…"
              rows="3"
              @keydown="onComposerKeydown"
              :disabled="sending"
            ></textarea>
            <button class="btn-primary" type="submit" :disabled="sending || !input.trim()">
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
            @click="selectedFile = f"
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

        <div class="modal-actions">
          <button @click="showNewModal = false" class="btn-secondary">Cancel</button>
          <button @click="createSession" class="btn-primary" :disabled="creatingSession || llmConfigs.length === 0">
            {{ creatingSession ? 'Creating…' : selectedFile ? `Analyze "${selectedFile.name}"` : 'Start Empty' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue'
import { agentApi, fileApi, llmConfigApi } from '@/services/api'
import type { AgentSession, AgentMessage } from '@/types'
import type { FileSearchResult, StoredKeyEntry } from '@/services/api'

const sessions = ref<AgentSession[]>([])
const messages = ref<AgentMessage[]>([])
const activeSessionId = ref<string | null>(null)

const loadingSessions = ref(false)
const loadingMessages = ref(false)
const creatingSession = ref(false)
const sending = ref(false)
const errorMsg = ref('')
const input = ref('')
const tokenUsage = ref<{ input: number; output: number } | null>(null)

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
  if (sessions.value.length > 0 && llmConfigs.value.length > 0) {
    selectedLlmConfig.value = llmConfigs.value[0].id
    onLlmConfigChange()
    await selectSession(sessions.value[0].sessionId)
  }
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
  selectedFile.value = null
}

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
  if (llmConfigs.value.length === 0) return
  creatingSession.value = true
  errorMsg.value = ''
  try {
    const payload: any = {
      modelName: selectedLlmModel.value || undefined
    }
    if (selectedFile.value) {
      payload.binaryId = selectedFile.value.id
      payload.sessionName = `Analysis of ${selectedFile.value.name}`
    }
    const { data } = await agentApi.createSession(payload)
    sessions.value.unshift(data)
    showNewModal.value = false
    tokenUsage.value = null
    await selectSession(data.sessionId)
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Failed to create session.'
  } finally {
    creatingSession.value = false
  }
}

async function selectSession(id: string) {
  activeSessionId.value = id
  errorMsg.value = ''
  messages.value = []
  tokenUsage.value = null
  loadingMessages.value = true
  try {
    const { data } = await agentApi.getMessages(id)
    messages.value = data.messages || []
    await scrollToBottom()
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
    const { data: msgData } = await agentApi.getMessages(activeSessionId.value)
    messages.value = msgData.messages || []
    await scrollToBottom()
  } catch (e: any) {
    messages.value = messages.value.filter((m) => m.messageId !== tempUser.messageId)
    errorMsg.value = e?.response?.data?.error || e?.message || 'Chat failed.'
    input.value = content
  } finally {
    sending.value = false
  }
}

function onComposerKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    sendMessage()
  }
}

async function scrollToBottom() {
  await nextTick()
  const el = messagesEl.value
  if (el) el.scrollTop = el.scrollHeight
}

function formatDate(date: string | null | undefined) {
  if (!date) return ''
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

function roleLabel(m: AgentMessage): string {
  if (m.role === 'assistant') return 'Akiba'
  if (m.role === 'user') return 'You'
  if (m.role === 'tool') return 'Tool'
  return m.role
}

function toolSummary(m: AgentMessage): string {
  const name = `🛠 ${m.toolName || 'tool'}`
  // Extract args from: "**Observation (tool, args=JSON)**"
  const text = m.toolResult || m.content || ''
  const argsIdx = text.indexOf('args=')
  if (argsIdx >= 0) {
    const jsonStart = text.indexOf('{', argsIdx)
    if (jsonStart >= 0) {
      // Find matching closing brace by counting depth
      let depth = 0
      for (let i = jsonStart; i < text.length; i++) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') { depth--; if (depth === 0) {
          try {
            const args = JSON.parse(text.slice(jsonStart, i + 1))
            const short = JSON.stringify(args).slice(0, 60)
            return `${name} ${short}${short.length >= 60 ? '…' : ''}`
          } catch { break }
        }}
      }
    }
  }
  return name
}

function toolResult(m: AgentMessage): string {
  let text = m.toolResult || m.content || ''
  // Strip the "**Observation (anything)**: " prefix (handles nested parens in args)
  const obsEnd = text.indexOf(':** ')
  if (obsEnd >= 0) text = text.slice(obsEnd + 4)
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

.msg .role {
  font-size: 11px;
  color: #888;
  font-weight: 500;
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
  align-self: center;
  max-width: 90%;
}
.tool-call {
  background: #f5f5f7;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 0;
  font-size: 12px;
  width: 100%;
}
.tool-call details { padding: 0; }
.tool-call summary {
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  color: #555;
  font-weight: 500;
  user-select: none;
}
.tool-call summary:hover { background: #f0f0f0; border-radius: 8px; }
.tool-result {
  margin: 0;
  padding: 8px 12px 10px;
  background: #1a1a2e;
  color: #e0e0e0;
  font-size: 11px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  border-top: 1px solid #e8e8e8;
  border-radius: 0 0 8px 8px;
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
