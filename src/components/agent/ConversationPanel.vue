<template>
  <aside class="conv-panel" :class="{ 'conv-panel-open': open }">
    <button
      class="conv-panel-toggle"
      :title="open ? 'Hide conversations' : 'Show conversations'"
      @click="toggle"
    >
      <span class="conv-panel-toggle-icon">{{ open ? '▶' : '◀' }}</span>
      <span class="conv-panel-toggle-label">
        💬
        <span v-if="conversations.length > 0" class="conv-panel-count">{{ conversations.length }}</span>
      </span>
    </button>
    <div v-if="open" class="conv-panel-content">
      <div class="conv-panel-header">
        <span class="conv-panel-title">Conversations</span>
        <button class="conv-panel-refresh" title="Refresh" @click="refresh" :disabled="loading">
          {{ loading ? '…' : '↻' }}
        </button>
      </div>
      <div v-if="error" class="conv-panel-error">{{ error }}</div>
      <div v-if="!loading && conversations.length === 0" class="conv-panel-empty muted small">
        No conversations yet.
      </div>
      <ul class="conv-list">
        <li
          v-for="conv in conversations"
          :key="conv.conversationId"
          :class="{ 'conv-item-active': expandedId === conv.conversationId }"
          class="conv-item"
          @click="toggleExpand(conv.conversationId)"
        >
          <div class="conv-item-header">
            <span class="conv-item-id">conv#{{ conv.conversationId }}</span>
            <span v-if="conv.unhandledCount > 0" class="conv-item-badge">{{ conv.unhandledCount }}</span>
            <span class="conv-item-count">{{ conv.messageCount }} msg</span>
            <span class="conv-item-kind" v-if="conv.lastMessageKind">{{ conv.lastMessageKind }}</span>
          </div>
          <div class="conv-item-preview" v-if="conv.lastMessagePreview">
            {{ conv.lastMessagePreview.slice(0, 80) }}
          </div>
          <div class="conv-item-time" v-if="conv.lastMessageAt">{{ formatTime(conv.lastMessageAt) }}</div>
          <div
            v-if="expandedId === conv.conversationId"
            class="conv-messages"
            @click.stop
          >
            <div v-if="msgLoading" class="muted small">Loading messages…</div>
            <div v-else-if="convMessages.length === 0" class="muted small">No messages found.</div>
            <div
              v-for="msg in convMessages"
              :key="msg.messageId"
              class="conv-msg"
              :class="{ 'conv-msg-out': msg.senderSessionId === sessionId }"
            >
              <div class="conv-msg-header">
                <span class="conv-msg-kind">{{ msg.kind }}</span>
                <span class="conv-msg-from">{{ shortId(msg.senderSessionId) }}</span>
                <span v-if="msg.acked" class="conv-msg-acked">✓</span>
              </div>
              <div class="conv-msg-subject" v-if="msg.subject">{{ msg.subject }}</div>
              <pre class="conv-msg-body">{{ msg.body }}</pre>
              <div class="conv-msg-time">{{ formatTime(msg.createdAt) }}</div>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { agentApi } from '@/services/api'
import type { ConversationSummary, ConversationMessage } from '@/types'
import { formatTime, shortId } from '@/utils/agentFormat'

const props = defineProps<{ sessionId: string | null }>()

const open = ref(false)
const conversations = ref<ConversationSummary[]>([])
const expandedId = ref<number | null>(null)
const convMessages = ref<ConversationMessage[]>([])
const loading = ref(false)
const error = ref('')
const msgLoading = ref(false)

let pollInterval: number | null = null
const POLL_MS = 5000

function toggle() {
  open.value = !open.value
  if (open.value) {
    refresh()
    startPolling()
  } else {
    stopPolling()
  }
}

async function refresh() {
  if (!props.sessionId) return
  // Skip if a refresh is already in-flight: a slow network would
  // otherwise pile up requests every poll tick.
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const { data } = await agentApi.listConversations(props.sessionId, 'all')
    conversations.value = data.conversations || []
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Failed to load conversations'
  } finally {
    loading.value = false
  }
}

function startPolling() {
  if (pollInterval != null) return
  pollInterval = window.setInterval(refresh, POLL_MS)
}

function stopPolling() {
  if (pollInterval != null) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

async function toggleExpand(conversationId: number) {
  if (expandedId.value === conversationId) {
    expandedId.value = null
    convMessages.value = []
    return
  }
  expandedId.value = conversationId
  convMessages.value = []
  msgLoading.value = true
  try {
    const { data } = await agentApi.getConversation(props.sessionId!, conversationId)
    convMessages.value = data.messages || []
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Failed to load messages'
    convMessages.value = []
  } finally {
    msgLoading.value = false
  }
}

// Reset on session switch so the previous session's conversations
// do not linger under the new session's id.
watch(
  () => props.sessionId,
  (id) => {
    conversations.value = []
    expandedId.value = null
    convMessages.value = []
    if (!id) {
      stopPolling()
      return
    }
    if (open.value) refresh()
  }
)

onUnmounted(stopPolling)
</script>

<style scoped>
/* ---- Conversation panel (right-side collapsible) ---- */
.conv-panel {
  display: flex;
  flex-direction: row;
  border-left: 1px solid #e0e0e0;
  background: #fafcff;
  flex-shrink: 0;
  overflow: hidden;
  transition: width 0.2s ease;
  width: 36px;
}
.conv-panel-open {
  width: 340px;
}
.conv-panel-toggle {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  width: 36px;
  padding: 10px 0;
  background: none;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  color: #555;
  font-size: 12px;
}
.conv-panel-toggle:hover {
  background: #eef5ff;
}
.conv-panel-toggle-icon {
  font-size: 10px;
  color: #999;
}
.conv-panel-toggle-label {
  position: relative;
  font-size: 15px;
}
.conv-panel-count {
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
.conv-panel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid #e8e8e8;
}
.conv-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}
.conv-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
}
.conv-panel-refresh {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 15px;
  color: #666;
  padding: 2px 6px;
  border-radius: 4px;
}
.conv-panel-refresh:hover:not(:disabled) {
  background: #e0e0e0;
}
.conv-panel-refresh:disabled {
  opacity: 0.5;
  cursor: default;
}
.conv-panel-error {
  padding: 8px 14px;
  font-size: 12px;
  color: #c62828;
}
.conv-panel-empty {
  padding: 20px 14px;
  text-align: center;
}
.conv-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}
.conv-item {
  padding: 10px 14px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background 0.1s;
}
.conv-item:hover {
  background: #f5f9ff;
}
.conv-item-active {
  background: #eef5ff;
}
.conv-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.conv-item-id {
  font-size: 12px;
  font-weight: 600;
  color: #1976d2;
}
.conv-item-badge {
  background: #e94560;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  border-radius: 8px;
  padding: 1px 6px;
  min-width: 16px;
  text-align: center;
}
.conv-item-count {
  font-size: 10px;
  color: #999;
  margin-left: auto;
}
.conv-item-kind {
  font-size: 9px;
  background: #e0e0e0;
  color: #555;
  border-radius: 3px;
  padding: 1px 4px;
}
.conv-item-preview {
  font-size: 11px;
  color: #666;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conv-item-time {
  font-size: 9px;
  color: #aaa;
  margin-top: 2px;
}
.conv-messages {
  margin-top: 8px;
  border-top: 1px dashed #ddd;
  padding-top: 8px;
  max-height: 400px;
  overflow-y: auto;
}
.conv-msg {
  padding: 6px 8px;
  margin-bottom: 6px;
  border-radius: 6px;
  background: #f5f5f5;
  font-size: 11px;
}
.conv-msg-out {
  background: #e3f2fd;
}
.conv-msg-header {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 3px;
}
.conv-msg-kind {
  font-size: 9px;
  font-weight: 600;
  color: #1976d2;
  text-transform: uppercase;
}
.conv-msg-from {
  font-size: 10px;
  color: #888;
  font-family: monospace;
}
.conv-msg-acked {
  color: #43a047;
  font-size: 10px;
  margin-left: auto;
}
.conv-msg-subject {
  font-size: 11px;
  font-weight: 600;
  color: #333;
  margin-bottom: 2px;
}
.conv-msg-body {
  font-size: 11px;
  color: #444;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
  line-height: 1.4;
}
.conv-msg-time {
  font-size: 9px;
  color: #aaa;
  margin-top: 2px;
}
</style>
