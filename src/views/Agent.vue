<template>
  <div class="agent-page">
    <aside class="session-list">
      <div class="session-header">
        <h3>Sessions</h3>
        <button class="btn-primary small" @click="openNewSessionModal" :disabled="creatingSession">
          {{ creatingSession ? '…' : '+ New' }}
        </button>
      </div>
      <div class="session-hint muted small">
        Sub-agents are hidden. Open the tree from a session to drill into them.
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
            <span v-if="s.parentSessionId" class="subagent-badge" title="This is a sub-agent session (child of another session)">🧩 sub-agent</span>
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
        <div class="ctx-menu-item" @click="exportSession(ctxMenu.sessionId)">📥 Export this session</div>
        <div class="ctx-menu-item" @click="exportSessionTree(ctxMenu.sessionId)">🌳 Export full tree (this + sub-agents)</div>
      </div>
    </aside>

    <main class="chat">
      <div v-if="!activeSessionId" class="empty-state">
        <p>Select a session on the left, or create a new one to start chatting.</p>
      </div>
      <template v-else>
        <!-- Chat header with a "Tree" button for sub-agent visualisation -->
        <div class="chat-header">
          <div class="chat-title">
            <span class="chat-title-name">{{ activeSessionName }}</span>
            <span v-if="activeSessionMeta" class="chat-title-meta">
              {{ activeSessionMeta.moduleName || 'chat' }} · {{ activeSessionMeta.status }}
            </span>
            <span v-if="activeSessionMeta?.parentSessionId" class="chat-title-meta">
              ·
              <button
                class="btn-link"
                title="Jump to parent session"
                @click="selectSession(activeSessionMeta.parentSessionId!)"
              >↑ parent <code>{{ shortId(activeSessionMeta.parentSessionId) }}</code></button>
            </span>
          </div>
          <div class="chat-actions">
            <button
              class="btn-secondary small"
              :disabled="treeLoading"
              :title="liveChildCount > 0
                ? `${liveChildCount} sub-agent${liveChildCount === 1 ? '' : 's'} — click to view hierarchy`
                : 'No sub-agents detected yet (live-updating)'"
              @click="openTreeView"
            >
              🌳 Tree
              <span v-if="liveChildCount > 0" class="tree-badge">{{ liveChildCount }}</span>
            </button>
          </div>
        </div>

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
            <!-- Special rendering for sub-agent invocations -->
            <div
              v-if="m.role === 'tool' && isSubAgentTool(m.toolName)"
              :class="['subagent-call', subAgentStatus(m)]"
            >
              <div class="subagent-header">
                <span class="subagent-icon">🧩</span>
                <span class="subagent-name">{{ subAgentTitle(m) }}</span>
                <span :class="['subagent-stop', subAgentStopClass(m)]">
                  {{ subAgentStopReason(m) }}
                </span>
              </div>
              <div class="subagent-stats">
                <span class="subagent-stat" v-if="subAgentSummary(m)?.templateId">
                  template: <code>{{ subAgentSummary(m)?.templateId }}</code>
                </span>
                <span class="subagent-stat">iterations: {{ subAgentIterations(m) }}</span>
                <span class="subagent-stat">tool calls: {{ subAgentToolCalls(m) }}</span>
                <span class="subagent-stat">
                  tokens:
                  I:{{ (subAgentSummary(m)?.totalInputTokens ?? 0).toLocaleString() }}
                  O:{{ (subAgentSummary(m)?.totalOutputTokens ?? 0).toLocaleString() }}
                </span>
              </div>
              <details class="subagent-detail">
                <summary>Inputs & final output</summary>
                <div class="subagent-section">
                  <div class="subagent-label">Inputs</div>
                  <pre class="subagent-args">{{ subAgentArgs(m) }}</pre>
                </div>
                <div class="subagent-section">
                  <div class="subagent-label">Final output</div>
                  <pre class="subagent-output" v-html="renderedToolResult(m)"></pre>
                </div>
              </details>
              <div v-if="subAgentChildSessionId(m)" class="subagent-actions">
                <button class="btn-link" @click="openChildSession(subAgentChildSessionId(m)!)">
                  🔍 Open child session transcript
                </button>
                <span class="subagent-child-id">id={{ shortId(subAgentChildSessionId(m)) }}</span>
              </div>
            </div>
            <div v-else-if="m.role === 'tool'" :class="['tool-call', toolStatus(m)]">
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
          ⚠ Current session is in an automated task, you need to go to Workflows to abort it for manual intervention.
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

    <!-- Sub-agent tree view modal -->
    <div v-if="treeOpen" class="modal" @click.self="closeTreeView">
      <div class="modal-content tree-modal">
        <div class="tree-modal-header">
          <h2>Agent Tree</h2>
          <div class="tree-modal-actions">
            <span v-if="treePollInterval != null" class="tree-live-indicator" title="Polling every 2s for new sub-agents">
              <span class="tree-live-dot"></span> live
            </span>
            <!-- Zoom controls. The SVG is scaled via CSS so all interactions
                 (click, hover) continue to work without re-layout. -->
            <div class="tree-zoom-group" role="group" aria-label="Zoom">
              <button class="btn-secondary small tree-zoom-btn" @click="zoomOut" :disabled="treeZoom <= TREE_ZOOM_MIN" title="Zoom out">−</button>
              <button class="btn-secondary small tree-zoom-btn" @click="zoomReset" title="Reset zoom">{{ Math.round(treeZoom * 100) }}%</button>
              <button class="btn-secondary small tree-zoom-btn" @click="zoomIn" :disabled="treeZoom >= TREE_ZOOM_MAX" title="Zoom in">+</button>
              <button class="btn-secondary small" @click="zoomFit" title="Fit to view">Fit</button>
            </div>
            <button class="btn-secondary small" @click="exportTreeFromModal" :disabled="exportingTree" title="Download the full agent tree as Markdown">
              {{ exportingTree ? 'Exporting…' : '📥 Export tree' }}
            </button>
            <button class="btn-secondary small" @click="closeTreeView">Close</button>
          </div>
        </div>
        <p class="subtitle">
          Parent/child relationships for the current session.
          <span v-if="treeRoot">Root: <code>{{ shortId(treeRoot.sessionId) }}</code> · {{ treeRoot.sessionName }}</span>
        </p>
        <div v-if="treeLoading" class="muted small">Loading tree…</div>
        <div v-else-if="!treeRoot" class="muted small">No root session.</div>
        <div v-else class="tree-container" ref="treeContainer">
          <div
            class="tree-svg-wrap"
            :style="{ transform: treeTransform, transformOrigin: '0 0' }"
          >
            <svg
              v-if="treeLayout.nodes.length > 0"
              :width="treeLayout.width"
              :height="treeLayout.height"
              class="tree-svg"
            >
              <!-- Edges first so they sit under the nodes -->
              <g class="tree-edges">
                <path
                  v-for="edge in treeLayout.edges"
                  :key="edge.key"
                  :d="edge.path"
                  class="tree-edge"
                  :class="{ 'tree-edge-active': edge.to === activeSessionId }"
                />
              </g>
              <!-- Nodes -->
              <g
                v-for="node in treeLayout.nodes"
                :key="node.sessionId"
                :transform="`translate(${node.x},${node.y})`"
                class="tree-node"
                :class="{
                  'tree-node-active': node.sessionId === activeSessionId,
                  'tree-node-new': newlyAddedNodeIds.has(node.sessionId),
                  'tree-node-running': !isTerminalStatus(node.status)
                }"
                @click="selectSession(node.sessionId)"
                @dblclick="openChildSession(node.sessionId)"
              >
                <rect
                  :x="-nodeWidth / 2"
                  :y="-nodeHeight / 2"
                  :width="nodeWidth"
                  :height="nodeHeight"
                  rx="6"
                  ry="6"
                  class="tree-node-rect"
                  :class="{
                    'tree-node-rect-active': node.sessionId === activeSessionId,
                    'tree-node-rect-subagent': node.depth > 0,
                    'tree-node-rect-running': !isTerminalStatus(node.status)
                  }"
                />
                <text :y="-8" class="tree-node-name" text-anchor="middle">
                  {{ truncate(node.sessionName || 'Untitled', 22) }}
                </text>
                <text :y="6" class="tree-node-meta" text-anchor="middle">
                  {{ node.status }} · d={{ node.depth }}
                </text>
                <text :y="20" class="tree-node-id" text-anchor="middle">
                  {{ shortId(node.sessionId) }}
                </text>
                <!-- Depth-direction hint: arrow on the left edge so the user
                     knows which side the parent is on in this horizontal
                     layout. -->
                <text :x="-nodeWidth / 2 - 6" :y="4" class="tree-node-arrow" text-anchor="end">◀</text>
              </g>
              <!-- "+N more" pills on collapsed parents so the user can
                   expand them on demand. Placed just to the right of the
                   parent's node. -->
              <g
                v-for="marker in treeLayout.collapseMarkers"
                :key="`collapse-${marker.parentId}`"
                :transform="`translate(${marker.x},${marker.y})`"
                class="tree-collapse-marker"
                @click.stop="toggleCollapse(marker.parentId)"
              >
                <rect
                  :x="-marker.width / 2"
                  :y="-marker.height / 2"
                  :width="marker.width"
                  :height="marker.height"
                  rx="18"
                  ry="18"
                  class="tree-collapse-rect"
                />
                <text class="tree-collapse-text" text-anchor="middle" dominant-baseline="middle">
                  +{{ marker.hiddenCount }} more
                </text>
              </g>
            </svg>
            <div v-else class="muted small">
              No sub-agents. Spawn one by calling <code>spawn_sub_agent</code> from the LLM.
            </div>
          </div>
        </div>
        <p class="muted small tree-legend">
          The tree grows <strong>left to right</strong>: the root is at the left and each
          column represents one more level of depth. Click a node to load its transcript.
          Pill-shaped <em>+N more</em> markers collapse wide sibling groups so a
          single column never overflows the viewport — click one to expand it.
          The currently open session is highlighted in pink.
          New nodes flash green briefly when they appear.
        </p>
      </div>
    </div>

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
import type { AgentSession, AgentMessage, SubAgentSummary } from '@/types'
import type { FileSearchResult, StoredKeyEntry } from '@/services/api'
import { renderMarkdown, fixLiteralNewlines } from '@/utils/format'

const sessions = ref<AgentSession[]>([])
const messages = ref<AgentMessage[]>([])
const activeSessionId = ref<string | null>(null)

const loadingSessions = ref(false)
const loadingMessages = ref(false)
const creatingSession = ref(false)
const sending = ref(false)
const exportingTree = ref(false)
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

// Whether the active session is an automated (non-chat) agent session.
// The status column mirrors runtime_state under the new enum
// (`running` | `standby` | `msghandle` | `cancelling` | `closed` |
// `error`); "non-terminal" is the right predicate here because it
// covers running, parked (standby), mid-mailbox-handle, and
// mid-cancel states — all of which are automated and uninteractable.
const isAutomatedSession = computed(() => {
  const s = sessions.value.find(s => s.sessionId === activeSessionId.value)
  return !!s?.moduleName && s.moduleName !== 'chat' && !isTerminalStatus(s?.status)
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

/**
 * Build a sanitised filename stem for a downloaded Markdown export.
 *
 * The session name may contain arbitrary user text; we keep only
 * letters, digits, dot, underscore, hyphen and clamp the length so the
 * resulting filename is safe across operating systems and shells.
 */
function exportFileStem(sessionId: string, sessionName?: string | null): string {
  const base = (sessionName || '').trim()
  const safe = base
    ? base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    : sessionId.slice(0, 8)
  return safe || sessionId.slice(0, 8)
}

/** Trigger a browser download for a Blob returned by the export endpoint. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revocation so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function exportSession(sessionId: string) {
  ctxMenu.show = false
  try {
    const resp = await agentApi.exportSession(sessionId, 'self')
    const stem = exportFileStem(sessionId)
    downloadBlob(new Blob([resp.data], { type: 'text/markdown' }), `session_${stem}.md`)
  } catch (_e: any) {
    errorMsg.value = 'Failed to export session.'
  }
}

/**
 * Export the full agent tree rooted at [sessionId] as Markdown.
 *
 * Walks the same parent → child graph the frontend already renders and
 * asks the backend for a single Markdown document that contains:
 *   - a header with overall export metadata
 *   - an "Agent Tree" section with per-layer statistics and an ASCII
 *     tree diagram
 *   - one peer section per agent (in DFS pre-order) with its own stats
 *     and its full transcript
 *
 * Used both by the right-click context menu on the session list and by
 * the dedicated "📥 Export tree" button inside the tree modal.
 */
async function exportSessionTree(sessionId: string) {
  ctxMenu.show = false
  if (!sessionId) return
  exportingTree.value = true
  try {
    const resp = await agentApi.exportSession(sessionId, 'tree')
    const stem = exportFileStem(sessionId)
    downloadBlob(new Blob([resp.data], { type: 'text/markdown' }), `agent_tree_${stem}.md`)
  } catch (_e: any) {
    errorMsg.value = 'Failed to export agent tree.'
  } finally {
    exportingTree.value = false
  }
}

/** Convenience wrapper used by the tree modal's "Export tree" button. */
function exportTreeFromModal() {
  if (treeRoot.value) exportSessionTree(treeRoot.value.sessionId)
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

  // Set model name from session info. If the session isn't in the list
  // (e.g. a sub-agent opened from the tree), fall back to the messages
  // endpoint which gives us the session implicitly via 404 if missing.
  let session = sessions.value.find(s => s.sessionId === id)
  if (!session) {
    // Try a "ALL" listing just for this id. If even that doesn't find it
    // (e.g. the user has lots of sessions and it fell off the page), we
    // still allow opening it: model name will simply be unknown.
    try {
      const { data } = await agentApi.listSessions(200, 0, 'ALL')
      session = (data.sessions || []).find(s => s.sessionId === id)
      if (session) {
        // Add it transiently so the rest of the UI (status pill, model
        // badge, "active" highlight) keeps working without polluting the
        // main top-level list.
        sessions.value.unshift(session)
      }
    } catch { /* ignore */ }
  }
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

// ============================================================
// Sub-agent tool-call rendering
// ============================================================

/** Names of tools that spawn a child agent — used to detect
 *  sub-agent invocations in the message stream. Exposed both as a
 *  Set (for use from the template via `SUB_AGENT_TOOLS.has(...)`) and
 *  as a small helper (referenced from script so vue-tsc doesn't flag it
 *  under `noUnusedLocals`). */
const SUB_AGENT_TOOLS = new Set(['spawn_sub_agent'])

function isSubAgentTool(name?: string): boolean {
  return !!name && SUB_AGENT_TOOLS.has(name)
}

/** Script-local reference to silence vue-tsc's `noUnusedLocals` check
 *  when the function is only consumed from the template. */
void isSubAgentTool

/** Strip the "**Observation (...):** " prefix from a tool result text. */
function stripObservationPrefix(text: string): string {
  const idx = text.indexOf(':** ')
  return idx >= 0 ? text.slice(idx + 4) : text
}

/** Parse a tool result into a SubAgentSummary if it looks like one. */
function parseSubAgentSummary(m: AgentMessage): SubAgentSummary | null {
  const text = stripObservationPrefix(m.toolResult || m.content || '').trim()
  if (!text.startsWith('{')) return null
  try {
    const obj = JSON.parse(text)
    if (obj && typeof obj === 'object' &&
        typeof obj.output === 'string' &&
        typeof obj.iterations === 'number' &&
        typeof obj.toolCalls === 'number' &&
        typeof obj.sessionId === 'string') {
      return obj as SubAgentSummary
    }
  } catch { /* not valid JSON */ }
  return null
}

function subAgentSummary(m: AgentMessage): SubAgentSummary | null {
  return parseSubAgentSummary(m)
}

function subAgentTitle(m: AgentMessage): string {
  const sum = parseSubAgentSummary(m)
  if (sum?.templateId) return `Sub-agent · ${sum.templateId}`
  return `Sub-agent${sum?.name ? ` · ${sum.name}` : ''}`
}

function subAgentIterations(m: AgentMessage): number {
  return parseSubAgentSummary(m)?.iterations ?? 0
}

function subAgentToolCalls(m: AgentMessage): number {
  return parseSubAgentSummary(m)?.toolCalls ?? 0
}

function subAgentStopReason(m: AgentMessage): string {
  const sum = parseSubAgentSummary(m)
  return sum?.stopReason || 'unknown'
}

function subAgentStopClass(m: AgentMessage): string {
  const r = subAgentStopReason(m).toUpperCase()
  if (r === 'COMPLETED') return 'subagent-stop-ok'
  if (r === 'MAX_ITERATIONS' || r === 'ERROR') return 'subagent-stop-warn'
  return 'subagent-stop-other'
}

function subAgentStatus(m: AgentMessage): string {
  const r = subAgentStopReason(m).toUpperCase()
  if (r === 'COMPLETED') return 'status-success'
  if (r === 'ERROR') return 'status-error'
  return 'status-default'
}

function subAgentArgs(m: AgentMessage): string {
  // The tool-call arguments are not stored on AgentMessage in this codebase;
  // they only show up in toolResult content. So we just show inputs from
  // the parsed summary JSON (if any).
  const sum = parseSubAgentSummary(m)
  if (!sum) return '(no inputs)'
  const { output, iterations, toolCalls, stopReason, totalInputTokens, totalOutputTokens, sessionId, parentSessionId, ...inputs } = sum as any
  return JSON.stringify(inputs, null, 2)
}

function subAgentChildSessionId(m: AgentMessage): string | null {
  return parseSubAgentSummary(m)?.sessionId ?? null
}

function shortId(id?: string | null): string {
  if (!id) return ''
  return id.length > 8 ? id.slice(0, 8) : id
}

// ============================================================
// Tree view (sub-agent hierarchy) — LIVE updating
// ============================================================
//
// The hierarchy is *not* a static diagram: while the user is viewing
// the tree the parent (and even sub-sub-agents) may still be running
// and spawning more children. We therefore:
//
//   1. Re-fetch children of every known node on a short interval while
//      the modal is open, and add any newly-discovered nodes/edges to
//      the layout.
//   2. Refresh the status / name of existing nodes so completed/error
//      states show up without a manual reload.
//   3. Pulse newly-added nodes briefly so the user notices them.
//   4. Stop polling once the parent reaches a terminal state, the modal
//      closes, or the component unmounts.
//   5. Show a live "child count" badge on the tree button even when
//      the modal is closed (refreshed at the same cadence).
// ============================================================

const treeOpen = ref(false)
const treeLoading = ref(false)
const treeRoot = ref<AgentSession | null>(null)
/** Flat list of nodes in DFS pre-order for layout. */
const treeNodes = ref<TreeNode[]>([])
const treeEdges = ref<TreeEdgeStored[]>([])
const treeContainer = ref<HTMLElement | null>(null)
/** Session IDs that arrived during the most recent refresh — used for
 *  the brief "new" pulse animation. Cleared automatically. */
const newlyAddedNodeIds = ref<Set<string>>(new Set())

interface TreeNode {
  sessionId: string
  sessionName: string | null
  status: string
  depth: number
}
/** Storage shape: what we persist across refreshes. */
interface TreeEdgeStored {
  key: string
  from: string
  to: string
}
/** Rendered shape: what the layout emits, augmented with a Bezier path. */
interface TreeEdgeRendered extends TreeEdgeStored {
  path: string
}

/**
 * Layout & overflow policy
 * ------------------------
 *
 * The tree is rendered **horizontally**: the root sits in the leftmost
 * column and each additional column represents one more level of depth.
 * Sub-agents therefore appear further to the right, not further down.
 *
 * To keep a single column from becoming absurdly wide when one agent
 * spawns many siblings (a common pattern — e.g. `spawn_sub_agent`
 * in a loop), we collapse any parent with more than
 * [MAX_VISIBLE_CHILDREN] children down to a small "+N more" pill that
 * the user can expand on demand. The set of currently-collapsed parents
 * lives in [collapsedParents] and survives modal reopen + tree polls.
 *
 * Note that "collapsing" hides *all* children of a parent from the
 * layout (we don't try to keep a partial first-N visible); this keeps
 * the visual contract simple and makes even pathological cases
 * (hundreds of children) collapse to a single pill. The data is still
 * tracked in [treeNodes]/[treeEdges] so the export endpoint and stats
 * see the full tree.
 */
const MAX_VISIBLE_CHILDREN = 6

/** Session IDs of parents whose children should be hidden in the layout.
 *  Used to collapse wide sibling groups so a single column doesn't stretch
 *  across the whole viewport. */
const collapsedParents = ref<Set<string>>(new Set())

function toggleCollapse(parentId: string) {
  const next = new Set(collapsedParents.value)
  if (next.has(parentId)) next.delete(parentId)
  else next.add(parentId)
  collapsedParents.value = next
}

// ---- Zoom & pan -----------------------------------------------------------
//
// The tree can grow very wide (left-to-right), so we offer basic zoom
// controls: a scale factor that scales the SVG and a "Fit" button that
// scales the SVG to fit the visible container.
const treeZoom = ref(1)
const TREE_ZOOM_MIN = 0.25
const TREE_ZOOM_MAX = 2
const TREE_ZOOM_STEP = 0.15

function zoomIn()  { treeZoom.value = Math.min(TREE_ZOOM_MAX, +(treeZoom.value + TREE_ZOOM_STEP).toFixed(2)) }
function zoomOut() { treeZoom.value = Math.max(TREE_ZOOM_MIN, +(treeZoom.value - TREE_ZOOM_STEP).toFixed(2)) }
function zoomReset() { treeZoom.value = 1; resetPan() }
function zoomFit() {
  const container = treeContainer.value
  if (!container) return
  const naturalW = treeLayout.value.width || 1
  const naturalH = treeLayout.value.height || 1
  const availW = Math.max(50, container.clientWidth - 32)
  const availH = Math.max(50, container.clientHeight - 32)
  const ratio = Math.min(availW / naturalW, availH / naturalH, 1)
  treeZoom.value = Math.max(TREE_ZOOM_MIN, Math.min(TREE_ZOOM_MAX, +ratio.toFixed(2)))
  resetPan()
}

// Manual pan state — applied via CSS transform on the SVG.
const panX = ref(0)
const panY = ref(0)
function resetPan() { panX.value = 0; panY.value = 0 }

/** Compose zoom + pan into a single CSS transform string. */
const treeTransform = computed(
  () => `translate(${panX.value}px, ${panY.value}px) scale(${treeZoom.value})`
)

const nodeWidth = 160
const nodeHeight = 56
const levelGapX = 90      // horizontal gap between depth columns
const siblingGapY = 24    // vertical gap between siblings within a column
const collapsePillW = 70
const collapsePillH = 36

const treeLayout = computed<{
  nodes: Array<TreeNode & { x: number; y: number }>
  edges: TreeEdgeRendered[]
  collapseMarkers: Array<{ parentId: string; x: number; y: number; hiddenCount: number; width: number; height: number }>
  width: number
  height: number
}>(() => {
  if (treeNodes.value.length === 0) {
    return { nodes: [], edges: [], collapseMarkers: [], width: 0, height: 0 }
  }

  // Lay out horizontally: x is the depth column, y is the vertical slot.
  // Each subtree gets a contiguous vertical band and is centered within it.
  const nodeIndex: Record<string, number> = {}
  treeNodes.value.forEach((n, i) => { nodeIndex[n.sessionId] = i })

  // Build parent → children adjacency, but skip children of collapsed
  // parents so they don't take up vertical space until the user expands
  // the group. The hidden siblings still exist in `treeNodes` for the
  // stats endpoints, but they are excluded from the layout.
  const childrenMap: Record<string, string[]> = {}
  for (const e of treeEdges.value) {
    if (collapsedParents.value.has(e.from)) continue
    (childrenMap[e.from] ||= []).push(e.to)
  }

  const x: number[] = new Array(treeNodes.value.length).fill(0)
  const y: number[] = new Array(treeNodes.value.length).fill(0)

  // For collapsed parents, reserve one slot for the "+N more" pill at the
  // parent's depth. We pass `visibleChildCount` so the layout knows how
  // tall to make the parent's column.
  function subtreeHeight(rootId: string): number {
    if (collapsedParents.value.has(rootId)) {
      // Collapsed parent: only itself is visible (plus its pill, which we
      // size like a regular node). Skip descending.
      return 1
    }
    const kids = childrenMap[rootId] || []
    if (kids.length === 0) return 1
    let total = 0
    for (const kidId of kids) total += subtreeHeight(kidId)
    return Math.max(total, 1)
  }

  function layoutSubtree(rootId: string, depth: number, topSlot: number): number {
    const rootIdx = nodeIndex[rootId]
    if (rootIdx === undefined) return 0
    const kids = childrenMap[rootId] || []
    const ownHeight = 1

    if (kids.length === 0) {
      x[rootIdx] = depth
      y[rootIdx] = topSlot
      return ownHeight
    }

    // First, recursively place children top-down starting from topSlot.
    let cursor = topSlot
    const childSlots: Array<{ idx: number; center: number; height: number }> = []
    for (const kidId of kids) {
      const kidIdx = nodeIndex[kidId]
      if (kidIdx === undefined) continue
      const h = subtreeHeight(kidId)
      layoutSubtree(kidId, depth + 1, cursor)
      const kidCenter = cursor + h / 2
      childSlots.push({ idx: kidIdx, center: kidCenter, height: h })
      cursor += h
    }
    const totalHeight = Math.max(ownHeight, cursor - topSlot)

    // Place the root at the vertical midpoint of its children, clamped so
    // it always stays inside the band [topSlot, topSlot + totalHeight].
    const firstCenter = childSlots.length > 0 ? childSlots[0].center : topSlot
    const lastCenter = childSlots.length > 0 ? childSlots[childSlots.length - 1].center : topSlot
    const mid = (firstCenter + lastCenter) / 2
    y[rootIdx] = Math.max(topSlot, Math.min(topSlot + totalHeight - ownHeight, mid))
    x[rootIdx] = depth
    return totalHeight
  }

  if (treeRoot.value) {
    layoutSubtree(treeRoot.value.sessionId, 0, 0)
  }

  // Convert slot units to pixels.
  const pxPerDepth = nodeWidth + levelGapX
  const pxPerSibling = nodeHeight + siblingGapY
  const padding = 32
  const maxDepth = Math.max(...x)
  const maxRow = Math.max(...y)

  const positioned = treeNodes.value.map((n, i) => ({
    ...n,
    x: x[i] * pxPerDepth + padding + nodeWidth / 2,
    y: y[i] * pxPerSibling + padding + nodeHeight / 2
  }))

  // Cubic Bezier edges from parent's right edge → child's left edge.
  const positionedMap: Record<string, { x: number; y: number }> = {}
  for (const n of positioned) positionedMap[n.sessionId] = { x: n.x, y: n.y }
  const edges = treeEdges.value
    .filter(e => !collapsedParents.value.has(e.from))
    .map(e => {
      const p = positionedMap[e.from]
      const c = positionedMap[e.to]
      if (!p || !c) return null
      const midX = (p.x + c.x) / 2
      const path = `M ${p.x + nodeWidth / 2},${p.y} C ${midX},${p.y} ${midX},${c.y} ${c.x - nodeWidth / 2},${c.y}`
      return { key: e.key, from: e.from, to: e.to, path }
    })
    .filter((e): e is TreeEdgeRendered => e !== null)

  // Render a "+N more" pill on every collapsed parent so the user can
  // expand it. The pill sits next to (right of) the parent's node at the
  // same depth.
  const collapseMarkers: Array<{
    parentId: string
    x: number
    y: number
    hiddenCount: number
    width: number
    height: number
  }> = []
  for (const parentId of Object.keys(childrenMap)) {
    if (!collapsedParents.value.has(parentId)) continue
    const idx = nodeIndex[parentId]
    if (idx === undefined) continue
    const totalChildren = treeEdges.value.filter(e => e.from === parentId).length
    const hidden = Math.max(0, totalChildren - MAX_VISIBLE_CHILDREN)
    if (hidden <= 0) continue
    collapseMarkers.push({
      parentId,
      x: positioned[idx].x + nodeWidth / 2 + 16 + collapsePillW / 2,
      y: positioned[idx].y,
      hiddenCount: hidden,
      width: collapsePillW,
      height: collapsePillH
    })
  }

  const width = (maxDepth + 1) * pxPerDepth + padding * 2 + collapsePillW
  const height = (maxRow + 1) * pxPerSibling + padding * 2

  return { nodes: positioned, edges, collapseMarkers, width, height }
})

const treeChildCount = computed(() => treeNodes.value.filter(n => n.depth > 0).length)
/** Reference so vue-tsc doesn't flag `treeChildCount` as unused under
 *  `noUnusedLocals` (it's only consumed from the template for debug). */
void treeChildCount

/** Live count of direct children for the *currently active* session,
 *  refreshed independently of the modal. Used by the "🌳 Tree" button
 *  label so the user knows the hierarchy has content before opening. */
const liveChildCount = ref(0)
let childCountInterval: number | null = null

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

/**
 * Incremental, idempotent tree refresh.
 *
 * For each visited node, this either inserts a new entry into
 * [treeNodes] (and emits the corresponding edges for its newly-discovered
 * children) or updates the status / name of an existing entry.
 *
 * Already-visited nodes are skipped via [seen], so cycles are handled
 * safely.
 *
 * @return the IDs of *newly* inserted nodes (for animation).
 */
async function refreshSubtree(
  rootId: string,
  depth = 0,
  seen = new Set<string>()
): Promise<string[]> {
  if (seen.has(rootId)) return []
  seen.add(rootId)

  const sessionInfo = sessions.value.find(s => s.sessionId === rootId)
    ?? await fetchSessionInfo(rootId)
  if (!sessionInfo) return []

  const newIds: string[] = []
  const existingIdx = treeNodes.value.findIndex(n => n.sessionId === rootId)
  if (existingIdx >= 0) {
    const existing = treeNodes.value[existingIdx]
    if (existing.status !== sessionInfo.status ||
        existing.sessionName !== sessionInfo.sessionName ||
        existing.depth !== depth) {
      treeNodes.value[existingIdx] = {
        ...existing,
        sessionName: sessionInfo.sessionName,
        status: sessionInfo.status,
        depth
      }
    }
  } else {
    treeNodes.value.push({
      sessionId: sessionInfo.sessionId,
      sessionName: sessionInfo.sessionName,
      status: sessionInfo.status,
      depth
    })
    newIds.push(sessionInfo.sessionId)
  }

  // Always (re-)fetch children so we detect newly-spawned sub-agents.
  let children: AgentSession[] = []
  try {
    const { data } = await agentApi.listChildren(rootId)
    children = data.children || []
  } catch (e) {
    console.warn(`Tree refresh: failed to list children of ${shortId(rootId)}:`, e)
    return newIds
  }

  // Build a set of edges we already have under this parent so we don't
  // re-push duplicates across ticks.
  const existingChildrenOfRoot = new Set(
    treeEdges.value.filter(e => e.from === rootId).map(e => e.to)
  )

  for (const child of children) {
    if (!existingChildrenOfRoot.has(child.sessionId)) {
      treeEdges.value.push({
        key: `${rootId}->${child.sessionId}`,
        from: rootId,
        to: child.sessionId
      })
    }
    const childNew = await refreshSubtree(child.sessionId, depth + 1, seen)
    newIds.push(...childNew)
  }

  return newIds
}

async function fetchSessionInfo(id: string): Promise<AgentSession | null> {
  // We don't know this node's parent (if any). Fall back to a global
  // list which is capped at 200 entries — covers the vast majority of
  // debugging cases.
  try {
    const { data } = await agentApi.listSessions(200, 0, 'ALL')
    return (data.sessions || []).find(s => s.sessionId === id) || null
  } catch {
    return null
  }
}

// ---- Polling -------------------------------------------------------------

/** Whether polling is currently active for the open tree modal. */
let treePollInterval: number | null = null
const TREE_POLL_INTERVAL_MS = 2000

function isTerminalStatus(s: string | null | undefined): boolean {
  // `closed` (run completed, cancelled, etc.) and `error` are the
  // only terminal states under the unified enum. Legacy strings
  // (completed / cancelled / failed) are accepted for tolerance
  // during the migration window and treated as their new
  // equivalents.
  if (s == null) return false
  return s === 'closed' || s === 'error' ||
      s === 'completed' || s === 'cancelled' || s === 'failed'
}

function stopTreePolling() {
  if (treePollInterval != null) {
    clearInterval(treePollInterval)
    treePollInterval = null
  }
}

async function tickTree(): Promise<void> {
  if (!treeRoot.value) return
  // Stop polling if the root reached a terminal state — nothing more
  // can be added below it. (Children may still mutate but that's rare
  // in practice; the user can reopen to refresh.)
  if (isTerminalStatus(treeRoot.value.status)) {
    stopTreePolling()
    return
  }
  try {
    const beforeIds = new Set(treeNodes.value.map(n => n.sessionId))
    const newIds = await refreshSubtree(treeRoot.value.sessionId)
    if (newIds.length > 0) {
      // Pulse the new nodes briefly
      const next = new Set(newlyAddedNodeIds.value)
      for (const id of newIds) {
        if (!beforeIds.has(id)) next.add(id)
      }
      newlyAddedNodeIds.value = next
      window.setTimeout(() => {
        const cur = new Set(newlyAddedNodeIds.value)
        let changed = false
        for (const id of newIds) {
          if (cur.delete(id)) changed = true
        }
        if (changed) newlyAddedNodeIds.value = cur
      }, 2400)
    }
  } catch (e) {
    console.warn('Tree refresh tick failed:', e)
  }
}

function startTreePolling() {
  stopTreePolling()
  treePollInterval = window.setInterval(tickTree, TREE_POLL_INTERVAL_MS)
}

// ---- Live child-count badge (works even with the modal closed) -----------

async function refreshLiveChildCount(): Promise<void> {
  if (!activeSessionId.value) {
    liveChildCount.value = 0
    return
  }
  try {
    const { data } = await agentApi.listChildren(activeSessionId.value)
    liveChildCount.value = data.children?.length ?? 0
  } catch {
    /* ignore */
  }
}

function startChildCountPolling() {
  if (childCountInterval != null) clearInterval(childCountInterval)
  childCountInterval = window.setInterval(refreshLiveChildCount, 3000)
}

function stopChildCountPolling() {
  if (childCountInterval != null) {
    clearInterval(childCountInterval)
    childCountInterval = null
  }
}

// ---- Modal open/close ----------------------------------------------------

async function openTreeView() {
  if (!activeSessionId.value) return
  treeOpen.value = true
  treeLoading.value = true
  treeNodes.value = []
  treeEdges.value = []
  newlyAddedNodeIds.value = new Set()
  treeRoot.value = sessions.value.find(s => s.sessionId === activeSessionId.value) || null
  try {
    await refreshSubtree(activeSessionId.value)
    startTreePolling()
  } catch (e) {
    console.error('Failed to load sub-agent tree:', e)
  } finally {
    treeLoading.value = false
    await nextTick()
  }
}

function closeTreeView() {
  treeOpen.value = false
  stopTreePolling()
}

async function openChildSession(sessionId: string) {
  // Switch active session without leaving the tree; reuse selectSession.
  treeOpen.value = false
  stopTreePolling()
  await selectSession(sessionId)
}

// ============================================================
// Active-session derived UI state
// ============================================================

const activeSessionMeta = computed<AgentSession | undefined>(() =>
  sessions.value.find(s => s.sessionId === activeSessionId.value)
)

const activeSessionName = computed(() => {
  const meta = activeSessionMeta.value
  if (!meta) return ''
  return meta.sessionName || 'Untitled'
})

// Refresh the child count + start polling whenever the user switches
// sessions. Always refresh once immediately so the badge is accurate.
watch(activeSessionId, async (id) => {
  if (!id) {
    liveChildCount.value = 0
    stopChildCountPolling()
    return
  }
  await refreshLiveChildCount()
  startChildCountPolling()
}, { immediate: false })

// Stop polling if the component unmounts (route change).
onUnmounted(() => {
  stopTreePolling()
  stopChildCountPolling()
  if (messagePollInterval) { clearInterval(messagePollInterval); messagePollInterval = null }
})
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
.subagent-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 500;
  background: #ede7f6;
  color: #5e35b1;
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
/* The `status` field mirrors the runtime_state enum. Non-terminal
   states share the "in-progress" pill. Terminal states fall through
   to neutral / failure colours. Legacy strings still in flight from
   the migration keep their old colours. */
.status.running,
.status.standby,
.status.msghandle,
.status.cancelling,
.status.active { background: #e3f2fd; color: #1976d2; }
.status.closed,
.status.completed { background: #e8f5e9; color: #388e3c; }
.status.cancelled { background: #f5f5f5; color: #777; }
.status.error,
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

/* ---- Session list hint --------------------------------------------------- */
.session-hint {
  margin-bottom: 8px;
  padding: 6px 8px;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.4;
}

/* ---- Chat header / tree button ------------------------------------------ */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  border-bottom: 1px solid #eee;
  background: #fafafa;
}
.chat-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.chat-title-name {
  font-size: 15px;
  font-weight: 600;
  color: #222;
  max-width: 380px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-title-meta {
  font-size: 11px;
  color: #888;
}
.chat-actions { display: flex; gap: 8px; }

/* ---- Sub-agent tool-call rendering -------------------------------------- */
.subagent-call {
  align-self: flex-start;
  max-width: 90%;
  width: 100%;
  border: 1px solid #bbdefb;
  background: #f3f9ff;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  color: #1a237e;
  box-shadow: 0 1px 3px rgba(33, 150, 243, 0.08);
}
.subagent-call.status-success { border-color: #a5d6a7; background: #f1f8e9; color: #2e7d32; }
.subagent-call.status-error   { border-color: #ef9a9a; background: #fff5f5; color: #c62828; }
.subagent-call.status-default { border-color: #bbdefb; background: #f3f9ff; color: #1a237e; }

.subagent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.subagent-icon { font-size: 16px; }
.subagent-name { font-weight: 600; font-size: 13px; flex: 1; }
.subagent-stop {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}
.subagent-stop-ok    { background: #c8e6c9; color: #2e7d32; }
.subagent-stop-warn  { background: #ffe0b2; color: #e65100; }
.subagent-stop-other { background: #e0e0e0; color: #555; }

.subagent-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  font-size: 11px;
  color: #455a64;
  margin-bottom: 6px;
}
.subagent-stat code {
  background: #e1f5fe;
  padding: 0 4px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
}

.subagent-detail {
  margin-top: 4px;
  border-top: 1px dashed rgba(33, 150, 243, 0.3);
  padding-top: 6px;
}
.subagent-detail summary {
  cursor: pointer;
  font-size: 11px;
  color: #1976d2;
  user-select: none;
}
.subagent-section { margin-top: 6px; }
.subagent-label {
  font-size: 10px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.subagent-args, .subagent-output {
  margin: 0;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  background: #1a1a2e;
  color: #e0e0e0;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
}

.subagent-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed rgba(33, 150, 243, 0.3);
}
.btn-link {
  background: transparent;
  border: none;
  color: #1976d2;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  font-family: inherit;
}
.btn-link:hover { text-decoration: underline; }
.subagent-child-id {
  font-family: 'Courier New', monospace;
  font-size: 10px;
  color: #888;
}

/* ---- Tree modal --------------------------------------------------------- */
.tree-modal {
  width: min(1100px, 95vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.tree-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.tree-modal-header h2 { margin: 0; font-size: 20px; }
.tree-modal-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }

/* Zoom control cluster. Buttons stay tightly grouped but separate from
   the export / close actions on the right edge. */
.tree-zoom-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  background: #f5f5f5;
  border-radius: 6px;
}
.tree-zoom-btn { padding: 4px 10px !important; font-size: 13px !important; min-width: 32px; }
.tree-zoom-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.tree-live-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #388e3c;
  background: #e8f5e9;
  padding: 3px 8px;
  border-radius: 12px;
  font-weight: 500;
}
.tree-live-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #43a047;
  animation: treeLivePulse 1.5s infinite;
}
@keyframes treeLivePulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

/* The tree grows horizontally so the container scrolls on both axes by
   default. The inner `.tree-svg-wrap` is what we actually scale and pan;
   keeping it inside the scrollable container means the browser handles
   scrollbar behavior correctly when the user zooms in. */
.tree-container {
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fafcff;
  padding: 0;
  overflow: auto;
  flex: 1;
  min-height: 360px;
  max-height: 65vh;
  position: relative;
  cursor: grab;
}
.tree-container:active { cursor: grabbing; }

.tree-svg-wrap {
  /* Sized by inline `transform`. Using `position: relative` ensures the
     transform-origin behaves predictably across browsers. */
  position: relative;
  transform-origin: 0 0;
  /* Smooth transition for zoom buttons; disabled during pan/zoomFit to
     avoid jank. */
  transition: transform 0.15s ease-out;
  will-change: transform;
}
.tree-svg {
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}

.tree-node { cursor: pointer; }
.tree-node-rect {
  fill: #ffffff;
  stroke: #90caf9;
  stroke-width: 1.5;
  transition: fill 0.15s, stroke 0.15s;
}
.tree-node:hover .tree-node-rect {
  fill: #fff5f7;
  stroke: #e94560;
}
.tree-node-rect-active {
  fill: #ffe4ec !important;
  stroke: #e94560 !important;
  stroke-width: 2 !important;
}
.tree-node-rect-subagent {
  fill: #f3f9ff;
  stroke: #64b5f6;
}
.tree-node-rect-running {
  stroke-dasharray: 4 3;
  animation: treeNodeDash 1.2s linear infinite;
}
@keyframes treeNodeDash {
  to { stroke-dashoffset: -14; }
}

/* Pulse animation for newly-arrived nodes */
.tree-node-new .tree-node-rect {
  animation: treeNodeNewPulse 2s ease-out 1;
}
@keyframes treeNodeNewPulse {
  0%   { fill: #c8e6c9; stroke: #43a047; stroke-width: 3; }
  60%  { fill: #c8e6c9; stroke: #43a047; stroke-width: 2; }
  100% { fill: #ffffff; stroke: #90caf9; stroke-width: 1.5; }
}

.tree-node-name {
  font-size: 11px;
  font-weight: 600;
  fill: #222;
  pointer-events: none;
}
.tree-node-meta {
  font-size: 9px;
  fill: #888;
  pointer-events: none;
}
.tree-node-id {
  font-size: 9px;
  fill: #888;
  font-family: 'Courier New', monospace;
  pointer-events: none;
}
.tree-node-arrow {
  font-size: 10px;
  fill: #90caf9;
  pointer-events: none;
}

.tree-edge {
  fill: none;
  stroke: #bbdefb;
  stroke-width: 1.5;
  transition: stroke 0.4s, stroke-width 0.4s;
}
.tree-edge-active { stroke: #e94560; }

/* "+N more" pill for collapsed parents. Drawn as a small pill on the
   right edge of the parent node. Clicking it expands the hidden
   siblings. */
.tree-collapse-marker { cursor: pointer; }
.tree-collapse-rect {
  fill: #fff5f7;
  stroke: #e94560;
  stroke-width: 1.5;
  transition: fill 0.15s, stroke 0.15s;
}
.tree-collapse-marker:hover .tree-collapse-rect {
  fill: #e94560;
  stroke: #c62828;
}
.tree-collapse-marker:hover .tree-collapse-text { fill: #fff; }
.tree-collapse-text {
  fill: #e94560;
  font-size: 11px;
  font-weight: 600;
  user-select: none;
}

.tree-legend {
  margin-top: 8px;
  text-align: center;
}

/* ---- Tree button live child-count badge --------------------------------- */
.tree-badge {
  display: inline-block;
  min-width: 18px;
  padding: 1px 6px;
  margin-left: 4px;
  background: #1976d2;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
  border-radius: 9px;
  text-align: center;
  vertical-align: middle;
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
  background: #e8e8e8; color: #1a1a1a; padding: 1px 6px; border-radius: 4px;
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
