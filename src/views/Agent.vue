<template>
  <div class="agent-page">
    <aside class="session-list" :class="{ 'session-list-open': sessionListOpen }">
      <div v-if="sessionListOpen" class="session-list-content">
        <div class="session-header">
          <h3>Sessions</h3>
          <button class="btn-primary small" @click="openNewSessionModal" :disabled="creatingSession">
            {{ creatingSession ? '…' : '+ New' }}
          </button>
        </div>
        <div class="session-filter">
          <input
            v-model="searchQuery"
            class="session-filter-input"
            type="text"
            placeholder="Search title / content…"
            @input="onSearchInput"
          />
          <FilterDropdown
            v-model="projectFilter"
            :options="projectOptions"
            placeholder="Select project…"
            @change="onProjectFilterChange"
          />
          <label class="session-filter-running" title="Show only session trees that contain a running agent (across all projects)">
            <input type="checkbox" v-model="onlyRunningTrees" />
            <span class="running-dot-inline" :class="{ active: onlyRunningTrees }"></span>
            Running only
          </label>
        </div>
        <div class="session-hint muted small">
          Click ▸ on any session to reveal its sub-agents.
        </div>
        <!--
          The list area is the only part of the panel that scrolls.
          We isolate it into its own container so the hover card
          below can stay pinned to the bottom of the panel
          regardless of how far the list is scrolled.  See
          `.session-list-scroll` for the flex/overflow setup.
        -->
        <div class="session-list-scroll">
          <div v-if="projectFilter === null && !searchActive && !onlyRunningTrees" class="muted small session-filter-hint">
            Select a project above to view its agent sessions, or search across all sessions.
          </div>
          <div v-else-if="loadingSessions" class="muted small">Loading…</div>
          <div v-else-if="searchingSessions" class="muted small">Searching…</div>
          <div v-else-if="visibleSessions.length === 0" class="muted small session-filter-hint">
            {{ searchActive ? 'No sessions match the search.' : (onlyRunningTrees ? 'No running session trees.' : 'No sessions match the current filter.') }}
          </div>
          <ul v-else class="sessions">
            <SessionTreeItem
              v-for="s in visibleSessions"
              :key="s.sessionId"
              :session="s"
              :depth="0"
              :active-session-id="activeSessionId"
              :expanded-ids="expandedSessionIds"
              :children-map="childrenBySessionId"
              :loading-ids="childrenLoading"
              :flash-nonces="flashNonces"
              @select="selectSession"
              @delete="deleteSession"
              @toggle="toggleSessionExpand"
              @hover="onSessionHover"
              @leave="onSessionLeave"
              @context="openContextMenu"
            />
          </ul>
        </div>

        <!--
          Sticky hover card.  Sits below the scrolling list and
          inside the same flex column, so its width is automatically
          bound by the panel's inner padding.  Always-on tooltip on
          the row itself already provides a quick read; this card
          adds the full status row + badges + timestamp that don't
          fit on the 244px-wide row.
        -->
        <div v-if="hoveredSession" class="session-hover-card" :class="`status-${hoveredStatusKey}`">
          <div class="hover-card-row hover-card-status">
            <span
              :class="['status-row', hoveredSession.status, hoveredKind === 'non-terminal' ? 'status-row-active' : '']"
              :title="statusTooltip(hoveredSession.status)"
            >
              <span v-if="hoveredKind === 'non-terminal'" class="status-row-dot"></span>
              {{ statusLabel(hoveredSession.status) }}
            </span>
          </div>
          <div class="hover-card-row hover-card-tags">
            <span
              v-if="hoveredSession.parentSessionId"
              class="subagent-tag"
              title="This is a sub-agent session (child of another session)"
            >🧩 sub-agent</span>
          </div>
          <div class="hover-card-row hover-card-time">
            {{ formatTime(hoveredSession.updatedAt || hoveredSession.createdAt) || '—' }}
          </div>
          <div
            class="hover-card-row hover-card-uuid"
            :title="hoveredSession.sessionId"
          >
            <span class="hover-card-uuid-label">UUID</span>
            <code class="hover-card-uuid-value">{{ hoveredSession.sessionId }}</code>
          </div>
        </div>

        <!-- Right-click context menu -->
        <div
          v-if="ctxMenu.show"
          class="ctx-menu"
          :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
          @click.self="ctxMenu.show = false"
        >
          <div class="ctx-menu-item" @click="renameFromMenu">✎ Rename conversation</div>
          <div class="ctx-menu-divider"></div>
          <div class="ctx-menu-item" @click="exportSession(ctxMenu.sessionId)">📥 Export this session</div>
          <div class="ctx-menu-item" @click="exportSessionTree(ctxMenu.sessionId)">🌳 Export full tree (this + sub-agents)</div>
        </div>
      </div>
      <button
        class="session-list-toggle"
        :title="sessionListOpen ? 'Hide sessions' : 'Show sessions'"
        @click="toggleSessionList"
      >
        <span class="session-list-toggle-icon">{{ sessionListOpen ? '◀' : '▶' }}</span>
        <span class="session-list-toggle-label">
          📋
          <span v-if="visibleSessions.length > 0" class="session-list-count">{{ visibleSessions.length }}</span>
        </span>
      </button>
    </aside>

    <main class="chat">
      <div v-if="!activeSessionId" class="empty-state">
        <p>Select a session on the left, or create a new one to start chatting.</p>
      </div>
      <template v-else>
      <div class="chat-body">
        <!-- Chat header. Sub-agent hierarchy is now visible in the left
             session list (expand any row with ▸ to see its sub-agents), so
             the dedicated "Tree" modal/button has been removed. -->
        <div class="chat-header">
          <div class="chat-title">
            <input
              v-if="sessionRenameOpen"
              ref="sessionRenameInput"
              v-model="sessionNameDraft"
              class="chat-title-input"
              maxlength="120"
              @keyup.enter="saveSessionName"
              @keyup.esc="cancelSessionRename"
              @blur="saveSessionName"
            />
            <template v-else>
              <span
                class="chat-title-name"
                :title="activeSessionMeta ? `Agent UUID: ${activeSessionMeta.sessionId}` : ''"
              >{{ activeSessionName }}</span>
              <button
                class="chat-title-edit"
                title="Rename this conversation"
                @click.stop="startSessionRename"
              >✎</button>
            </template>
            <span v-if="activeSessionMeta?.parentSessionId" class="chat-title-meta">
              ·
              <button
                class="btn-link"
                :title="`Jump to parent session\nUUID: ${activeSessionMeta.parentSessionId}`"
                @click="selectSession(activeSessionMeta.parentSessionId!)"
              >↑ parent <code>{{ shortId(activeSessionMeta.parentSessionId) }}</code></button>
            </span>
          </div>
          <div class="chat-actions">
            <!--
              Wake segment selector: appears when the session has 2+
              wake events.  Lets the user filter the message list to
              a specific wake without scrolling through the entire
              conversation.  "-1" = "All" (show every message).
            -->
            <!-- Which program inside the session's project the agent works on.
                 The choice is stored on the session, so the next turn starts
                 from it instead of picking the first program again. -->
            <div
              v-if="activeSessionMeta?.projectName"
              class="program-picker"
              :title="`Program inside project '${activeSessionMeta.projectName}'`"
            >
              <span
                class="program-picker-label"
                :class="{ 'program-picker-missing': !activeSessionMeta.currentProgram }"
              >Program</span>
              <select
                class="program-picker-select"
                :value="activeSessionMeta.currentProgram ?? ''"
                :disabled="programBusy"
                @change="onProgramChange"
              >
                <option value="" disabled>— select a program —</option>
                <option v-for="p in projectPrograms" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>
            <select
              v-if="wakeSegments.length > 1"
              v-model.number="selectedWakeIndex"
              class="wake-selector"
              :title="`Filter messages by wake (${wakeSegments.length} wakes)`"
            >
              <option :value="-1">All messages</option>
              <option
                v-for="seg in wakeSegments"
                :key="seg.index"
                :value="seg.index"
              >Wake #{{ seg.index + 1 }}: {{ seg.label }}</option>
            </select>
            <!--
              Prominent agent-status pill.  This is the canonical
              "what is my agent doing right now?" widget: a colored
              background, an animated dot while the session is
              non-terminal, and a clear status name.  Polled on a
              3-second interval so the pill flips to STANDBY the
              moment the agent emits `Enter standby mode.` and
              back to RUNNING when a mailbox wake resumes it.
            -->
            <span
              v-if="activeSessionMeta"
              :class="statusPillClasses(activeSessionMeta.status)"
              :title="statusTooltip(activeSessionMeta.status)"
            >
              <span class="status-pill-dot"></span>
              <span class="status-pill-label">{{ statusLabel(activeSessionMeta.status) }}</span>
            </span>
            <!-- Pause/Resume button: only for managed sessions that are
                 running or paused. -->
            <button
              v-if="canPauseSession"
              class="btn-link pause-btn"
              :title="'Pause the agent after the current LLM response completes'"
              :disabled="pausingSession"
              @click="pauseSession"
            >⏸ Pause</button>
            <button
              v-if="canResumeSession"
              class="btn-link resume-btn"
              :title="'Resume the paused agent'"
              :disabled="pausingSession"
              @click="resumeSession"
            >▶ Resume</button>
            <!--
              The "Tree" button was removed in favour of the left-side
              session list, which already exposes parent/child links via
              the ▸ expander on each row (see SessionTreeItem). The
              "Export full tree" entry in the right-click context menu
              is still available for users who want a Markdown dump.
            -->
          </div>
        </div>

        <!-- Agent error banner: shown when the active session is in
             an `error` state and the backend provided a reason.
             Placed directly under the chat header so it is the first
             thing the user sees, before the messages list. -->
        <div v-if="activeSessionErrorMessage" class="agent-error-banner">
          <span class="agent-error-icon">⚠</span>
          <span class="agent-error-text">{{ activeSessionErrorMessage }}</span>
          <button
            class="agent-error-dismiss"
            title="Dismiss (the error will reappear if the state changes again)"
            @click="dismissedErrorSession = activeSessionId"
          >×</button>
        </div>

        <div class="messages" ref="messagesEl" @scroll="onMessagesScroll">
          <div v-if="loadingMessages" class="muted small">Loading messages…</div>
          <div v-else-if="messages.length === 0" class="muted small">
            No messages yet. Send a message to start the conversation.
          </div>
          <template v-for="m in visibleMessages" :key="m.messageId">
            <div :class="['msg', m.role, { 'interrupted-partial': isInterruptedPartialMessage(m) }]">
            <!-- Wake-event separator: rendered as a divider line -->
            <!-- with a label, NOT as a chat bubble. -->
            <div v-if="isWakeEventMessage(m)" class="wake-separator">
              <div class="wake-separator-line"></div>
              <div class="wake-separator-label">
                <span class="wake-separator-icon">🔔</span>
                {{ wakeEventLabel(m) }}
              </div>
              <div class="wake-separator-line"></div>
            </div>
            <!-- LLM retry status: rendered as an inline notice, not a
                 chat bubble.  Shows how many times the LLM call has
                 timed out and when the next retry will happen. -->
            <div v-else-if="isLLMRetryStatusMessage(m)" class="llm-retry-notice" :class="{ 'llm-retry-recovered': isLLMRetryRecovered(m) }">
              <span v-if="!isLLMRetryRecovered(m)" class="llm-retry-icon">⏳</span>
              <span v-else class="llm-retry-icon">✅</span>
              <span class="llm-retry-text">{{ llmRetryLabel(m, nowTick) }}</span>
              <button
                v-if="!isLLMRetryRecovered(m) && isLastVisibleMessage(m)"
                class="llm-retry-now-btn"
                @click="retryNow"
                :disabled="retryingNow"
              >
                {{ retryingNow ? 'Retrying…' : 'Retry Now' }}
              </button>
            </div>
            <!-- __llm_progress__ heartbeat rows are internal debug
                 signals: filtered OUT of visibleMessages entirely
                 (see the comment there).  The single in-flight
                 indicator is rendered once below the message list,
                 next to the streaming bubble. -->
            <template v-else>
            <div class="msg-header">
              <span class="role">{{ roleLabel(m) }}</span>
              <span class="time">{{ formatTime(m.createdAt) }}{{ m.role === 'tool' ? toolDurationLabel(m) : '' }}<span v-if="isInterruptedPartialMessage(m)" class="interrupted-badge">⚠ interrupted partial</span></span>
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
                  <!-- Parameters section: nested <details> so the user
                       can independently collapse just the args even when
                       the outer tool is expanded. State is per-DOM-node
                       (Vue re-uses the same element thanks to the stable
                       v-for key on the message). Default `open` matches
                       the legacy behaviour where parameters were always
                       visible alongside the output. -->
                  <details class="tool-params-block" open>
                    <summary>Parameters</summary>
                    <pre class="tool-args-text">{{ toolArgs(m) }}</pre>
                  </details>
                  <div class="tool-section tool-output-section">
                    <div class="tool-label">Output</div>
                    <pre class="tool-result-text" v-html="renderedToolResult(m)"></pre>
                  </div>
                </div>
              </details>
            </div>
            <div v-else class="content" v-html="renderMarkdown(displayContent(m))"></div>
            </template>
          </div>
            <div v-if="noticeAfter(m.messageId)" class="interruption-note">
              <span class="interruption-line"></span>
              <span class="interruption-text">{{ noticeAfter(m.messageId) }}</span>
              <span class="interruption-line"></span>
            </div>
          </template>
          <div
            v-for="(n, i) in danglingNotices"
            :key="`notice-${i}`"
            class="interruption-note"
          >
            <span class="interruption-line"></span>
            <span class="interruption-text">{{ n.text }}</span>
            <span class="interruption-line"></span>
          </div>
          <!-- Tool calls that are running right now.  The server pushes a
               tool_start event when a tool begins, so the card appears while
               the work is happening instead of only once it is stored. -->
          <div v-if="liveTools.length" class="live-tools">
            <div v-for="t in liveTools" :key="t.id" class="live-tool">
              <span class="live-tool-spinner"></span>
              <span class="live-tool-name">{{ t.name }}</span>
              <span class="live-tool-args">{{ t.args }}</span>
              <span class="live-tool-elapsed">{{ elapsedLabel(t.startedAt) }}</span>
            </div>
          </div>
          <!-- Transient messages after the last server message (not yet answered) -->
          <div v-if="turnRunning && !streamingText" class="msg assistant pending">
            <div class="role">Akiba</div>
            <div class="content"><span class="pending-spinner" aria-label="Working"></span></div>
          </div>
          <!-- LLM in-flight indicator: a single compact notice shown
               while an LLM call is running but no streaming text has
               arrived yet (e.g. the model is still thinking before
               the first token).  The raw __llm_progress__ heartbeat
               rows themselves are hidden from the message list as
               internal debug noise; once the streaming bubble has
               text it IS the in-flight signal and this notice hides. -->
          <div v-if="latestLLMProgress && !streamingText" class="llm-progress-notice">
            <span class="llm-progress-spinner">⏳</span>
            <span class="llm-progress-text">{{ llmProgressLabel(latestLLMProgress, nowTick) }}</span>
          </div>
          <!-- Live streaming bubble: shown while the chunk poller is
               feeding us an in-flight LLM response.  The text grows
               token-by-token (true "natural growth"), and the whole
               bubble is replaced by the canonical assistant row from
               the DB once the worker emits `done: true`.  If the
               stream is INTERRUPTED mid-generation (provider stall),
               the partial content stays on screen with a dimmed
               background and a one-shot marker until the retry's new
               generation replaces it. -->
          <div v-if="streamingHtml || streamingThinkHtml || streamThinkingActive || streamInterruptedError"
               class="msg assistant streaming-live"
               :class="{ interrupted: !!streamInterruptedError }">
            <div class="msg-header">
              <span class="role">Akiba</span>
              <span class="time streaming-live-time">
                streaming<span v-if="streamingChunkCount > 0"> · {{ streamingChunkCount }} chunks</span>
                <span v-if="streamStalled" class="stream-stall-indicator">
                  <span class="stream-stall-spinner"></span> waiting for model…
                </span>
              </span>
            </div>
            <!-- Reasoning channel: models that emit <think>…</think>
                 get a collapsible window instead of dumping the
                 chain-of-thought into the body.  Expanded while the
                 model is still thinking, auto-collapsed once the
                 closing tag arrives; the user can re-open it. -->
            <details v-if="streamingThinkHtml || streamThinkingActive"
                     class="think-details" :open="streamThinkingActive">
              <summary class="think-summary">
                <span v-if="streamThinkingActive" class="stream-stall-spinner think-summary-spinner"></span>
                {{ streamThinkingActive ? 'Thinking…' : 'Thought process' }}
              </summary>
              <div class="think-content" v-html="streamingThinkHtml"></div>
            </details>
            <!-- Rendered markdown (throttled ~150 ms behind the
                 typewriter). -->
            <div v-if="streamingHtml" class="content streaming-live-content" v-html="streamingHtml"></div>
            <!-- One-shot interrupted marker: a separate element (NOT
                 text appended to the bubble), so the 1 s poll cannot
                 spam it. -->
            <div v-if="streamInterruptedError" class="streaming-interrupted">
              <span class="streaming-interrupted-icon">⚠</span>
              <span v-if="streamInterruptedIsCancel">Cancelled by user. Partial content preserved.</span>
              <span v-else>Output interrupted ({{ streamInterruptedError }}). Partial content preserved — retrying…</span>
            </div>
          </div>
        </div>

        <div class="token-bar">
          <span class="token-label">Token usage</span>
          <span class="token-value">I:{{ roundInputTokens.toLocaleString() }}</span>
          <span class="token-value">O:{{ roundOutputTokens.toLocaleString() }}</span>
          <span class="token-value total">T:{{ totalTokens.toLocaleString() }}</span>
          <span
            v-if="lastInputTokens != null && contextLength != null"
            class="token-value context"
          >
            Last input: {{ lastInputTokens.toLocaleString() }} / {{ contextLength.toLocaleString() }}
          </span>
          <span v-if="lastInputTokens != null && contextLength == null" class="token-value context-dim" title="This session has no model recorded, so its context window is unknown.">
            Last input: {{ lastInputTokens.toLocaleString() }}<span class="hint-icon"> ⚠</span>
          </span>
          <span v-if="sessionModelName" class="token-model">{{ sessionModelName }}</span>
        </div>

        <div v-if="isManagedSession" class="automated-banner">
          ⚠ This is a managed session. Messages you send will be injected into the agent's context as user hints — they appear before the next LLM call. If the agent is stopped or errored, your message will restart it.
        </div>

        <!-- Connection-lost banner: shown when the pollers have
             failed N consecutive times.  Distinct from `errorMsg`
             (which is for one-shot action failures) because a lost
             connection is a *persistent* state the user needs to
             see until it's resolved. -->
        <div v-if="connectionLost" class="connection-lost-banner" role="alert">
          <span class="connection-lost-icon">⚠</span>
          <span class="connection-lost-text">
            Lost contact with the server ({{ pollFailureCount }} failed polls).
            New messages and status updates may be delayed.
            <template v-if="lastPollError"> Last error: {{ lastPollError }}</template>
          </span>
          <button
            class="connection-lost-retry"
            type="button"
            @click="retryPollingNow"
          >
            Retry now
          </button>
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
            <div v-if="isManagedSession" class="inject-mode-row">
              <label class="inject-mode-label">
                <input type="radio" v-model="injectTransient" :value="false" />
                Persistent (saved in history)
              </label>
              <label class="inject-mode-label">
                <input type="radio" v-model="injectTransient" :value="true" />
                Transient (this turn only)
              </label>
            </div>
            <div class="composer-input-row">
              <textarea
                v-model="input"
                :placeholder="isManagedSession
                  ? 'Type a hint to guide the agent and press Ctrl/⌘ + Enter to inject…'
                  : 'Type your message and press Ctrl/⌘ + Enter to send…'"
                rows="3"
                @keydown="onComposerKeydown"
              ></textarea>
              <button
                class="btn-primary composer-submit"
                :type="turnRunning ? 'button' : 'submit'"
                :disabled="!turnRunning && !input.trim()"
                :class="{ stopping: turnRunning }"
                @click="turnRunning ? onComposerStop() : undefined"
              >
                <template v-if="turnRunning">
                  {{ input.trim() ? 'Stop and send' : 'Stop' }}
                </template>
                <template v-else>{{ isManagedSession ? 'Inject' : 'Send' }}</template>
              </button>
            </div>
          </form>
        </div>
      </div>

      <ConversationPanel :session-id="activeSessionId" />
      </template>
    </main>

    <!--
      The dedicated sub-agent "Tree" modal was removed: the left-side
      session list (SessionTreeItem) already exposes the parent/child
      hierarchy via its ▸ expander, so a separate visual modal is
      redundant. Users who want a Markdown dump of the tree can still
      right-click any session and pick "Export full tree".
    -->

    <NewSessionModal
      v-model:open="showNewModal"
      :creating="creatingSession"
      :llm-configured="llmConfigs.length > 0"
      :model-name="selectedLlmModel"
      @update:creating="creatingSession = $event"
      @created="onSessionCreated"
    />

    <ToolConfirmModal
      :request="pendingConfirmation"
      :busy="confirmationBusy"
      :agent-name="confirmationSessionName"
      @approve="approve"
      @deny="deny"
    />

    <UserChoiceModal
      :request="pendingChoice"
      :busy="choiceBusy"
      :agent-name="choiceSessionName"
      @submit="respondChoice($event, false)"
      @cancel="respondChoice(null, true)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { agentApi, llmConfigApi, projectApi } from '@/services/api'
import type { AgentSession, AgentMessage, SubAgentSummary } from '@/types'
import type { StoredKeyEntry } from '@/services/api'
import { renderMarkdown, fixLiteralNewlines } from '@/utils/format'
import SessionTreeItem from '@/components/SessionTreeItem.vue'
import FilterDropdown from '@/components/FilterDropdown.vue'
import ConversationPanel from '@/components/agent/ConversationPanel.vue'
import NewSessionModal from '@/components/agent/NewSessionModal.vue'
import ToolConfirmModal from '@/components/agent/ToolConfirmModal.vue'
import UserChoiceModal from '@/components/agent/UserChoiceModal.vue'
import { useHumanInTheLoop } from '@/composables/useHumanInTheLoop'
import { formatTime, formatBytes, formatDuration, shortId } from '@/utils/agentFormat'

const sessions = ref<AgentSession[]>([])
const messages = ref<AgentMessage[]>([])
const activeSessionId = ref<string | null>(null)

/**
 * Wake segment selector state.
 *
 * `selectedWakeIndex` is -1 (= "All") by default, meaning all
 * messages are visible.  When the user picks a specific wake
 * segment from the dropdown, only messages from that wake are
 * shown in the messages list.
 *
 * A "wake segment" is the block of messages between two
 * consecutive wake-event markers (or from the start / to the
 * end).  Each segment's label is extracted from the wake-event
 * message's content (the text after `[[AKIBA_WAKE_EVENT]]`).
 */
const selectedWakeIndex = ref(-1)

/**
 * Sessions that are not in the top-level [sessions] list but that
 * we still need to render UI for — typically a sub-agent the user
 * just opened from the inline tree on the left.
 *
 * Why a separate ref instead of `unshift`-ing into [sessions]?
 *  - `sessions` is the list the user sees in the left panel; it
 *    must only contain *top-level* sessions, otherwise the same
 *    sub-agent would show up twice (once nested in its parent's
 *    tree, once as a top-level row).
 *  - But we still need to drive [activeSessionMeta], the chat
 *    header status pill, the parent-jump button, etc. when the
 *    user has selected a sub-agent.  We park the row here so the
 *    UI can find it without polluting the left panel.
 *
 * Entries are inserted on `selectSession` fallback and updated
 * in place by the per-session status poll via
 * [applySessionUpdate].  They are dropped on:
 *  - `loadSessions` (the page reloads → start fresh);
 *  - `deleteSession` (the row is gone);
 *  - `selectSession` switching to a *different* row that is
 *    already in `sessions` (no need to keep the old transient
 *    around; the user can re-open it later if needed).
 */
const transientSessionsById = ref<Record<string, AgentSession>>({})

/**
 * Look up a session by id, consulting both the top-level list
 * and the transient map.  Returns `undefined` if no such row is
 * known to the frontend (e.g. the user has never selected it).
 *
 * Every UI surface that needs the *active* session's metadata
 * (chat header, composer gating, conversation panel, etc.)
 * should go through this helper rather than indexing
 * `sessions.value` directly — otherwise a selected sub-agent
 * would silently lose its name / status / model.
 */
function findSessionById(id: string | null | undefined): AgentSession | undefined {
  if (!id) return undefined
  return sessions.value.find(s => s.sessionId === id)
    ?? transientSessionsById.value[id]
}

// ---- Session filter (project → workflow → module) + search -----------------
/**
 * The session list is gated behind a project filter: with no project
 * selected the list stays empty — sessions accumulate quickly and a
 * flat list of every session is unusable.  The workflow and module
 * selects progressively narrow the chosen project.  The search box
 * searches session titles AND message contents (via the backend); a
 * search with no project selected searches across all projects, which
 * is the way to LOCATE a session whose project is unknown.
 */
const NO_PROJECT = '__no_project__'      // sessions with a null/blank projectName

const projectFilter = ref<string | null>(null)
const searchQuery = ref('')
/** Ids returned by the last backend search; null = not searching. */
const searchMatchIds = ref<Set<string> | null>(null)
const searchingSessions = ref(false)
let searchDebounce: number | null = null

/**
 * Index of EVERY session (top-level and sub-agents) from the latest
 * ALL-list poll, keyed by session id.  Powers the "running only"
 * checkbox: a session tree qualifies when ANY of its members is in a
 * non-terminal state.
 */
const allSessionsIndex = ref<Map<string, AgentSession>>(new Map())
/** When checked, the list shows only session trees containing a running agent. */
const onlyRunningTrees = ref(false)

/** Walk the parent chain up to the tree's root (cycle-safe). */
function rootIdOf(s: AgentSession, byId: Map<string, AgentSession>): string {
  let cur = s
  const seen = new Set<string>()
  while (cur.parentSessionId) {
    if (!seen.add(cur.sessionId)) break
    const parent = byId.get(cur.parentSessionId)
    if (!parent) break
    cur = parent
  }
  return cur.sessionId
}

/** Root ids of session trees that contain at least one non-terminal member. */
const runningRootIds = computed<Set<string>>(() => {
  const roots = new Set<string>()
  // Top-level rows may be fresher than the last ALL poll — check them too.
  for (const s of sessions.value) {
    if (!isTerminalStatus(s.status)) roots.add(s.sessionId)
  }
  const byId = allSessionsIndex.value
  for (const s of byId.values()) {
    if (isTerminalStatus(s.status)) continue
    roots.add(rootIdOf(s, byId))
  }
  return roots
})

const searchActive = computed(() => searchMatchIds.value !== null)

function projectKeyOf(s: AgentSession): string {
  const v = s.projectName?.trim()
  return v ? v : NO_PROJECT
}

interface FilterOption {
  value: string
  label: string
  count?: number
  /** True when any session in this group is in a non-terminal state. */
  running?: boolean
}

/** Accumulate per-group session counts and running flags for the dropdowns. */
function groupOptions(
  list: AgentSession[],
  keyOf: (s: AgentSession) => string,
  labelOf: (key: string) => string
): FilterOption[] {
  const groups = new Map<string, { n: number; running: boolean }>()
  for (const s of list) {
    const k = keyOf(s)
    const g = groups.get(k) ?? { n: 0, running: false }
    g.n++
    if (!isTerminalStatus(s.status)) g.running = true
    groups.set(k, g)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, g]) => ({
      value,
      label: labelOf(value),
      count: g.n,
      running: g.running
    }))
}

const projectOptions = computed<FilterOption[]>(() =>
  groupOptions(
    sessions.value,
    projectKeyOf,
    v => (v === NO_PROJECT ? '(no project)' : v)
  )
)

/** Sessions inside the selected project. */
function sessionsOfProject(): AgentSession[] {
  return sessions.value.filter(s => projectFilter.value === null || projectKeyOf(s) === projectFilter.value)
}

const visibleSessions = computed<AgentSession[]>(() => {
  // Searching overrides the project gate: its purpose is precisely to
  // locate a session when the user does not know which project holds it.
  if (searchActive.value) {
    const ids = searchMatchIds.value!
    return sessions.value.filter(s => ids.has(s.sessionId))
  }
  // "Running only" is a global quick view (like search): it bypasses
  // the project gate so all live trees surface in one place.
  if (onlyRunningTrees.value) {
    return sessions.value.filter(s => runningRootIds.value.has(s.sessionId))
  }
  if (projectFilter.value === null) return []
  return sessionsOfProject()
})

function onProjectFilterChange() {
  const first = visibleSessions.value[0]
  if (first) selectSession(first.sessionId)
}


function onSearchInput() {
  if (searchDebounce !== null) { clearTimeout(searchDebounce); searchDebounce = null }
  const q = searchQuery.value.trim()
  if (q.length < 2) {
    searchMatchIds.value = null
    return
  }
  searchDebounce = window.setTimeout(() => { void runSearch(q) }, 400)
}

async function runSearch(q: string) {
  searchingSessions.value = true
  try {
    const { data } = await agentApi.searchSessions(q)
    searchMatchIds.value = new Set((data.sessions || []).map(s => s.sessionId))
  } catch (e) {
    // Fall back to client-side title/UUID matching when the backend
    // search route is unavailable (e.g. an older daemon).
    console.warn('Session search failed, falling back to title match:', e)
    const needle = q.toLowerCase()
    searchMatchIds.value = new Set(
      sessions.value
        .filter(s =>
          (s.sessionName ?? '').toLowerCase().includes(needle) ||
          s.sessionId.toLowerCase().includes(needle))
        .map(s => s.sessionId)
    )
  } finally {
    searchingSessions.value = false
  }
}

const loadingSessions = ref(false)
const loadingMessages = ref(false)
const showNewModal = ref(false)
const creatingSession = ref(false)
/**
 * Session whose turn this tab is currently awaiting.
 *
 * A global boolean was wrong: while session A's /chat was in flight, sending in
 * session B returned early and showed nothing at all.
 */
const sendingSessionId = ref<string | null>(null)

/** True only when the turn in flight belongs to the session on screen. */
const sending = computed(() =>
  sendingSessionId.value !== null && sendingSessionId.value === activeSessionId.value
)

/** The row of the session in view, kept fresh by the session-status poller. */
const activeSessionRow = computed(() =>
  sessions.value.find(s => s.sessionId === activeSessionId.value) ?? null
)

/**
 * Whether a turn is running, whoever started it.
 *
 * `sending` only knows about turns this tab launched: a turn left running by a
 * server restart (or by another tab) is invisible to it, which used to leave a
 * disabled Send button and no way to stop. The session row is the authority.
 */
const turnRunning = computed(() =>
  sending.value ||
  activeSessionRow.value?.runtimeState === 'running' ||
  activeSessionRow.value?.status === 'running'
)
const exportingTree = ref(false)
const errorMsg = ref('')
const input = ref('')
const tokenUsage = ref<{ input: number; output: number } | null>(null)

// Ticks every second to force re-render of the LLM retry countdown.
// Only started when there's an active retry-status message.
const nowTick = ref(Date.now())
let nowTickInterval: number | null = null

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
  const s = findSessionById(activeSessionId.value)
  return !!s?.moduleName && s.moduleName !== 'chat' && !isTerminalStatus(s?.status)
})

/**
 * True for ALL non-chat sessions, regardless of runtime state
 * (running, standby, closed, error).  When true, the chat input
 * is enabled and messages are sent via /inject (mailbox) instead
 * of /chat (synchronous manual turn).
 */
const isManagedSession = computed(() => {
  const s = findSessionById(activeSessionId.value)
  return !!s?.moduleName && s.moduleName !== 'chat'
})

// ---- Pause / Resume ----
const pausingSession = ref(false)

const canPauseSession = computed(() => {
  const s = findSessionById(activeSessionId.value)
  if (!s || !isManagedSession.value) return false
  const st = (s.status ?? '').toLowerCase()
  return st === 'running' || st === 'msghandle'
})

const canResumeSession = computed(() => {
  const s = findSessionById(activeSessionId.value)
  if (!s || !isManagedSession.value) return false
  const st = (s.status ?? '').toLowerCase()
  return st === 'paused'
})

async function pauseSession() {
  if (!activeSessionId.value || pausingSession.value) return
  pausingSession.value = true
  try {
    await agentApi.pause(activeSessionId.value)
    await refreshActiveStatus()
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Failed to pause session.'
  } finally {
    pausingSession.value = false
  }
}

async function resumeSession() {
  if (!activeSessionId.value || pausingSession.value) return
  pausingSession.value = true
  try {
    await agentApi.resume(activeSessionId.value)
    await refreshActiveStatus()
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Failed to resume session.'
  } finally {
    pausingSession.value = false
  }
}

/** Transient vs persistent delivery for injected messages. */
const injectTransient = ref(false)

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
 * Invoked from the right-click context menu on the session list.
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

// ---- LLM config ------------------------------------------------------------
const llmConfigs = ref<StoredKeyEntry[]>([])
const selectedLlmConfig = ref('')
const selectedLlmModel = ref('')
const availableModels = ref<string[]>([])

onMounted(async () => {
  await Promise.all([loadSessions(), loadLlmConfigs()])

  // Start the list-level status poll so the session list badges
  // stay in sync with the DB even when the user is not actively
  // switching sessions.  Slower cadence than the per-session
  // poll (LIST_POLL_MS vs STATUS_POLL_MS).  Kick one pass off
  // immediately so the running-tree index is populated up-front
  // instead of after the first poll interval.
  startListPolling()
  void refreshAllStatuses()

  // Human-in-the-loop prompts for ANY session (e.g. a sub-agent).
  startHumanInTheLoop()

  // Check URL params for a pre-selected session (e.g. from workflow detail)
  const params = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search)
  const presetSession = params.get('sessionId')

  if (presetSession) {
    // Find it in either the top-level list or the transient map
    // (the latter covers preset = sub-agent, e.g. a deep link into
    // a sub-agent session).
    const found = findSessionById(presetSession)
    if (found) {
      // Reveal the preset session inside the project-filtered list.
      projectFilter.value = projectKeyOf(found)
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
      // The stub row has no projectName — surface it via the
      // "(no project)" bucket so it stays visible under the filter.
      projectFilter.value = NO_PROJECT
      messages.value = data.messages || []
      await scrollToBottom()
      // The preset path skipped selectSession() so the per-session
      // status poll never started; start it now so the header pill
      // follows the preset session.
      startStatusPolling()
      // Also start the streaming-chunk poll so any in-flight LLM
      // response starts appearing token-by-token.  The preset
      // fallback path skips selectSession() entirely, so without
      // this call the poller never starts and the user only sees
      // the 3-second DB polling — the exact bug being fixed here.
      startStreamPolling(presetSession)
    } catch {
      // Fallback: just initialise the LLM picker — no session is
      // auto-selected until the user picks a project on the left.
      if (llmConfigs.value.length > 0) {
        selectedLlmConfig.value = llmConfigs.value[0].id
        onLlmConfigChange()
      }
    }
  } else if (llmConfigs.value.length > 0) {
    // No deep link: initialise the LLM picker only.  The session list
    // stays empty until a project is selected in the filter bar.
    selectedLlmConfig.value = llmConfigs.value[0].id
    onLlmConfigChange()
  }
})

onUnmounted(() => {
  if (messagePollInterval) { clearInterval(messagePollInterval); messagePollInterval = null }
  if (searchDebounce !== null) { clearTimeout(searchDebounce); searchDebounce = null }
  stopStatusPolling()
  stopListPolling()
  if (nowTickInterval) { clearInterval(nowTickInterval); nowTickInterval = null }
  stopHumanInTheLoop()
  stopStreamPolling()
  // Clear the hover card's leave-debounce timer to prevent a
  // dangling setTimeout from firing after unmount and clobbering
  // a now-orphaned ref.
  if (hoverLeaveTimer != null) {
    clearTimeout(hoverLeaveTimer)
    hoverLeaveTimer = null
  }
  hoveredSession.value = null
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

/**
 * Point the LLM picker at the model the given session is actually
 * using.  Without this the picker stayed on the page default (first
 * config / first model) when a session was reopened, making it look —
 * and behave, once the user touched it — as if the session forgot its
 * model between visits.  A model that no configured key covers (e.g.
 * the key was deleted) leaves the picker untouched.
 */
function syncLlmPickerWithSession(modelName?: string | null) {
  if (!modelName) return
  const lower = modelName.toLowerCase()
  const config = llmConfigs.value.find(c =>
    c.modelNames.some(m => m.toLowerCase() === lower))
  if (!config) return
  selectedLlmConfig.value = config.id
  availableModels.value = config.modelNames
  selectedLlmModel.value =
    config.modelNames.find(m => m.toLowerCase() === lower) ?? modelName
}

// ---- Sessions ---------------------------------------------------------------
// Toggle for the left-side session list. Mirrors the right-side
// `conv-panel-open` UX: collapsed shows only a 36px-wide handle button
// (with the session count), expanded reveals the full 280px panel.
// Default `true` preserves the legacy behaviour where the list was
// always visible — switching sessions is a primary action and the user
// should not have to expand a panel to do it.
const sessionListOpen = ref(true)

function toggleSessionList() {
  sessionListOpen.value = !sessionListOpen.value
}

// ---- Inline sub-agent tree (left-side list) ---------------------------
//
// The previous design hid sub-agents behind a dedicated Tree modal;
// with `SessionTreeItem` (recursive list item), the user can expand
// any session inline to reveal its direct sub-agents, and recursively
// expand any of those that themselves have children.  The state lives
// here in `Agent.vue` (not inside the component) so that:
//   * multiple `SessionTreeItem` instances share one cache, and
//   * we can clear / refresh it from the existing status / list polls
//     without re-mounting any list item.
const expandedSessionIds = ref<Set<string>>(new Set())
const childrenBySessionId = ref<Record<string, AgentSession[]>>({})
const childrenLoading = ref<Set<string>>(new Set())

/**
 * Per-session "flash nonce" — incremented every time the
 * frontend detects a status change for that session.  The
 * `SessionTreeItem` row binds this value as `:key` on a flash
 * overlay element, so each increment forces Vue to recreate
 * the overlay and restart its CSS colour-flash animation.
 *
 * The nonce never decreases; the overlay element stays in the
 * DOM at opacity:0 after the animation completes, so there is
 * no need to clean it up.  A value of `0` (the default for
 * sessions that have never changed) means "no flash yet" and
 * the overlay is not rendered at all (`v-if="flashNonce > 0"`).
 */
const flashNonces = ref<Record<string, number>>({})

/**
 * Bump the flash nonce for [sessionId] so the left-side row
 * briefly flashes in the session's new status colour.  Called
 * from [mergeSession] (and the sub-agent cache refresh in
 * [refreshAllStatuses]) whenever `fresh.status` differs from
 * the locally-cached `status`.
 *
 * Creating a fresh object (rather than mutating in place) keeps
 * Vue's reactivity reliable without depending on deep-watch
 * internals.
 */
function markSessionStatusChanged(sessionId: string) {
  const next = { ...flashNonces.value }
  next[sessionId] = (next[sessionId] || 0) + 1
  flashNonces.value = next
}

/**
 * Toggle the expand/collapse state of one session in the inline tree.
 *
 *  * If the session is currently collapsed, mark it expanded AND
 *    kick off a fetch for its direct children.
 *  * If the session is already expanded, just collapse it; the
 *    children are kept in the cache for the next expand.
 *
 *  We intentionally re-fetch even on a previously-cached empty
 *  list: a parent that had no sub-agents at the last visit may
 *  have spawned one since.  Re-fetching on every expand is the
 *  simplest way to let the count badge appear the moment a
 *  child comes into existence, without polling every parent's
 *  children list every 6s.  `loadChildrenFor` is idempotent via
 *  the `childrenLoading` set, so a stuck click cannot stack
 *  parallel requests.
 */
async function toggleSessionExpand(sessionId: string) {
  const next = new Set(expandedSessionIds.value)
  if (next.has(sessionId)) {
    next.delete(sessionId)
    expandedSessionIds.value = next
    return
  }
  next.add(sessionId)
  expandedSessionIds.value = next
  // Always kick off a fetch on expand.  For an already-known
  // parent this is a small redundant call, but it ensures a
  // previously-empty parent can "discover" newly-spawned
  // children without the user having to refresh the whole list.
  if (childrenLoading.value.has(sessionId)) return
  await loadChildrenFor(sessionId)
}

/**
 * Fetch the direct children of [sessionId] and store them in the
 * cache.  Idempotent against concurrent calls — the loading set
 * guards against stacking parallel requests for the same parent.
 */
async function loadChildrenFor(sessionId: string) {
  if (childrenLoading.value.has(sessionId)) return
  const loading = new Set(childrenLoading.value)
  loading.add(sessionId)
  childrenLoading.value = loading
  try {
    const { data } = await agentApi.listChildren(sessionId)
    childrenBySessionId.value = {
      ...childrenBySessionId.value,
      [sessionId]: data.children || [],
    }
  } catch {
    // On error, store an empty list so the UI doesn't keep retrying
    // on every expand click.  The user can collapse and re-expand
    // (or wait for the next status poll) to try again.
    childrenBySessionId.value = {
      ...childrenBySessionId.value,
      [sessionId]: [],
    }
  } finally {
    const done = new Set(childrenLoading.value)
    done.delete(sessionId)
    childrenLoading.value = done
  }
}

/**
 * Drop cached children for a parent — used when one of its children
 * is deleted so the parent's "N sub-agents" badge stays accurate.
 */
function invalidateChildrenFor(parentId: string) {
  if (childrenBySessionId.value[parentId] === undefined) return
  const next = { ...childrenBySessionId.value }
  delete next[parentId]
  childrenBySessionId.value = next
}

// ---- Sticky hover card --------------------------------------------------
//
// Each `SessionTreeItem` fires `hover` / `leave` events.  We keep
// the most recently hovered session in `hoveredSession` and render
// a sticky card at the bottom of the panel (see template).  This is
// preferable to v3's per-row absolutely-positioned sub-popup, which
// got clipped by the panel's `overflow-y: auto` and whose width
// did not align with the panel's inner padding.
//
// We use a small `setTimeout` debounce on `leave` so the card does
// not flicker as the pointer briefly passes through a 1px gap
// between rows.

const hoveredSession = ref<AgentSession | null>(null)
let hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null

function onSessionHover(session: AgentSession) {
  if (hoverLeaveTimer != null) {
    clearTimeout(hoverLeaveTimer)
    hoverLeaveTimer = null
  }
  // Avoid re-triggering reactivity for the same row.
  if (hoveredSession.value?.sessionId !== session.sessionId) {
    hoveredSession.value = session
  }
}

function onSessionLeave(session: AgentSession) {
  // Only clear the card if the leaving session is the one we are
  // currently showing.  This is the case when the pointer moves
  // directly to a *different* row (whose own `hover` event will
  // overwrite `hoveredSession` immediately, before the timer
  // fires).  We keep a small timeout so micro-gaps between rows
  // do not flash the card empty.
  if (hoveredSession.value?.sessionId !== session.sessionId) return
  if (hoverLeaveTimer != null) clearTimeout(hoverLeaveTimer)
  hoverLeaveTimer = setTimeout(() => {
    hoveredSession.value = null
    hoverLeaveTimer = null
  }, 80)
}

/** Lowercased status key for the hover card's `status-` class. */
const hoveredStatusKey = computed(() => {
  const s = (hoveredSession.value?.status ?? '').toLowerCase()
  switch (s) {
    case 'active':    return 'running'
    case 'suspended': return 'standby'
    default:          return s || 'unknown'
  }
})

/** Lifecycle classification for the hover card's status dot. */
const hoveredKind = computed<'non-terminal' | 'terminal' | 'unknown'>(() => {
  const s = (hoveredSession.value?.status ?? '').toLowerCase()
  if (
    s === 'running' || s === 'standby' || s === 'msghandle' ||
    s === 'paused' || s === 'cancelling' || s === 'active' || s === 'suspended'
  ) return 'non-terminal'
  if (
    s === 'closed' || s === 'error' ||
    s === 'completed' || s === 'cancelled' || s === 'failed'
  ) return 'terminal'
  return 'unknown'
})

async function loadSessions() {
  loadingSessions.value = true
  try {
    // Fetch a generous page so the project/workflow/module filter
    // dropdowns can be derived from the full top-level list.
    const { data } = await agentApi.listSessions(500)
    sessions.value = data.sessions || []
    // Fresh page load → drop any sub-agent rows we were holding
    // for the previous session.  The next `selectSession` will
    // re-populate `transientSessionsById` on demand.
    transientSessionsById.value = {}
  } catch (e) {
    console.error('Failed to load sessions:', e)
  } finally {
    loadingSessions.value = false
  }
}

function openNewSessionModal() {
  showNewModal.value = true
}

/** The modal created a session: reveal it and select it. */
async function onSessionCreated(data: AgentSession) {
  sessions.value.unshift(data)
  // Reveal the fresh session under the filter view: select its
  // project and clear the finer filters / any active search.
  projectFilter.value = projectKeyOf(data)
  searchQuery.value = ''
  searchMatchIds.value = null
  tokenUsage.value = null
  await selectSession(data.sessionId)
}

let messagePollInterval: number | null = null
const NORMAL_POLL_MS = 3000
const ACTIVE_CHAT_POLL_MS = 750

/**
 * `closed` and `error` are the only terminal states under the unified
 * enum.  Legacy strings (`completed` / `cancelled` / `failed`) are
 * accepted for tolerance during the migration window and treated as
 * their new equivalents.
 *
 * Used by [isAutomatedSession] to detect "still running" sessions
 * (running / standby / msghandle / cancelling — all automated and
 * uninteractable).  Returning `false` for `null` is intentional: we
 * do not want an unknown status to lock the composer.
 */
function isTerminalStatus(s: string | null | undefined): boolean {
  if (s == null) return false
  return s === 'closed' || s === 'error' ||
      s === 'completed' || s === 'cancelled' || s === 'failed'
}

// ============================================================
//  Poll-health tracking — surfaces "connection lost" UI
// ============================================================
//
// Counts consecutive failures across all pollers; at the threshold a
// persistent banner tells the user the frontend lost contact with the
// backend. Any successful poll resets the counter and clears the banner.
const pollFailureCount = ref(0)
const POLL_FAILURE_THRESHOLD = 3
const lastPollError = ref<string>('')

const connectionLost = computed(() => pollFailureCount.value >= POLL_FAILURE_THRESHOLD)

function recordPollSuccess() {
  pollFailureCount.value = 0
  lastPollError.value = ''
}

function recordPollFailure(err: unknown) {
  pollFailureCount.value += 1
  const msg = (err as any)?.response?.data?.error || (err as any)?.message || ''
  if (msg) lastPollError.value = String(msg)
}

/** User clicked the banner's "Retry now" button. */
async function retryPollingNow() {
  pollFailureCount.value = 0
  lastPollError.value = ''
  // Fire the three pollers in parallel; their success paths will
  // keep the counter at zero (or push it back up if the backend
  // is still down).
  await Promise.allSettled([
    refreshMessages(),
    refreshActiveStatus(),
    refreshAllStatuses(),
  ])
}

async function refreshMessages() {
  if (!activeSessionId.value) return
  const polledSessionId = activeSessionId.value
  try {
    const { data } = await agentApi.getMessages(polledSessionId)
    // Guard against session switch during the async fetch:
    // if the user switched to a different session while we were
    // waiting for the response, discard the stale result.
    if (activeSessionId.value !== polledSessionId) return
    const nextMessages = data.messages || []
    // Lightweight change detection: compare length and last message ID
    // instead of JSON.stringify on potentially large arrays.
    const messagesChanged = nextMessages.length !== messages.value.length ||
      (nextMessages.length > 0 && messages.value.length > 0 &&
       nextMessages[nextMessages.length - 1].messageId !== messages.value[messages.value.length - 1].messageId)
    messages.value = nextMessages
    // Keep an unacknowledged optimistic user bubble on screen until the
    // DB transcript actually contains it.
    const pending = pendingOptimistic.get(polledSessionId)
    if (pending) {
      const arrived = nextMessages.some(m => m.role === 'user' && m.content === pending.content)
      if (arrived) {
        pendingOptimistic.delete(polledSessionId)
      } else {
        messages.value = [...nextMessages, pending]
      }
    }
    // Use backend-provided token stats; update even when message text is unchanged.
    roundInputTokens.value = data.totalInputTokens ?? 0
    roundOutputTokens.value = data.totalOutputTokens ?? 0
    totalTokens.value = roundInputTokens.value + roundOutputTokens.value
    lastInputTokens.value = data.lastInputTokens ?? null
    contextLength.value = data.contextLength ?? null
    if (messagesChanged) {
      await scrollToBottom()
      settleStreamIfPersisted(nextMessages)
    }
    recordPollSuccess()
  } catch (e) {
    recordPollFailure(e)
  }
}

function startMessagePolling(intervalMs = NORMAL_POLL_MS) {
  if (messagePollInterval) clearInterval(messagePollInterval)
  messagePollInterval = window.setInterval(refreshMessages, intervalMs)
}

// ============================================================
// Status helpers + periodic status poll
// ============================================================
//
// The legacy code only refreshed the session list on
// `onMounted` and after a `createSession` / `deleteSession`, so
// the badges in the session list and the meta text in the chat
// header could be frozen on a stale "running" long after the
// agent transitioned to STANDBY.  Two pollers fix this:
//
//  1. `refreshActiveStatus` — fires every `STATUS_POLL_MS` for
//     the *active* session only.  Single-row, light query
//     (GET /agent/sessions/{id}), feeds the prominent status
//     pill in the chat header and refreshes the matching entry
//     in the session list.
//
//  2. `refreshAllStatuses` — fires every `LIST_POLL_MS` (a
//     slower cadence) for the full list.  Used to keep the
//     non-active entries in the left-side list fresh, so a
//     background agent that flips to STANDBY while another
//     session is open still shows the new state.
//
// Both are started when a session is selected and stopped on
// unmount / session switch.

let statusPollInterval: number | null = null
let listPollInterval: number | null = null
const STATUS_POLL_MS = 3000
const LIST_POLL_MS = 6000

/**
 * Canonical mapping from the wire `status` string to a coarse
 * display category.  Used by the status pill / badge to pick a
 * colour + decide whether to render the animated dot.
 */
function statusKind(status: string | null | undefined): 'non-terminal' | 'terminal' | 'unknown' {
  if (!status) return 'unknown'
  const s = status.toLowerCase()
  if (s === 'running' || s === 'standby' || s === 'msghandle' ||
      s === 'paused' || s === 'cancelling' || s === 'active' || s === 'suspended') {
    return 'non-terminal'
  }
  if (s === 'closed' || s === 'error' ||
      s === 'completed' || s === 'cancelled' || s === 'failed') {
    return 'terminal'
  }
  return 'unknown'
}

/**
 * Compose the full set of CSS classes for the chat-header
 * status pill.  Two layers:
 *  - `status-pill-${kind}` — picks the base colour (non-terminal
 *    vs terminal).
 *  - `status-pill-${status}` — picks the specific colour for
 *    stand-out states (standby / cancelling / msghandle / error /
 *    cancelled).  The specific class wins because it is declared
 *    later in the stylesheet, so a STANDBY session renders
 *    teal even though it is also a "non-terminal" state.
 *  - `status-pill-active` — only on non-terminal states, used
 *    by callers that want to flag "needs attention" without
 *    changing colour.
 */
function statusPillClasses(status: string | null | undefined): string[] {
  if (!status) return ['status-pill', 'status-pill-unknown']
  const s = status.toLowerCase()
  const kind = statusKind(status)
  const out = ['status-pill', `status-pill-${kind}`]
  if (kind === 'non-terminal') out.push('status-pill-active')
  // Specific class — only when we have one defined.
  const specific = [
    'running', 'standby', 'msghandle', 'paused', 'cancelling', 'active',
    'closed', 'completed', 'cancelled', 'error', 'failed',
  ]
  if (specific.includes(s)) out.push(`status-pill-${s}`)
  return out
}

/**
 * Pretty-print the wire status for the UI.  Renames a few
 * less-obvious enum values ("msghandle" → "Handling mail",
 * "cancelling" → "Cancelling…") so the pill reads naturally
 * even to a user who has never seen the enum.
 */
function statusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown'
  const s = status.toLowerCase()
  switch (s) {
    case 'running': return 'Running'
    case 'standby': return 'Standby'
    case 'msghandle': return 'Handling mail'
    case 'paused': return 'Paused'
    case 'cancelling': return 'Cancelling…'
    case 'active': return 'Active'
    case 'suspended': return 'Standby'
    case 'closed': return 'Closed'
    case 'completed': return 'Completed'
    case 'cancelled': return 'Cancelled'
    case 'failed': return 'Failed'
    case 'error': return 'Error'
    default: return s.charAt(0).toUpperCase() + s.slice(1)
  }
}

/**
 * Long-form tooltip.  The pill is a glance widget; the tooltip
 * is the place to explain what each non-terminal state means in
 * the framework's vocabulary (e.g. "Standby" → "parked after
 * the primary task; wakes on incoming mailbox messages").
 */
function statusTooltip(status: string | null | undefined): string {
  if (!status) return 'Unknown status'
  const s = status.toLowerCase()
  // Find the active session's error reason to augment the tooltip
  // so the user can still see *why* the session failed even after
  // dismissing the error banner.
  const meta = activeSessionMeta.value
  const reason = meta?.errorMessage?.trim() || meta?.closingReason?.trim() || ''
  switch (s) {
    case 'running': return 'Agent is actively running.'
    case 'standby': return 'Parked after the primary task. Wakes on incoming mailbox messages.'
    case 'msghandle': return 'Draining mailbox messages before resuming the run loop.'
    case 'paused': return 'Paused by user. The agent waits for resume. Messages still accumulate in the mailbox.'
    case 'cancelling': return 'Cancellation requested; finishing the in-flight step.'
    case 'active': return 'Agent is actively running.'
    case 'suspended': return 'Parked after the primary task. Wakes on incoming mailbox messages.'
    case 'closed': return 'Session closed.'
    case 'completed': return 'Session completed successfully.'
    case 'cancelled': return 'Session was cancelled.'
    case 'failed': return reason ? `Session ended with a failure: ${reason}` : 'Session ended with a failure.'
    case 'error': return reason ? `Session ended with an error: ${reason}` : 'Session ended with an error.'
    default: return `Status: ${s}`
  }
}

/**
 * Refresh the active session's status in-place.  Updates the
 * matching entry in `sessions.value` so the chat-header pill
 * and the left-side list badge stay in sync.  Silent on
 * network errors — the next tick will retry.
 */
async function refreshActiveStatus() {
  const id = activeSessionId.value
  if (!id) return
  try {
    const { data } = await agentApi.getSession(id)
    if (activeSessionId.value !== id) return  // session switched during fetch
    applySessionUpdate(data)
    recordPollSuccess()
  } catch (e) {
    recordPollFailure(e)
  }
}

/**
 * Refresh the entire session list.  Heavier than
 * [refreshActiveStatus] so it runs on a slower cadence
 * (LIST_POLL_MS).  Same on-error policy.
 */
async function refreshAllStatuses() {
  try {
    const { data } = await agentApi.listSessions(200, 0, 'ALL')
    const all = data.sessions || []
    // Feed the running-tree index (the "running only" checkbox view).
    // The daemon orders by updated_at DESC, so live (actively-updating)
    // sessions always land in the first page even when it truncates.
    allSessionsIndex.value = new Map(all.map(s => [s.sessionId, s]))
    // Build a map for O(1) status updates; new entries (e.g. a
    // child that just spawned) get inserted, vanished entries
    // are kept (the user may have them open in another tab).
    const byId: Record<string, AgentSession> = {}
    for (const s of all) byId[s.sessionId] = s
    sessions.value = sessions.value.map(s => {
      const fresh = byId[s.sessionId]
      return fresh ? mergeSession(s, fresh) : s
    })
    // Insert any new top-level sessions we hadn't seen before.
    for (const s of all) {
      if (!sessions.value.some(x => x.sessionId === s.sessionId) &&
          !s.parentSessionId) {
        sessions.value.unshift(s)
      }
    }
    // Also merge status updates into the inline sub-agent tree.
    // For every parent that has a cached children list, refresh each
    // known child with the latest row.  Vanished children (deleted
    // elsewhere) are dropped so the UI doesn't show ghosts.
    //
    // For EXPANDED parents we additionally auto-insert any
    // newly-spawned sub-agents found in this poll's `all` list, so a
    // running parent's new children appear live while it stays
    // expanded.  Collapsed parents skip auto-insert (their children
    // aren't visible anyway); `toggleSessionExpand` re-fetches on
    // the next expand.
    const cacheEntries = Object.entries(childrenBySessionId.value)
    if (cacheEntries.length > 0) {
      // Group the freshly-fetched sessions by parent so we can detect
      // new children for expanded parents in O(N) without extra
      // network calls.
      const byParent: Record<string, AgentSession[]> = {}
      for (const s of all) {
        const pid = s.parentSessionId
        if (!pid) continue
        ;(byParent[pid] ??= []).push(s)
      }
      const next: Record<string, AgentSession[]> = {}
      for (const [parentId, kids] of cacheEntries) {
        const updated = kids
          .map(k => {
            const fresh = byId[k.sessionId]
            // Flash the row when a sub-agent's status changed
            // since the last list poll, mirroring the behaviour
            // in [mergeSession] for top-level rows.
            if (fresh && fresh.status != null && fresh.status !== k.status) {
              markSessionStatusChanged(k.sessionId)
            }
            return fresh
          })
          .filter((s): s is AgentSession => !!s)
        // Only expanded parents pull in newly-spawned children from
        // this poll.  Doing it for every cached parent would defeat
        // the O(K) intent and could surprise users with rows
        // appearing under collapsed nodes.
        if (expandedSessionIds.value.has(parentId)) {
          const known = new Set(updated.map(s => s.sessionId))
          const freshKids = byParent[parentId]
          if (freshKids) {
            for (const nk of freshKids) {
              if (!known.has(nk.sessionId)) updated.push(nk)
            }
          }
        }
        // Keep the cache entry even if it becomes empty after the
        // merge — that signals "we know this parent has no
        // children" and avoids refetching on the next expand.
        next[parentId] = updated
      }
      childrenBySessionId.value = next
    }
    recordPollSuccess()
  } catch (e) {
    recordPollFailure(e)
  }
}

/**
 * Update or insert a single session in `sessions.value`.  Used
 * by the cheaper single-row poll.  New top-level sessions
 * land at the top of the list; sub-agents (opened from the
 * tree) just refresh in place inside the transient map.
 */
function applySessionUpdate(fresh: AgentSession) {
  const idx = sessions.value.findIndex(s => s.sessionId === fresh.sessionId)
  if (idx >= 0) {
    sessions.value[idx] = mergeSession(sessions.value[idx], fresh)
    return
  }
  if (fresh.parentSessionId) {
    // Sub-agent.  Only update the transient map (if we've already
    // loaded it via `selectSession`'s fallback).  We never
    // auto-promote a sub-agent to the top-level list — that would
    // be the same duplicate-row bug this whole refactor is here
    // to fix.  If the transient slot doesn't exist yet, drop the
    // update: the next list poll (or a future select) will pick
    // it up.
    const existing = transientSessionsById.value[fresh.sessionId]
    if (existing) {
      transientSessionsById.value = {
        ...transientSessionsById.value,
        [fresh.sessionId]: mergeSession(existing, fresh),
      }
    }
    return
  }
  // New top-level session.
  sessions.value.unshift(fresh)
}

/**
 * Field-by-field merge that preserves local-only fields (e.g.
 * the `name` the user has on a session they opened directly
 * via URL) while updating the volatile `status` /
 * `runtimeState` / `updatedAt` columns.
 *
 * When the merged `status` differs from the locally-cached one,
 * the row is flagged via [markSessionStatusChanged] so the
 * left-side session list briefly flashes in the new status
 * colour.  We compare against `local.status` (not the merged
 * value) so a no-op refresh where the backend echoes the same
 * status does NOT trigger a spurious flash.
 */
function mergeSession(local: AgentSession, fresh: AgentSession): AgentSession {
  const statusChanged = fresh.status != null && fresh.status !== local.status
  const merged: AgentSession = {
    ...local,
    status: fresh.status ?? local.status,
    runtimeState: fresh.runtimeState ?? local.runtimeState,
    updatedAt: fresh.updatedAt ?? local.updatedAt,
    sessionName: fresh.sessionName ?? local.sessionName,
    // closingReason / errorMessage are null-able and the backend
    // sends `null` (not `undefined`) when there is no error, so a
    // plain `?? local` would erase a real "no error anymore"
    // transition. We only keep the local value when the backend
    // omitted the field entirely (undefined).
    closingReason: fresh.closingReason !== undefined ? fresh.closingReason : local.closingReason,
    errorMessage: fresh.errorMessage !== undefined ? fresh.errorMessage : local.errorMessage,
  }
  if (statusChanged) {
    markSessionStatusChanged(local.sessionId)
  }
  return merged
}

function startStatusPolling() {
  stopStatusPolling()
  // Tick once immediately so the UI doesn't lag the backend
  // by a full interval on session switch.
  refreshActiveStatus()
  statusPollInterval = window.setInterval(refreshActiveStatus, STATUS_POLL_MS)
}

// ---- Tool confirmation (human-in-the-loop) ----

/**
 * Current pending confirmation for the active session, or `null`.
 *
 * Set by [refreshActiveStatus] when the session response includes a
 * `pendingConfirmation` field. Cleared when the backend no longer
 * reports one (i.e. the user responded or the tool timed out).
 */
const {
  pendingConfirmation,
  confirmationBusy,
  pendingChoice,
  choiceBusy,
  start: startHumanInTheLoop,
  stop: stopHumanInTheLoop,
  approve,
  deny,
  respondChoice
} = useHumanInTheLoop()

/** Name of the agent that raised the open confirmation, if known. */
const confirmationSessionName = computed(() => {
  const cs = pendingConfirmation.value
  if (!cs) return null
  return findSessionById(cs.sessionId)?.sessionName ?? cs.sessionId
})

/** Name of the agent that raised the open choice request, if known. */
const choiceSessionName = computed(() => {
  const cs = pendingChoice.value
  if (!cs) return null
  return findSessionById(cs.sessionId)?.sessionName ?? cs.sessionId
})

function stopStatusPolling() {
  if (statusPollInterval != null) {
    clearInterval(statusPollInterval)
    statusPollInterval = null
  }
}

function startListPolling() {
  stopListPolling()
  refreshAllStatuses()
  listPollInterval = window.setInterval(refreshAllStatuses, LIST_POLL_MS)
}

function stopListPolling() {
  if (listPollInterval != null) {
    clearInterval(listPollInterval)
    listPollInterval = null
  }
}

const sessionRenameOpen = ref(false)
const sessionNameDraft = ref('')
const sessionRenameInput = ref<HTMLInputElement | null>(null)
/** Programs of the active session's project, for the header picker. */
const projectPrograms = ref<string[]>([])
const programBusy = ref(false)

/** Rename the session picked in the sidebar: open it, then edit the title. */
async function renameFromMenu() {
  const id = ctxMenu.sessionId
  ctxMenu.show = false
  if (!id) return
  if (activeSessionId.value !== id) await selectSession(id)
  startSessionRename()
}

function startSessionRename() {
  sessionNameDraft.value = activeSessionName.value
  sessionRenameOpen.value = true
  nextTick(() => sessionRenameInput.value?.select())
}

function cancelSessionRename() {
  sessionRenameOpen.value = false
}

/** Persist the new name, then reflect it locally so the header settles now. */
async function saveSessionName() {
  if (!sessionRenameOpen.value) return
  const id = activeSessionId.value
  const name = sessionNameDraft.value.trim()
  sessionRenameOpen.value = false
  if (!id || !name || name === activeSessionName.value) return
  try {
    await agentApi.updateSession(id, { sessionName: name })
    const entry = findSessionById(id)
    if (entry) entry.sessionName = name
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Rename failed.'
  }
}

/** Load the program list of the active session's project. */
async function loadProjectPrograms() {
  const project = activeSessionMeta.value?.projectName
  if (!project) {
    projectPrograms.value = []
    return
  }
  try {
    const { data } = await projectApi.tree(project)
    projectPrograms.value = (data.entries ?? [])
      .filter(e => !e.folder)
      .map(e => e.path)
  } catch {
    projectPrograms.value = []
  }
}

/** Point the conversation at another program. */
async function onProgramChange(event: Event) {
  const id = activeSessionId.value
  const value = (event.target as HTMLSelectElement).value
  if (!id) return
  programBusy.value = true
  try {
    const { data } = await agentApi.updateSession(id, { programName: value || undefined })
    const entry = findSessionById(id)
    if (entry) entry.currentProgram = data.currentProgram ?? null
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Could not switch program.'
  } finally {
    programBusy.value = false
  }
}

async function selectSession(id: string) {
  activeSessionId.value = id
  errorMsg.value = ''
  messages.value = []
  selectedWakeIndex.value = -1
  tokenUsage.value = null
  loadingMessages.value = true
  // Stop previous polling
  if (messagePollInterval) { clearInterval(messagePollInterval); messagePollInterval = null }
  // Restart the per-session status poll so the chat-header pill
  // follows the new active session.
  stopStatusPolling()
  // Start the streaming-chunk poll IMMEDIATELY: it also clears the
  // previous session's streaming bubble, which must not linger while
  // the (potentially slow) getMessages below is in flight.
  startStreamPolling(id)
  void loadProjectPrograms()

  // Set model name from session info. If the session isn't in the list
  // (e.g. a sub-agent opened from the tree), fall back to a global
  // listing just for this id.  The fallback row is parked in
  // `transientSessionsById` (NOT unshifted into `sessions.value`) so
  // the left-side list stays a top-level-only view; the chat header
  // still finds it via `findSessionById` / `activeSessionMeta`.
  let session = findSessionById(id)
  if (!session) {
    // Try a "ALL" listing just for this id. If even that doesn't find it
    // (e.g. the user has lots of sessions and it fell off the page), we
    // still allow opening it: model name will simply be unknown.
    try {
      const { data } = await agentApi.listSessions(200, 0, 'ALL')
      session = (data.sessions || []).find(s => s.sessionId === id)
      if (session) {
        if (session.parentSessionId) {
          // Sub-agent: keep it out of the left-side list and store
          // it in the transient map.  `activeSessionMeta` and the
          // status pill will find it via `findSessionById`; the
          // status poll will refresh it in place via
          // `applySessionUpdate`.
          transientSessionsById.value = {
            ...transientSessionsById.value,
            [session.sessionId]: session,
          }
        } else {
          // Top-level session that simply hadn't shown up in
          // `sessions.value` yet (e.g. opened from the Tree modal
          // before the list poll caught up).  Insert it into the
          // canonical list.
          sessions.value.unshift(session)
        }
      }
    } catch { /* ignore */ }
  }
  sessionModelName.value = session?.modelName || ''
  // The picker must reflect the session's own model — a session keeps
  // using the same model across interruptions until the user
  // deliberately switches it (which /chat then persists).
  syncLlmPickerWithSession(session?.modelName)

  try {
    const { data } = await agentApi.getMessages(id)
    // Discard the result if the user switched sessions again while
    // this (potentially slow) fetch was in flight.
    if (activeSessionId.value !== id) return
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
  // Status poll goes LAST — it must read the up-to-date entry
  // that `selectSession` just merged in, otherwise the first
  // tick can re-fetch a row we already have.
  startStatusPolling()
}

async function deleteSession(id: string) {
  // Reject deletion of sessions that are still running.  The
  // backend also enforces this, but checking here gives the user
  // immediate feedback without a round-trip.
  const session = sessions.value.find(s => s.sessionId === id)
    ?? transientSessionsById.value[id]
    ?? Object.values(childrenBySessionId.value)
      .flat()
      .find(s => s.sessionId === id)
  if (session && !isTerminalStatus(session.status)) {
    alert('This session is still running. Please end the flow first before deleting.')
    return
  }
  if (!confirm('Delete this session and all of its sub-agent sessions?')) return
  // Reuse the session we already found above for parent lookup.
  const deleted = session
  try {
    await agentApi.deleteSession(id)
    sessions.value = sessions.value.filter((s) => s.sessionId !== id)
    // Drop from the transient map as well so a deleted sub-agent
    // no longer drives the chat header.
    if (transientSessionsById.value[id] !== undefined) {
      const next = { ...transientSessionsById.value }
      delete next[id]
      transientSessionsById.value = next
    }
    // Drop the deleted session from any cached children list so
    // the inline tree stops showing it.  Also drop the cache entry
    // for the parent so the next expand re-fetches with an
    // up-to-date child count.
    const cleaned: Record<string, AgentSession[]> = {}
    for (const [parentId, kids] of Object.entries(childrenBySessionId.value)) {
      const filtered = kids.filter(s => s.sessionId !== id)
      // Only keep the cache entry if the parent still has known
      // children OR the entry hasn't been confirmed-empty yet.
      if (filtered.length > 0 || childrenLoading.value.has(parentId)) {
        cleaned[parentId] = filtered
      }
    }
    childrenBySessionId.value = cleaned
    if (deleted?.parentSessionId) {
      invalidateChildrenFor(deleted.parentSessionId)
    }
    // Collapse the deleted session if it was expanded so the
    // child `<ul>` disappears immediately.
    if (expandedSessionIds.value.has(id)) {
      const next = new Set(expandedSessionIds.value)
      next.delete(id)
      expandedSessionIds.value = next
    }
    if (activeSessionId.value === id) {
      activeSessionId.value = null
      messages.value = []
      tokenUsage.value = null
    }
  } catch (e: any) {
    const status = e?.response?.status
    const msg = e?.response?.data?.error || e?.message || 'Failed to delete session'
    if (status === 409) {
      alert(msg)
    } else {
      console.error('Failed to delete session:', e)
    }
  }
}

/**
 * Optimistic user bubble awaiting DB confirmation.  The interactive
 * /chat turn runs in a freshly-spawned worker JVM, so the real user
 * row lands in agent_messages only several seconds after the request
 * starts; the 750 ms message poll would otherwise replace the list
 * without it and the bubble "flashes" out and back in.  refreshMessages
 * re-appends this bubble until the fetched transcript contains it.
 */
/**
 * User bubbles the server has not stored yet, keyed by session id.
 *
 * A turn that dies (dead model, failed worker) leaves no user row behind, so
 * the bubble has to survive switching away and back on the client side.
 */
const pendingOptimistic = new Map<string, AgentMessage>()

async function sendMessage() {
  if (!activeSessionId.value || !input.value.trim() || sending.value) return
  const content = input.value
  const sessionForSend = activeSessionId.value
  input.value = ''
  errorMsg.value = ''
  sendingSessionId.value = activeSessionId.value
  startMessagePolling(ACTIVE_CHAT_POLL_MS)

  // For transient injects, skip the optimistic message — a
  // temporary bubble that disappears on refresh would be confusing
  // since transient messages are not persisted to agent_messages.
  // For persistent injects and manual chat, keep the optimistic
  // bubble for immediate feedback.
  const skipOptimistic = isManagedSession.value && injectTransient.value

  // Optimistic user message (skipped for transient injects)
  const tempUser: AgentMessage | null = skipOptimistic ? null : {
    messageId: -Date.now(),
    messageIndex: messages.value.length,
    role: 'user',
    content: isManagedSession.value ? `[User hint] ${content}` : content,
    createdAt: new Date().toISOString()
  }
  if (tempUser) {
    messages.value.push(tempUser)
    // Track the bubble so periodic message polls keep it on screen
    // until the DB transcript actually contains the user row (the
    // manual-agent worker writes it only after its JVM + Ghidra boot,
    // several seconds in) — without this the bubble vanishes for a
    // few seconds right after sending.
    if (activeSessionId.value) pendingOptimistic.set(activeSessionId.value, tempUser)
  }
  await scrollToBottom()

  try {
    if (isManagedSession.value) {
      // Managed session (automated / standby / closed / error):
      // inject via mailbox, not synchronous chat.
      const res = await agentApi.inject(
        activeSessionId.value,
        content,
        injectTransient.value,
      )
      // The response confirms delivery; actual message appears
      // when the agent's next iteration drains the mailbox.
      // Transient messages are written to the session transcript
      // by the backend, so they appear in the exported record.
      if (res.data.resumed) {
        // Session was resumed from closed/error — restart polling
        // to pick up the new agent output.
        startMessagePolling(ACTIVE_CHAT_POLL_MS)
      }
    } else {
      // Manual chat session: synchronous /chat as before.  The
      // currently-picked model is sent along so a deliberate switch
      // is persisted server-side (the session otherwise keeps using
      // its original model, no matter how often it was interrupted).
      await agentApi.chat(
        activeSessionId.value,
        content,
        undefined,
        selectedLlmModel.value || undefined,
      )
      // Reflect a model switch locally right away — the header label
      // and the session-list entry would otherwise show the old model
      // until the next poll round-trip.
      if (selectedLlmModel.value) {
        sessionModelName.value = selectedLlmModel.value
        const entry = findSessionById(activeSessionId.value)
        if (entry) entry.modelName = selectedLlmModel.value
      }
    }
    // Reload all messages from server to capture tool calls too
    await refreshMessages()
  } catch (e: any) {
    if (e?.response?.status === 504) {
      // The reverse proxy timed out the synchronous /chat request,
      // but the agent worker keeps running server-side and persists
      // its output as it goes.  Do NOT drop the optimistic bubble or
      // restore the draft (the message was accepted — restoring it
      // invites a duplicate send); tell the user the turn is still
      // running and let the pollers pick up the output.
      errorMsg.value =
        'The agent is taking longer than the proxy timeout — the turn is still running and its output will appear automatically.'
    } else {
      if (tempUser) {
        messages.value = messages.value.filter((m) => m.messageId !== tempUser.messageId)
      }
      // The message stays on screen: whatever failed, the turn it belonged to
      // is part of the transcript.  Dropping it made the send look like it
      // never happened, and restoring the draft invited a duplicate.
      const detail = e?.response?.data?.error
      const reason = detail || e?.message || (isManagedSession.value ? 'Inject failed.' : 'Chat failed.')
      markInterruption(reason)
      errorMsg.value = reason
    }
  } finally {
    if (sendingSessionId.value === sessionForSend) sendingSessionId.value = null
    startMessagePolling()
  }
}

/**
 * The submit button doubles as the stop control while a turn runs.
 *
 * An empty composer stops the turn; a composer holding text stops it and then
 * sends what was typed, so a follow-up does not need a second click.
 */
async function onComposerStop() {
  if (!turnRunning.value) return
  const pending = input.value
  markInterruption(pending.trim() ? 'Conversation interrupted — new message sent' : 'Conversation stopped')
  await cancelChat()
  await waitUntilIdle()
  if (pending.trim()) await sendMessage()
}

interface LiveTool {
  id: string
  name: string
  args: string
  startedAt: number
}

/** Tool calls that are running right now, in start order. */
const liveTools = ref<LiveTool[]>([])
/** Bumped once a second so the live timers advance. */
const clockTick = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null

function startClock() {
  if (clockTimer) return
  clockTimer = setInterval(() => { clockTick.value = Date.now() }, 1000)
}

function stopClock() {
  if (!clockTimer) return
  clearInterval(clockTimer)
  clockTimer = null
}

/** Seconds a tool has been running, as a short label. */
function elapsedLabel(startedAt: number): string {
  const secs = Math.max(0, Math.round((clockTick.value - startedAt) / 1000))
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

/** Fold a tool_start / tool_end event into the live list. */
function applyToolEvent(kind: string, payload: string) {
  let info: { id?: string; name?: string; args?: string } | null = null
  try {
    info = JSON.parse(payload)
  } catch {
    return
  }
  const id = info?.id
  if (!id) return
  if (kind === 'tool_start') {
    if (!liveTools.value.some(t => t.id === id)) {
      liveTools.value = [
        ...liveTools.value,
        { id, name: info?.name ?? 'tool', args: info?.args ?? '', startedAt: Date.now() },
      ]
    }
    startClock()
  } else {
    liveTools.value = liveTools.value.filter(t => t.id !== id)
    if (!liveTools.value.length) stopClock()
  }
}

interface InterruptionNotice {
  /** Conversation the note belongs to; notes survive switching sessions. */
  sessionId: string
  afterId: number | null
  text: string
}

/** Notes pinned after the message that was on screen when the turn stopped. */
const interruptionNotices = ref<InterruptionNotice[]>([])

/** Notices whose anchor message is gone, or that arrived with no transcript. */
const danglingNotices = computed(() => {
  const ids = new Set(visibleMessages.value.map(m => m.messageId))
  return interruptionNotices.value.filter(
    n => n.sessionId === activeSessionId.value && (n.afterId === null || !ids.has(n.afterId)),
  )
})

function noticeAfter(messageId: number): string | null {
  return interruptionNotices.value.find(
    n => n.sessionId === activeSessionId.value && n.afterId === messageId,
  )?.text ?? null
}

function markInterruption(text: string) {
  const sessionId = activeSessionId.value
  if (!sessionId) return
  const last = visibleMessages.value[visibleMessages.value.length - 1]
  interruptionNotices.value = [
    ...interruptionNotices.value,
    { sessionId, afterId: last?.messageId ?? null, text },
  ]
}

/** Wait for the aborted turn to settle before reusing the composer. */
async function waitUntilIdle(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (sending.value && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 150))
  }
}

async function cancelChat() {
  if (!activeSessionId.value || !turnRunning.value) return
  try {
    await agentApi.cancelChat(activeSessionId.value)
    // Pull the new state immediately: the button has to leave "stop" as soon as
    // the backend confirms the turn is over, not on the next status tick.
    void loadSessions()
    errorMsg.value = ''
  } catch {
    // The process may have already finished; ignore errors.
  }
  // The sendMessage() call will return with an error once the
  // process is killed; sending.value will be reset there.
}

function onComposerKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    // While a turn runs the shortcut means "stop and send", matching the button.
    if (turnRunning.value) {
      if (input.value.trim()) void onComposerStop()
      return
    }
    void sendMessage()
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

/**
 * Detect a wake-event marker message written by the backend when
 * a STANDBY agent is resumed.  The backend writes a "user" message
 * with the prefix `[[AKIBA_WAKE_EVENT]]` followed by a human-
 * readable label describing who triggered the wake.
 *
 * Returns true when [m] is such a marker; the template renders a
 * separator divider instead of a chat bubble for these messages.
 */
const WAKE_EVENT_PREFIX = '[[AKIBA_WAKE_EVENT]]'

function isWakeEventMessage(m: AgentMessage): boolean {
  return m.role === 'user' &&
    (m.content ?? '').trimStart().startsWith(WAKE_EVENT_PREFIX)
}

const LLM_RETRY_STATUS_PREFIX = '__llm_retry_status__'

const retryingNow = ref(false)

function isLLMRetryStatusMessage(m: AgentMessage): boolean {
  return m.role === 'system' &&
    (m.content ?? '').startsWith(LLM_RETRY_STATUS_PREFIX)
}

// ============================================================
//  Live streaming via incremental poll + typewriter animation
// ============================================================
//
// The DB-based preview (`__llm_progress__` rows) can only deliver
// an update every few seconds because it goes through the DB.  The
// user explicitly asked for "natural per-token growth".  (An
// earlier SSE transport died at the outer reverse proxy, which
// kills `text/event-stream` connections — plain JSON GETs survive
// every proxy, so the transport here is short polling instead.)
//
// While a session is selected we poll
// `GET /api/agent/sessions/{id}/stream-chunks?since=N` once per
// second; the worker publishes every LLM chunk to the server's
// in-memory `StreamChunkBus` history, which this endpoint drains.
// Returned deltas are appended to [targetText]; a typewriter timer
// then grows [streamingText] character by character towards
// [targetText], so the user sees the response literally typing
// itself out even though the transport is batched once per second.
//
// When the worker emits `done`, we stop polling and refresh
// messages from the DB so the final assistant row (with full
// markdown rendering, tool calls, etc.) replaces the plain-text
// streaming bubble.
const streamingText = ref('')
const streamingChunkCount = ref(0)
const streamingActive = ref(false)
// Rendered-markdown view of [streamingText], refreshed on a
// throttle so the typewriter's 40 ms ticks don't each pay for a
// full markdown pass over a growing document.
const streamingHtml = ref('')

const STREAM_POLL_MS = 1000
const TYPEWRITER_TICK_MS = 40
const STREAM_RENDER_MS = 150
// No new stream text for this long → show a "waiting for model"
// stall spinner on the bubble (the backend only declares a stall
// after 90 s; the UI should hint much earlier).
const STREAM_STALL_HINT_MS = 10_000
// Non-null while the latest generation ended INTERRUPTED (done +
// error): the bubble keeps its partial content (dimmed) plus a
// one-shot marker with this message.
const streamInterruptedError = ref<string | null>(null)
// True while the stream is alive but no new text has arrived for
// STREAM_STALL_HINT_MS — drives the "waiting for model" spinner.
const streamStalled = ref(false)
// The backend labels a user-cancelled generation "cancelled by user";
// render a calm marker for it instead of the generic interruption
// error (which also promises a retry that will never come).
const streamInterruptedIsCancel = computed(() =>
  (streamInterruptedError.value ?? '').toLowerCase().includes('cancelled by user'))
let lastStreamChunkAt = 0

let streamPollTimer: number | null = null
let streamPollSession = ''
// Last `seq` applied to the bubble.  The server bus owns this counter and
// never restarts it, so a generation change cannot hide chunks: the new
// generation's first chunk is always > this cursor.
let streamPollSince = 0
let streamPollGeneration = -1 // -1 = not yet initialised
let streamPollInFlight = false
// Generation whose `done` we already handled.  The poll keeps
// running after a generation finishes (so the NEXT generation is
// picked up automatically), and the backend reports done=true on
// every poll until then — this guard fires the finish handling
// exactly once per generation.
let streamFinishedGeneration = -1

let targetText = ''
let typewriterTimer: number | null = null

function startStreamPolling(sessionId: string) {
  // Live state belongs to the session on screen: drop whatever the previous
  // session left behind before this one starts reporting.
  if (streamPollSession !== sessionId) {
    // Live tools belong to the turn on screen; notices are kept, they are part
    // of that conversation's record.
    liveTools.value = []
    stopClock()
  }
  // Always stop the previous poller — switching sessions must not
  // leak chunks from the old session into the new one's bubble.
  stopStreamPolling()
  streamingText.value = ''
  streamingHtml.value = ''
  streamingThinkHtml.value = ''
  streamThinkingActive.value = false
  streamingChunkCount.value = 0
  streamInterruptedError.value = null
  streamStalled.value = false
  lastStreamChunkAt = Date.now()
  targetText = ''
  streamPollSession = sessionId
  streamPollSince = 0
  streamPollGeneration = -1
  streamFinishedGeneration = -1
  streamingActive.value = true
  // Immediate first poll so there's no 1-second dead time, then
  // settle into the regular cadence.  The poll intentionally runs
  // for as long as the session is selected — an idle poll costs an
  // ~83-byte response per second, and keeping it alive is what lets
  // the SECOND and later LLM generations appear without any
  // additional wiring.
  pollStreamChunksOnce()
  streamPollTimer = window.setInterval(pollStreamChunksOnce, STREAM_POLL_MS)
}

function stopStreamPolling() {
  if (streamPollTimer != null) {
    window.clearInterval(streamPollTimer)
    streamPollTimer = null
  }
  stopTypewriter()
  streamStalled.value = false
  streamInterruptedError.value = null
  streamingActive.value = false
}

async function pollStreamChunksOnce() {
  if (streamPollInFlight || !streamPollSession) return
  streamPollInFlight = true
  try {
    const { data } = await agentApi.getStreamChunks(streamPollSession, streamPollSince)
    const firstContact = streamPollGeneration === -1
    if (!firstContact && data.generation !== streamPollGeneration) {
      // A new LLM generation started — discard the old text and any
      // interrupted marker.  The cursor is intentionally NOT reset:
      // the backend's seq never restarts, so everything this response
      // carries belongs to the new generation and is applied below.
      // (Resetting to 0 and returning here was the bug that dropped the
      // new generation's early chunks for one whole poll interval.)
      streamPollGeneration = data.generation
      targetText = ''
      streamingText.value = ''
      streamingHtml.value = ''
      streamingThinkHtml.value = ''
      streamThinkingActive.value = false
      streamingChunkCount.value = 0
      streamInterruptedError.value = null
      streamStalled.value = false
      lastStreamChunkAt = Date.now()
    }
    streamPollGeneration = data.generation
    if (firstContact && data.done && !data.error) {
      // We selected a session whose current generation already
      // FINISHED CLEANLY before we started watching (e.g. switching
      // into an agent mid-run that then completed, or reopening a
      // finished session).  Don't replay the stream — the canonical
      // assistant row is already in the DB.  (An INTERRUPTED
      // generation — done + error — falls through instead: its
      // partial content exists ONLY in the stream history, so we
      // render it and mark the bubble interrupted.)
      streamFinishedGeneration = data.generation
      streamPollSince = data.latestSeq ?? data.latestCount ?? streamPollSince
      refreshMessages()
      return
    }
    let gotNewChunks = false
    for (const chunk of data.chunks ?? []) {
      // Cursor follows the server-assigned seq, not the per-generation
      // chunkCount, so a chunk that only marks the end of a generation
      // still advances it.
      if (typeof chunk.seq === 'number') {
        if (chunk.seq > streamPollSince) streamPollSince = chunk.seq
      } else if (chunk.chunkCount > streamPollSince) {
        streamPollSince = chunk.chunkCount
      }
      // Tool lifecycle events share the stream but are not answer text:
      // they drive the live tool cards instead of the typewriter.
      if (chunk.kind === 'tool_start' || chunk.kind === 'tool_end') {
        applyToolEvent(chunk.kind, chunk.delta)
        gotNewChunks = true
        continue
      }
      if (chunk.delta) {
        appendToTypewriter(chunk.delta)
        gotNewChunks = true
      }
      if (chunk.chunkCount > 0) streamingChunkCount.value = chunk.chunkCount
    }
    // Stall indicator: the stream is alive (not done) but no new
    // text has arrived for a while — the provider is thinking /
    // being rescheduled.  Show a spinner so the user can tell this
    // apart from a dead stream.  Cleared as soon as text resumes.
    if (gotNewChunks) {
      lastStreamChunkAt = Date.now()
      streamStalled.value = false
    } else if (!data.done && targetText !== '' &&
               Date.now() - lastStreamChunkAt > STREAM_STALL_HINT_MS) {
      streamStalled.value = true
    }
    // Terminal handling.  A generation ends in one of two ways:
    //  - CLEAN (done, no error): swap the bubble for the canonical
    //    DB row (finishStreaming clears it).
    //  - INTERRUPTED (done + error, e.g. "streaming chat stalled"
    //    when the provider silently drops mid-response): KEEP the
    //    partial content on screen and show a one-shot interrupted
    //    marker.  The marker is a separate element (NOT text
    //    appended to the bubble), so the once-per-second poll can't
    //    spam it the way inline "[stream error]" lines did.  When
    //    the retry starts a new generation, the reset branch above
    //    clears both the text and the marker.
    if (data.done && data.generation !== streamFinishedGeneration) {
      streamFinishedGeneration = data.generation
      finishStreaming(data.error)
    }
  } catch {
    // Transient failure (server restarting, etc.) — the next tick retries.
  } finally {
    streamPollInFlight = false
  }
}

function finishStreaming(error?: string | null) {
  const finishedSession = streamPollSession
  // NOTE: the poll is NOT stopped here.  It keeps running so the
  // next LLM generation (the agent's next turn) is picked up
  // automatically — stopping it was the bug that made only the
  // first message stream.
  stopTypewriter()
  streamStalled.value = false

  if (error) {
    // INTERRUPTED generation: keep the partial content on screen.
    // The worker discarded its textBuffer (after persisting it to
    // the DB as an __interrupted_partial__ row), so the stream
    // history is the only place the user can watch the partial
    // text until the 3 s message poll picks up the DB row.  Freeze
    // the typewriter at the final text, render it, and flag the
    // bubble as interrupted (dimmed background + one-shot marker).
    // Do NOT clear anything and do NOT refreshMessages — there is
    // no canonical row for this generation.
    streamingText.value = targetText
    renderStreamingNow()
    streamInterruptedError.value = error
    return
  }

  // CLEAN finish: flush the COMPLETE text into the bubble first, then
  // swap it for the canonical DB row only once a refresh actually
  // contains a newer assistant row.  (Previously the bubble was
  // cleared immediately: whatever the typewriter had not typed yet
  // vanished, and the row appeared up to a poll later — the final
  // answer looked truncated and then jumped.)
  streamInterruptedError.value = null
  const finalText = targetText
  const lastRowIdBefore = messages.value[messages.value.length - 1]?.messageId
  targetText = ''
  streamingChunkCount.value = 0
  streamingText.value = finalText
  renderStreamingNow()
  let attempts = 0
  const swapTimer = window.setInterval(async () => {
    // Abort if the user switched sessions or a newer generation has
    // already taken over the bubble.
    if (activeSessionId.value !== finishedSession ||
        streamingText.value !== finalText) {
      window.clearInterval(swapTimer)
      return
    }
    attempts++
    await refreshMessages()
    const last = messages.value[messages.value.length - 1]
    const rowArrived = last?.role === 'assistant' && last.messageId !== lastRowIdBefore
    if (rowArrived || attempts >= 10) {
      window.clearInterval(swapTimer)
      streamingText.value = ''
      streamingHtml.value = ''
      streamingThinkHtml.value = ''
      streamThinkingActive.value = false
    }
  }, 300)
}

/**
 * Retire the live bubble once the transcript already holds the answer.
 *
 * A fast provider finishes the text long before the typewriter has drained its
 * buffer, so the completed message appeared above while the same words were
 * still being typed below. The stored row is the authority: as soon as it
 * covers what is on screen, the bubble has nothing left to say.
 */
function settleStreamIfPersisted(rows: Array<{ role: string; content?: string | null }>) {
  if (!streamingActive.value || !streamPollSession) return
  const last = rows[rows.length - 1]
  if (!last || last.role !== 'assistant') return
  const stored = (last.content ?? '').trim()
  const typed = (targetText || streamingText.value).trim()
  // A mid-turn tool-call row is shorter than the answer still being streamed;
  // clearing on it would swallow the rest of the generation.
  if (stored && typed && !typed.startsWith(stored)) return
  targetText = ''
  streamingChunkCount.value = 0
  stopTypewriter()
  streamingText.value = ''
  streamingHtml.value = ''
  streamingThinkHtml.value = ''
  streamThinkingActive.value = false
}

// ---- typewriter animation ----------------------------------------
function appendToTypewriter(delta: string) {
  targetText += delta
  ensureTypewriter()
}

// ---- throttled markdown rendering of the streaming bubble ---------
//
// The bubble shows rendered markdown (bold, code, lists) rather
// than raw text.  Rendering runs at most once per STREAM_RENDER_MS
// — the typewriter adds characters every 40 ms and a full markdown
// pass per tick would be wasted work; 150 ms still looks instant.
// Incomplete syntax (an unclosed ** or ``` fence mid-stream)
// renders best-effort, the same way the final message renders once
// the stream completes.
//
// Reasoning-channel handling: models that emit <think>…</think>
// blocks would otherwise have their whole chain-of-thought typed
// out as ordinary body text (making responses look absurdly long).
// When the stream STARTS with a think tag, the reasoning is split
// into a collapsible "Thought process" window above the body:
// expanded while the model is still thinking, auto-collapsed once
// </think> arrives (the user can re-open it manually).
const streamingThinkHtml = ref('')
// True while the opening think tag has no closing tag yet.
const streamThinkingActive = ref(false)

let streamingRenderTimer: number | null = null

/**
 * Split a streaming text into its leading reasoning block and the
 * visible body.  Returns { think, body, inProgress }:
 *  - think:     text inside the leading <think>…</think> ('' if none)
 *  - body:      everything after the closing tag ('' while unclosed)
 *  - inProgress: think tag opened but not yet closed
 */
function splitThinkBlock(text: string): { think: string; body: string; inProgress: boolean } {
  const open = /^\s*<\s*think(?:ing)?\s*[^>]*>/i.exec(text)
  if (!open) return { think: '', body: text, inProgress: false }
  const rest = text.slice(open[0].length)
  const close = /<\s*\/\s*think(?:ing)?\s*>/i.exec(rest)
  if (!close) return { think: rest, body: '', inProgress: true }
  return {
    think: rest.slice(0, close.index),
    body: rest.slice(close.index + close[0].length),
    inProgress: false,
  }
}

function renderStreamingNow() {
  const { think, body, inProgress } = splitThinkBlock(streamingText.value)
  streamThinkingActive.value = inProgress
  streamingThinkHtml.value = think ? renderMarkdown(think) : ''
  streamingHtml.value = body ? renderMarkdown(body) : ''
}

function scheduleStreamingRender() {
  if (streamingRenderTimer != null) return
  streamingRenderTimer = window.setTimeout(() => {
    streamingRenderTimer = null
    renderStreamingNow()
  }, STREAM_RENDER_MS)
}

function ensureTypewriter() {
  if (typewriterTimer != null) return
  typewriterTimer = window.setInterval(() => {
    if (streamingText.value.length >= targetText.length) {
      stopTypewriter()
      return
    }
    // Catch-up jump: when we started watching a stream that was
    // ALREADY well underway (e.g. the user switched into an agent
    // mid-generation), replaying thousands of characters through the
    // typewriter would take ages.  Jump to near the end and let only
    // the tail type out, so the bubble still feels alive.
    if (streamingText.value === '' && targetText.length > 200) {
      streamingText.value = targetText.slice(0, targetText.length - 120)
    }
    // Catch up faster the further we lag behind so a large burst
    // doesn't take forever, while a small burst still looks typed.
    const lag = targetText.length - streamingText.value.length
    const step = Math.max(1, Math.min(12, Math.floor(lag / 15)))
    streamingText.value = targetText.slice(0, streamingText.value.length + step)
    scheduleStreamingRender()
    // Auto-scroll so the growing bubble stays in view.
    scrollToBottom()
  }, TYPEWRITER_TICK_MS)
}

function stopTypewriter() {
  if (typewriterTimer != null) {
    window.clearInterval(typewriterTimer)
    typewriterTimer = null
  }
}

function isLastVisibleMessage(m: AgentMessage): boolean {
  const msgs = visibleMessages.value
  return msgs.length > 0 && msgs[msgs.length - 1].messageId === m.messageId
}

async function retryNow() {
  if (!activeSessionId.value || retryingNow.value) return
  retryingNow.value = true
  try {
    await agentApi.retryNow(activeSessionId.value)
  } catch {
    // Session may not be in this runtime — ignore
  } finally {
    retryingNow.value = false
  }
}

function isLLMRetryRecovered(m: AgentMessage): boolean {
  return (m.content ?? '').includes('status=recovered')
}

// ============================================================
//  LLM in-flight progress heartbeat
// ============================================================
//
// The backend's `callLLM` writes a `__llm_progress__` system row
// every 15 s while a single LLM call is running.  Without these,
// long-form generations (60+ s) look identical to a frozen agent —
// the user has no signal that work is still happening.
//
// We render only the LATEST heartbeat row; older ones are just
// no-ops in the chat list.  The countdown ticks via the same
// `nowTick` ref the LLM-retry banner uses, so the elapsed time
// refreshes every second without extra polling.

const LLM_PROGRESS_PREFIX = '__llm_progress__'

function isLLMProgressMessage(m: AgentMessage): boolean {
  return m.role === 'system' &&
    (m.content ?? '').startsWith(LLM_PROGRESS_PREFIX)
}

/**
 * Marker prefix the backend writes in front of the PARTIAL output
 * of an interrupted LLM streaming call (provider stall / drop).
 * The row uses role="assistant" so it stays in the LLM context —
 * the retry reads it back and can build on the partial work.  The
 * UI renders it with a dimmed background + an "interrupted
 * partial" badge, and strips the prefix from the displayed text.
 */
const INTERRUPTED_PARTIAL_PREFIX = '__interrupted_partial__'

function isInterruptedPartialMessage(m: AgentMessage): boolean {
  return m.role === 'assistant' &&
    (m.content ?? '').startsWith(INTERRUPTED_PARTIAL_PREFIX)
}

/** Message text with internal wire prefixes stripped for display. */
function displayContent(m: AgentMessage): string {
  const c = m.content ?? ''
  return isInterruptedPartialMessage(m) ? c.slice(INTERRUPTED_PARTIAL_PREFIX.length) : c
}

/**
 * Regeneration-instruction rows: internal directives telling the
 * LLM to regenerate from scratch after an interrupted stream
 * (prevents "seamless continuation" producing two unparseable
 * halves of a tool_call).  They exist for the model, not the
 * user — hidden from the chat like the progress heartbeats.
 */
const RETRY_INSTRUCTION_PREFIX = '__retry_instruction__'

function isRetryInstructionMessage(m: AgentMessage): boolean {
  return (m.content ?? '').startsWith(RETRY_INSTRUCTION_PREFIX)
}

function isLLMProgressDone(m: AgentMessage): boolean {
  const c = m.content ?? ''
  return c.includes('status=done') || c.includes('status=failed')
}

/**
 * Latest non-done progress heartbeat across ALL messages, or null
 * if no in-flight call is running.  The raw heartbeat rows are
 * hidden from the chat (see [visibleMessages]); this drives the
 * single compact in-flight indicator rendered above the streaming
 * bubble.  Computed over `messages` (not the filtered visible
 * list) so it keeps working now that the rows are hidden.
 */
const latestLLMProgress = computed<AgentMessage | null>(() => {
  const msgs = messages.value
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (!isLLMProgressMessage(m)) continue
    if (isLLMProgressDone(m)) return null   // burst finished
    return m
  }
  return null
})

function llmProgressLabel(m: AgentMessage, _nowTick?: number): string {
  const content = m.content ?? ''
  if (isLLMProgressDone(m)) {
    return content.includes('status=done')
      ? 'LLM call finished.'
      : 'LLM call failed.'
  }
  // Two formats exist on the wire:
  //  - Heartbeat coroutine:  "elapsedMs=N status=in_flight"
  //  - Streaming preview:    "status=in_flight chunkCount=N byteCount=K preview=..."
  // Parse whichever is present.  Preview shows a trailing slice of the
  // response being generated so the user sees progress in real time.
  const elapsedMatch = content.match(/elapsedMs=(\d+)/)
  const chunkMatch = content.match(/chunkCount=(\d+)/)
  const byteMatch = content.match(/byteCount=(\d+)/)
  const previewMatch = content.match(/preview=(.*)$/)

  const parts: string[] = []
  if (elapsedMatch) parts.push(`${formatDuration(parseInt(elapsedMatch[1]))} elapsed`)
  if (chunkMatch) parts.push(`${chunkMatch[1]} chunks`)
  if (byteMatch) parts.push(`${formatBytes(parseInt(byteMatch[1]))}`)
  const head = parts.length > 0
    ? `LLM is still working… (${parts.join(', ')})`
    : 'LLM is still working…'

  if (previewMatch && previewMatch[1].trim()) {
    return `${head}\n▸ ${previewMatch[1].trim()}`
  }
  return head
}

function llmRetryLabel(m: AgentMessage, _nowTick?: number): string {
  const content = m.content ?? ''
  if (isLLMRetryRecovered(m)) {
    const match = content.match(/retry=(\d+)/)
    const n = match ? match[1] : '?'
    return `LLM connection recovered after retry #${n}.`
  }
  // Context-overflow emergency compaction marker (written by the retry
  // loop after 2 consecutive context-length rejections).
  if (content.includes('action=context-compacted')) {
    return 'Context length exceeded — compacted the conversation context, retrying…'
  }
  // Parse retry count and backoff
  const retryMatch = content.match(/retry=(\d+)/)
  const backoffMatch = content.match(/backoffMs=(\d+)/)
  const nextRetryMatch = content.match(/nextRetryEpochMs=(\d+)/)
  const errorMatch = content.match(/error=(.*)/)

  const retryNum = retryMatch ? parseInt(retryMatch[1]) : '?'
  const backoffMs = backoffMatch ? parseInt(backoffMatch[1]) : 0
  const backoffLabel = formatDuration(backoffMs)
  const errorMsg = errorMatch ? errorMatch[1] : 'unknown error'

  // If we have the next-retry epoch, show a countdown
  if (nextRetryMatch) {
    const nextRetryEpoch = parseInt(nextRetryMatch[1])
    const remaining = nextRetryEpoch - Date.now()
    if (remaining > 0) {
      const remainingLabel = formatDuration(remaining)
      return `LLM request failed (${errorMsg}). Retry #${retryNum} in ${remainingLabel} (total wait ${backoffLabel}).`
    }
  }
  return `LLM request failed (${errorMsg}). Retry #${retryNum} scheduled (wait ${backoffLabel}).`
}

function wakeEventLabel(m: AgentMessage): string {
  const content = (m.content ?? '').trim()
  // Strip the prefix and any leading whitespace.
  const after = content.slice(WAKE_EVENT_PREFIX.length).trim()
  return after || 'Woken from standby'
}

/**
 * Segment messages into wake groups.  Each segment starts at a
 * wake-event message (or the very first message if no wake event
 * precedes it).  Returns an array of objects with `index`, `label`,
 * and `messageIds` (a Set for O(1) membership check).
 *
 * Used by the wake selector dropdown and by [visibleMessages].
 */
const wakeSegments = computed(() => {
  const segs: Array<{ index: number; label: string; messageIds: Set<number>; wakeMessageId?: number }> = []
  let currentSeg: { index: number; label: string; messageIds: Set<number>; wakeMessageId?: number } | null = null

  for (const m of messages.value) {
    if (isWakeEventMessage(m)) {
      // Start a new segment. Store the wake marker's own messageId so
      // filtering can include exactly this marker. Labels are not unique
      // (e.g. many cycles can be "Woken by system"), so label-based
      // matching can accidentally pull separators from earlier/later wakes.
      if (currentSeg) segs.push(currentSeg)
      currentSeg = {
        index: segs.length,
        label: wakeEventLabel(m),
        messageIds: new Set([m.messageId]),
        wakeMessageId: m.messageId,
      }
    } else {
      if (!currentSeg) {
        // Messages before any wake event belong to the initial segment.
        currentSeg = {
          index: 0,
          label: 'Initial',
          messageIds: new Set(),
        }
      }
      currentSeg.messageIds.add(m.messageId)
    }
  }
  if (currentSeg) segs.push(currentSeg)
  return segs
})

/**
 * Messages visible in the chat list.  When [selectedWakeIndex] is
 * -1 ("All"), returns all messages.  Otherwise returns only
 * messages belonging to the selected wake segment, interleaved
 * with the wake-event separator for context.
 */
const visibleMessages = computed(() => {
  // `__llm_progress__` heartbeat rows are internal debug signals:
  // they exist so the backend can prove an LLM call is alive, but
  // as chat bubbles they are noise (one row per 15 s, raw key=value
  // text).  The streaming bubble + the compact in-flight indicator
  // above it carry the same information in a readable form, so the
  // raw rows are filtered out of the chat entirely.
  const base = selectedWakeIndex.value === -1
    ? messages.value
    : (() => {
        const seg = wakeSegments.value[selectedWakeIndex.value]
        if (!seg) return messages.value
        // Include exactly this segment's wake-event marker plus all messages in
        // the segment. Do NOT match wake markers by label: labels are often
        // duplicated across cycles (e.g. repeated "Woken by system"), which made
        // older/later wake separators appear in the wrong filtered view.
        return messages.value.filter(m => seg.messageIds.has(m.messageId))
      })()
  return base.filter(m => !isLLMProgressMessage(m) && !isRetryInstructionMessage(m))
})

// Start/stop the 1-second tick timer based on whether the latest
// visible message is an active (non-recovered) LLM retry notice OR
// an in-flight LLM progress heartbeat.  This drives the countdown
// text for both without polling the server faster.
watch([visibleMessages, latestLLMProgress], ([msgs, latestProgress]) => {
  const last = msgs[msgs.length - 1]
  const needRetry = !!last && isLLMRetryStatusMessage(last) && !isLLMRetryRecovered(last)
  const needProgress = latestProgress != null
  const need = needRetry || needProgress
  if (need && !nowTickInterval) {
    nowTickInterval = window.setInterval(() => { nowTick.value = Date.now() }, 1000)
  } else if (!need && nowTickInterval) {
    clearInterval(nowTickInterval)
    nowTickInterval = null
  }
}, { immediate: true })

/**
 * Collapsed summary line for a tool-call message.
 *
 * For `script_library` calls we surface the concrete script name (and the
 * action) directly in the collapsed `<summary>` so the user doesn't have to
 * expand the call to know *which* script ran — e.g.
 * "🛠 script_library · run: disassemble_function".  For any other tool we
 * keep the legacy `🛠 <name>` form.
 */
function toolSummary(m: AgentMessage): string {
  const name = m.toolName || 'tool'
  if (name === 'script_library') {
    const args = parseToolArgs(m.toolResult || m.content || '')
    if (args) {
      const action = args['action'] as string | undefined
      const scriptName = args['scriptName'] as string | undefined
      if (action && scriptName) {
        return `🛠 ${name} · ${action}: ${scriptName}`
      }
      if (scriptName) {
        return `🛠 ${name} · ${scriptName}`
      }
      if (action === 'search') {
        const keyword = args['keyword'] as string | undefined
        return `🛠 ${name} · search ${keyword ? `"${keyword}"` : '(all)'}`
      }
      if (action) {
        return `🛠 ${name} · ${action}`
      }
    }
  }
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


async function openChildSession(sessionId: string) {
  // The "Open child session transcript" button on a sub-agent tool
  // message simply switches the active session.
  await selectSession(sessionId)
}

// ============================================================
// Active-session derived UI state
// ============================================================

const activeSessionMeta = computed<AgentSession | undefined>(() =>
  findSessionById(activeSessionId.value)
)

const activeSessionName = computed(() => {
  const meta = activeSessionMeta.value
  if (!meta) return ''
  return meta.sessionName || 'Untitled'
})

/**
 * The error message to display in the chat-header error banner.
 *
 * Implementation: a **sticky ref** updated by a watcher, NOT a
 * computed.  Using a computed caused the banner to flicker on every
 * status poll — the two pollers (`refreshActiveStatus` at 3s and
 * `refreshAllStatuses` at a slower cadence) each replace
 * `sessions.value`, which re-evaluates `activeSessionMeta`, which
 * re-evaluates the computed.  If one poll's merged session object
 * momentarily lacks `errorMessage` (e.g. the backend omits null
 * fields from JSON, or a network hiccup returns stale data), the
 * computed briefly returns `''`, the `v-if` unmounts the banner,
 * and the next poll re-mounts it — a visible flash every few
 * seconds.
 *
 * The watcher fixes this by only **clearing** the message when the
 * session genuinely transitions out of error state or the user
 * switches sessions.  Transient empty polls do NOT clear it.
 */
const dismissedErrorSession = ref<string | null>(null)
const activeSessionErrorMessage = ref('')

watch(
  [activeSessionMeta, dismissedErrorSession],
  ([meta, dismissed]) => {
    if (!meta) {
      activeSessionErrorMessage.value = ''
      return
    }
    const s = (meta.status ?? '').toLowerCase()
    const isError = s === 'error' || s === 'failed'
    if (!isError) {
      // Session is no longer in an error state — clear.
      activeSessionErrorMessage.value = ''
      return
    }
    if (dismissed === meta.sessionId) {
      activeSessionErrorMessage.value = ''
      return
    }
    // Only SET the message when we actually have one; a transient
    // empty poll does NOT clear the last known error.
    const msg = meta.errorMessage?.trim() || meta.closingReason?.trim() || ''
    if (msg) {
      activeSessionErrorMessage.value = msg
    }
  },
  { immediate: true },
)

// ---- Conversation panel (mailbox threads) -----------------------------------
//
// The right-side panel is a real-time window into the agent's
// mailbox: it lists every conversation the active session is a
// participant in, and lets the user expand one to see the full
// message history.  The panel polls the backend on a slow cadence
// (CONV_POLL_MS) so the list stays current while the user is
</script>

<style scoped>
.agent-page {
  display: flex;
  gap: 20px;
  height: calc(100vh - 140px);
  min-height: 480px;
}

/* ---- Session list (left-side collapsible) ----
   Layout: a flex row whose collapsed state is just the 36px-wide
   `session-list-toggle` button on the right edge, and whose expanded
   state adds a 244px-wide content area on the left. Mirrors the
   right-side `.conv-panel` for visual symmetry. The 36px handle
   always shows the current session count as a badge so the user can
   see "there's stuff to look at" even when collapsed. */
.session-list {
  display: flex;
  flex-direction: row;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
  overflow: hidden;
  transition: width 0.2s ease;
  width: 36px;
}
.session-list-open {
  width: 280px;
}
.session-list-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  /* No overflow here.  We push overflow onto a child
     `.session-list-scroll` so the hover card pinned at the
     bottom of this flex column can never be clipped, and its
     width stays aligned with the panel's inner padding. */
  min-width: 0;
  min-height: 0;
}

/*
  Scroll container that holds the actual list of sessions.
  `min-height: 0` is required for a flex child to be allowed to
  shrink below its content size — otherwise the parent flex
  column would not constrain the scroll and the list would push
  the hover card off-screen.
*/
.session-list-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  /* Give the list a little breathing room at the bottom so the
     last row is not flush against the hover card when both are
     visible. */
  padding-bottom: 4px;
}

/*
  Sticky hover card.  Pinned to the bottom of the flex column
  inside `.session-list-content`, so its width is automatically
  bound by the panel's inner padding (no overflow, no
  misalignment).  The card has its own subtle background and a
  top border so the user can tell where the list ends and the
  detail panel begins.

  Inside the card, info is laid out vertically:
    [ status-row ............ ]
    [ 🧩 sub-agent  module   ]
    [ 12:34:56              ]

  Wrapping inside the card is allowed, so even if a tag name is
  long, the card grows downward instead of overflowing the
  panel.
*/
.session-hover-card {
  flex: 0 0 auto;
  margin-top: 8px;
  padding: 8px 10px;
  background: #f8f9fb;
  border: 1px solid #e8eaee;
  border-radius: 6px;
  box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  /* Tint the card's left rail to match the session's state,
     echoing the same palette as the row's border. */
  border-left-width: 3px;
}
.session-hover-card .hover-card-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
  color: #555;
  min-width: 0;
}
.session-hover-card .hover-card-time {
  color: #888;
  font-variant-numeric: tabular-nums;
}
.session-hover-card .hover-card-uuid {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: #666;
  /* Wrap long UUIDs to multiple lines instead of overflowing the
     ~244px card width.  `word-break: break-all` makes sure a long
     hex string still wraps cleanly. */
  word-break: break-all;
}
.session-hover-card .hover-card-uuid-label {
  flex-shrink: 0;
  color: #888;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.session-hover-card .hover-card-uuid-value {
  font-family: 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 10px;
  color: #444;
  background: #fff;
  border: 1px solid #e0e2e6;
  border-radius: 3px;
  padding: 1px 4px;
  /* Allow the long UUID to wrap inside the bordered chip rather
     than escape the card's width. */
  word-break: break-all;
  cursor: text;
  user-select: all;
}
.session-hover-card .subagent-tag {
  color: #5e35b1;
  background: #ede7f6;
  font-size: 10px;
  border-radius: 3px;
  padding: 1px 5px;
  font-weight: 500;
}
.session-hover-card .module-tag {
  color: #455a64;
  background: #eceff1;
  font-size: 10px;
  border-radius: 3px;
  padding: 1px 5px;
  font-weight: 500;
}

/* State-coloured left rail.  Matches the palette used on
   `.session-tree-item` rows so the user can visually associate
   the row with its hover card at a glance. */
.session-hover-card.status-running    { border-left-color: #1976d2; }
.session-hover-card.status-msghandle  { border-left-color: #7b1fa2; }
.session-hover-card.status-standby    { border-left-color: #9e9e9e; }
.session-hover-card.status-cancelling { border-left-color: #ff9800; }
.session-hover-card.status-closed     { border-left-color: #4caf50; }
.session-hover-card.status-completed  { border-left-color: #4caf50; }
.session-hover-card.status-cancelled  { border-left-color: #fbc02d; }
.session-hover-card.status-failed     { border-left-color: #f44336; }
.session-hover-card.status-error      { border-left-color: #f44336; }
.session-hover-card.status-unknown    { border-left-color: #d0d0d0; }
.session-list-toggle {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  width: 36px;
  padding: 10px 0;
  background: none;
  border: none;
  border-left: 1px solid #e8e8e8;
  cursor: pointer;
  flex-shrink: 0;
  color: #555;
  font-size: 12px;
}
.session-list-toggle:hover {
  background: #eef5ff;
}
.session-list-toggle-icon {
  font-size: 10px;
  color: #999;
}
.session-list-toggle-label {
  position: relative;
  font-size: 15px;
}
.session-list-count {
  position: absolute;
  top: -4px;
  right: -10px;
  background: #e94560;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  border-radius: 8px;
  padding: 1px 5px;
  min-width: 14px;
  text-align: center;
  line-height: 1.2;
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

/* ---------------------------------------------------------------
   `status-row` — session-list badge with a leading pulse dot for
   non-terminal states.  Slightly larger and more saturated than
   the legacy `.status` pill so a glance at the list tells the
   user "this session is doing something right now".
   --------------------------------------------------------------- */
.status-row {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 9px;
  background: #f0f0f0;
  color: #555;
  line-height: 1;
  letter-spacing: 0.2px;
}
.status-row .status-row-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex: 0 0 auto;
  box-shadow: 0 0 0 0 currentColor;
  animation: statusRowPulse 1.4s ease-in-out infinite;
}
@keyframes statusRowPulse {
  0%, 100% { opacity: 0.45; box-shadow: 0 0 0 0 currentColor; }
  50%      { opacity: 1;    box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.18); }
}
.status-row.status-row-active {
  background: #e3f2fd;
  color: #1976d2;
  box-shadow: 0 0 0 1px rgba(25, 118, 210, 0.18);
}
.status-row.closed,
.status-row.completed {
  background: #e8f5e9;
  color: #2e7d32;
  box-shadow: none;
}
.status-row.cancelled {
  background: #f5f5f5;
  color: #777;
  box-shadow: none;
}
.status-row.error,
.status-row.failed {
  background: #ffebee;
  color: #c62828;
  box-shadow: none;
}
.status-row.cancelling {
  background: #fff3e0;
  color: #e65100;
}
.status-row.msghandle {
  background: #ede7f6;
  color: #5e35b1;
}

/* ---------------------------------------------------------------
   `status-pill` — the prominent badge in the chat header.
   Larger, stronger colours, and an animated dot for non-terminal
   states.  The pill is the single most glanceable indicator of
   "what is my agent doing right now?" and stays in sync with the
   backend via the 3-second status poll.
   --------------------------------------------------------------- */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 999px;
  background: #f0f0f0;
  color: #555;
  line-height: 1;
  letter-spacing: 0.3px;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  user-select: none;
}
.status-pill .status-pill-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: currentColor;
  flex: 0 0 auto;
  box-shadow: 0 0 0 0 currentColor;
  animation: statusPillPulse 1.4s ease-in-out infinite;
}
.status-pill .status-pill-label {
  display: inline-block;
}
@keyframes statusPillPulse {
  0%, 100% { opacity: 0.5; box-shadow: 0 0 0 0 currentColor; }
  50%      { opacity: 1;   box-shadow: 0 0 0 4px rgba(25, 118, 210, 0.22); }
}
/* Non-terminal (running/standby/msghandle/cancelling/active) —
   the live states where the user wants visual confirmation. */
.status-pill.status-pill-non-terminal {
  background: #e3f2fd;
  color: #1565c0;
  box-shadow: 0 1px 3px rgba(25, 118, 210, 0.25);
}

/* Pause / Resume buttons in the chat header */
.pause-btn, .resume-btn {
  font-size: 12px;
  padding: 3px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s, border-color 0.1s;
}
.pause-btn:hover { background: #fff3e0; border-color: #ff9800; }
.resume-btn:hover { background: #e3f2fd; border-color: #1976d2; }
.pause-btn:disabled, .resume-btn:disabled { opacity: 0.5; cursor: wait; }
.cancel-chat-btn {
  font-size: 12px;
  padding: 6px 14px;
  white-space: nowrap;
}
.status-pill.status-pill-standby {
  /* STANDBY gets its own distinct colour so a parked agent
     reads differently from one that is actively running. */
  background: #e0f2f1;
  color: #00695c;
  box-shadow: 0 1px 3px rgba(0, 150, 136, 0.25);
}
.status-pill.status-pill-paused {
  background: #fff3e0;
  color: #e65100;
  box-shadow: 0 1px 3px rgba(255, 152, 0, 0.25);
}
.status-pill.status-pill-paused .status-pill-dot {
  animation: none;
  opacity: 0.8;
}
.status-pill.status-pill-standby .status-pill-dot {
  /* Slower pulse for standby — parked, not racing. */
  animation: statusPillPulseSlow 2.4s ease-in-out infinite;
}
@keyframes statusPillPulseSlow {
  0%, 100% { opacity: 0.55; box-shadow: 0 0 0 0 currentColor; }
  50%      { opacity: 0.95; box-shadow: 0 0 0 3px rgba(0, 150, 136, 0.22); }
}
.status-pill.status-pill-cancelling {
  background: #fff3e0;
  color: #e65100;
  box-shadow: 0 1px 3px rgba(230, 81, 0, 0.25);
}
.status-pill.status-pill-msghandle {
  background: #ede7f6;
  color: #4527a0;
  box-shadow: 0 1px 3px rgba(94, 53, 177, 0.25);
}
.status-pill.status-pill-terminal {
  /* Completed / closed — soft green, terminal. */
  background: #e8f5e9;
  color: #2e7d32;
  box-shadow: 0 1px 3px rgba(46, 125, 50, 0.15);
}
.status-pill.status-pill-terminal .status-pill-dot {
  /* No animation on terminal states. */
  animation: none;
  opacity: 1;
}
.status-pill.status-pill-cancelled {
  background: #f5f5f5;
  color: #777;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.status-pill.status-pill-cancelled .status-pill-dot { animation: none; opacity: 0.6; }
.status-pill.status-pill-error,
.status-pill.status-pill-failed {
  background: #ffebee;
  color: #c62828;
  box-shadow: 0 1px 3px rgba(198, 40, 40, 0.25);
}
.status-pill.status-pill-error .status-pill-dot,
.status-pill.status-pill-failed .status-pill-dot { animation: none; opacity: 1; }

.chat {
  flex: 1;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

/* The main chat column — header + messages + composer. Takes all */
/* available space; the conversation panel steals space from the  */
/* right when open.                                                */
.chat-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
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

/* Wake-event separator: a full-width divider with a centered label */
/* showing who triggered the agent's wake from standby.  Rendered   */
/* instead of a normal chat bubble when the message content starts  */
/* with `[[AKIBA_WAKE_EVENT]]`.                                       */
.wake-separator {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 100%;
  margin: 8px 0;
}
.wake-separator-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    #c8e6c9 20%,
    #81c784 50%,
    #c8e6c9 80%,
    transparent
  );
}
.wake-separator-label {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #a5d6a7;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(46, 125, 50, 0.12);
}
.wake-separator-icon {
  font-size: 13px;
}

/* LLM retry status notice — shown inline in the message list when
   the LLM call fails and enters the retry loop. */
.llm-retry-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  margin: 6px 0;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  font-size: 13px;
  color: #856404;
}
.llm-retry-notice.llm-retry-recovered {
  background: #d4edda;
  border-color: #28a745;
  color: #155724;
}
.llm-retry-icon {
  font-size: 16px;
  flex-shrink: 0;
}

/* LLM in-flight progress heartbeat.  Rendered while a single LLM
   call is still generating — uses a calmer blue tone than the
   retry banner's warning yellow so the user can tell "still
   working" apart from "previous call failed, waiting to retry". */
.llm-progress-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  margin: 6px 0;
  background: #e3f2fd;
  border: 1px solid #64b5f6;
  border-radius: 8px;
  font-size: 13px;
  color: #1565c0;
}

/* Live streaming bubble — the in-flight LLM response rendered
   token-by-token as SSE chunks arrive.  Visually matches a regular
   assistant message but with a subtle "live" tint and a blinking
   cursor at the end so the user instantly recognises it as the
   still-growing reply. */
.streaming-live {
  border-left: 3px solid #42a5f5;
  background: linear-gradient(to right, #f4f9ff 0%, #ffffff 60%);
}
.streaming-live-time {
  color: #1976d2;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.streaming-live-content {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.55;
}
/* Collapsible reasoning ("Thought process") window inside the
   streaming bubble: muted look so the chain-of-thought is visually
   distinct from the actual answer body. */
.think-details {
  margin: 0 0 8px;
  padding: 10px 14px;
  border: 1px solid #e3e0d5;
  border-radius: 12px;
  background: #fbfaf6;
}
.think-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #8a8577;
  cursor: pointer;
  user-select: none;
  list-style: none;
}
.think-summary::-webkit-details-marker {
  display: none;
}
.think-summary::before {
  content: '💭';
  flex-shrink: 0;
}
.think-summary-spinner {
  flex-shrink: 0;
}
.think-content {
  margin-top: 8px;
  font-size: 12.5px;
  line-height: 1.55;
  color: #8a8577;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
}
/* Interrupted streaming bubble: dimmed amber background so the
   preserved partial content is visually distinct from a live
   stream, plus the one-shot marker row below it. */
.msg.assistant.streaming-live.interrupted .content {
  background: #fdf3e0;
  color: #6b5d3f;
}
.streaming-interrupted {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 6px;
  padding: 6px 12px;
  font-size: 12px;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 8px;
}
.streaming-interrupted-icon {
  flex-shrink: 0;
}
/* Stall indicator in the bubble header: a small spinning ring +
   "waiting for model…" while no new text has arrived for a
   while. */
.stream-stall-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 8px;
  color: #b45309;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
}
.stream-stall-spinner {
  width: 10px;
  height: 10px;
  border: 2px solid #fcd34d;
  border-top-color: #b45309;
  border-radius: 50%;
  animation: stream-stall-spin 0.9s linear infinite;
}
@keyframes stream-stall-spin {
  to { transform: rotate(360deg); }
}
/* Persisted interrupted-partial row from the DB: same dimmed
   treatment as the live interrupted bubble. */
.msg.assistant.interrupted-partial .content {
  background: #fdf3e0;
  color: #6b5d3f;
}
.interrupted-badge {
  margin-left: 8px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 4px;
  text-transform: none;
  letter-spacing: 0;
}
.llm-progress-spinner {
  font-size: 16px;
  flex-shrink: 0;
  display: inline-block;
  animation: llm-progress-spin 2s linear infinite;
}
.llm-progress-text {
  flex: 1;
}
@keyframes llm-progress-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.llm-retry-text {
  flex: 1;
}
.llm-retry-now-btn {
  padding: 4px 12px;
  border: 1px solid #856404;
  border-radius: 4px;
  background: #fff3cd;
  color: #856404;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}
.llm-retry-now-btn:hover:not(:disabled) {
  background: #ffc107;
  color: #fff;
}
.llm-retry-now-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Wake segment selector dropdown in the chat header.
   Only visible when the session has 2+ wake events. */
.wake-selector {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid #a5d6a7;
  border-radius: 16px;
  background: #e8f5e9;
  color: #2e7d32;
  cursor: pointer;
  outline: none;
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wake-selector:hover {
  border-color: #66bb6a;
  background: #d7ecd9;
}
.wake-selector:focus {
  border-color: #43a047;
  box-shadow: 0 0 0 2px rgba(67, 160, 71, 0.15);
}
.wake-selector option {
  font-size: 12px;
  padding: 4px;
  color: #333;
  background: #fff;
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

/* Tool detail layout: stacked vertically (parameters on top, output
   below). Parameters live inside a nested <details> element so the
   user can independently collapse them when they only care about the
   result. The output section is always visible (no extra collapse
   control). */
.tool-detail {
  display: flex;
  flex-direction: column;
  border-top: 1px solid #e0e0e0;
}
.tool-params-block {
  /* No border-bottom: the output section below provides the divider
     via its own `border-top`. */
}
.tool-params-block > summary {
  font-size: 10px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 6px 10px 4px;
  cursor: pointer;
  user-select: none;
  list-style: none;            /* hide the default disclosure triangle */
  display: flex;
  align-items: center;
  gap: 5px;
}
.tool-params-block > summary::-webkit-details-marker {
  display: none;               /* WebKit / Chromium */
}
.tool-params-block > summary::marker {
  content: '';                 /* Firefox */
}
.tool-params-block > summary::before {
  content: '▾';
  font-size: 9px;
  color: #aaa;
  display: inline-block;
  transition: transform 0.15s ease;
}
.tool-params-block:not([open]) > summary::before {
  content: '▸';
}
.tool-params-block > summary:hover {
  color: #555;
}
.tool-section {
  width: 100%;
  min-width: 0;
}
.tool-output-section {
  border-top: 1px solid #f0f0f0;
}
.tool-label {
  font-size: 10px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 6px 10px 4px;
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

.pending-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  box-sizing: border-box;
  border-radius: 50%;
  border: 2px solid #d6d9de;
  border-top-color: #4a7dff;
  animation: live-tool-spin 0.8s linear infinite;
  vertical-align: middle;
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
  word-break: break-word;
  white-space: pre-wrap;
  max-height: 150px;
  overflow-y: auto;
}

/* Connection-lost banner — shown when the pollers have lost
   contact with the backend (e.g. daemon crashed, network down,
   server dead).  Stays on screen until polling recovers, so the
   user knows the apparent "frozen" UI is actually a connectivity
   problem rather than a hung agent. */
.connection-lost-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #fff8e1;
  color: #8d6e00;
  padding: 10px 16px;
  font-size: 13px;
  border-top: 1px solid #ffecb3;
  border-bottom: 1px solid #ffecb3;
}
.connection-lost-icon {
  flex-shrink: 0;
  font-size: 15px;
  line-height: 1.4;
}
.connection-lost-text {
  flex: 1;
  word-break: break-word;
  white-space: pre-wrap;
}
.connection-lost-retry {
  flex-shrink: 0;
  background: #8d6e00;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  font-weight: 500;
}
.connection-lost-retry:hover {
  background: #6d5600;
}

/* Agent error banner — shown in the chat area when the active
   session is in an `error` state. Distinct from `.error-banner`
   (which is for client-side / HTTP errors) so the two can be
   styled independently. */
.agent-error-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: #fff3f3;
  color: #c62828;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.5;
  border-top: 1px solid #ffcdd2;
  border-bottom: 1px solid #ffcdd2;
}
.agent-error-banner .agent-error-icon {
  flex-shrink: 0;
  font-size: 15px;
  line-height: 1.4;
}
.agent-error-banner .agent-error-text {
  flex: 1;
  word-break: break-word;
  white-space: pre-wrap;
  font-weight: 700;
  max-height: 150px;
  overflow-y: auto;
}
.agent-error-banner .agent-error-dismiss {
  flex-shrink: 0;
  background: none;
  border: none;
  color: #c62828;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
  opacity: 0.6;
}
.agent-error-banner .agent-error-dismiss:hover {
  opacity: 1;
}

/* LLM selector + composer */
/* Wide enough for the longest label so stopping never shifts the composer. */
.live-tools {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-self: flex-start;
  margin: 4px 0 8px;
}

.live-tool {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(640px, 100%);
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  font-size: 0.78rem;
  color: var(--muted-foreground, #8a8f98);
}

.live-tool-spinner {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  animation: live-tool-spin 0.8s linear infinite;
}

@keyframes live-tool-spin {
  to { transform: rotate(360deg); }
}

.live-tool-name {
  font-family: ui-monospace, monospace;
  color: var(--foreground);
}

.live-tool-args {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 360px;
  opacity: 0.7;
}

.live-tool-elapsed {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
}

.interruption-note {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0;
  align-self: stretch;
}

.interruption-line {
  flex: 1;
  height: 1px;
  background: var(--border);
}

.interruption-text {
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  color: var(--muted-foreground, #8a8f98);
  white-space: nowrap;
}

.composer-submit {
  min-width: 10rem;
  justify-content: center;
  white-space: nowrap;
}
.composer-submit.stopping {
  background: #c0392b;
  border-color: #c0392b;
}
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
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  background: #fafafa;
}

.composer-input-row {
  display: flex;
  gap: 10px;
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

.inject-mode-row {
  display: flex;
  gap: 16px;
  padding: 4px 0;
}

.inject-mode-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
}

.inject-mode-label input[type="radio"] {
  margin: 0;
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

/* ---- Session list hint --------------------------------------------------- */
.session-hint {
  margin-bottom: 8px;
  padding: 6px 8px;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.4;
}

/* ---- Session filter (project / workflow / module + search) --------------- */
.session-filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}
.session-filter-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 5px;
  font-size: 12px;
  background: #fff;
  color: var(--text, #374151);
  box-sizing: border-box;
}
.session-filter-input:focus {
  outline: none;
  border-color: var(--primary, #4f46e5);
}
.session-filter-hint {
  padding: 12px 8px;
  line-height: 1.5;
}
.session-filter-running {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text, #374151);
  cursor: pointer;
  user-select: none;
}
.session-filter-running input[type="checkbox"] {
  margin: 0;
  cursor: pointer;
}
/* Static dot that lights up (pulses) while the checkbox is on. */
.running-dot-inline {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d1d5db;
  flex-shrink: 0;
}
.running-dot-inline.active {
  background: #22c55e;
  box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55);
  animation: running-pulse 1.6s ease-out infinite;
}
@keyframes running-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55); }
  70%  { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
  100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}

/* ---- Chat header --------------------------------------------------------- */
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
.chat-title-edit {
  margin-left: 8px;
  padding: 2px 6px;
  border: none;
  border-radius: 5px;
  background: none;
  color: #8a8f98;
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.chat-title:hover .chat-title-edit {
  opacity: 1;
}

.chat-title-edit:hover {
  color: #4a7dff;
  background: rgba(74, 125, 255, 0.08);
}

.ctx-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--border, #e3e6ea);
}

.chat-title-input {
  min-width: 220px;
  padding: 2px 8px;
  font: inherit;
  font-weight: 600;
  color: inherit;
  background: #fff;
  border: 1px solid #4a7dff;
  border-radius: 6px;
  outline: none;
}

.program-picker {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 8px;
}

.program-picker-label {
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  color: #8a8f98;
  text-transform: uppercase;
}

.program-picker-missing {
  color: #c0392b;
  font-weight: 600;
}

.program-picker-select {
  max-width: 260px;
  padding: 3px 6px;
  font-size: 0.8rem;
  color: inherit;
  background: #fff;
  border: 1px solid #d6d9de;
  border-radius: 6px;
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
