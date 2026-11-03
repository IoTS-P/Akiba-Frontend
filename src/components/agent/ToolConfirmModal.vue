<template>
  <div v-if="request" class="confirm-overlay" @click.self>
    <div class="confirm-modal">
      <div class="confirm-header">
        <span class="confirm-icon">⚠️</span>
        <span class="confirm-title">
          {{ request.action === 'file_access' ? 'File Access Outside Workspace' : 'Tool Confirmation Required' }}
        </span>
      </div>
      <div class="confirm-body">
        <p class="confirm-tool">
          <span class="confirm-label">Tool:</span>
          <code>{{ request.toolName }}</code>
        </p>
        <p v-if="agentName" class="confirm-tool">
          <span class="confirm-label">Agent:</span>
          <code>{{ agentName }}</code>
        </p>
        <template v-if="request.action === 'file_access'">
          <p class="confirm-label-text">
            The agent wants to <strong>{{ request.command.split(' ')[0] }}</strong>
            a file <strong>outside</strong> the workspace:
          </p>
          <pre class="confirm-command">{{ request.targetPath || request.command }}</pre>
        </template>
        <template v-else>
          <p class="confirm-label-text">The agent wants to execute:</p>
          <pre class="confirm-command">{{ request.command }}</pre>
          <div class="confirm-meta">
            <div><span class="confirm-label">Working dir:</span> <code>{{ request.workingDirectory }}</code></div>
            <div><span class="confirm-label">Timeout:</span> {{ request.timeout }}s</div>
          </div>
        </template>
      </div>
      <div class="confirm-actions">
        <button class="btn-secondary" @click="emit('deny')" :disabled="busy">
          Deny
        </button>
        <button class="btn-primary confirm-approve" @click="emit('approve')" :disabled="busy">
          {{ busy ? '…' : 'Approve' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PendingConfirmation } from '@/types'

defineProps<{
  request: (PendingConfirmation & { sessionId: string }) | null
  busy: boolean
  agentName?: string | null
}>()

const emit = defineEmits<{ approve: []; deny: [] }>()
</script>

<style scoped>
/* Shared utilities, copied so the component does not depend on the view's scope. */
.btn-primary {
  padding: 10px 18px;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-secondary {
  padding: 10px 20px;
  background: #f5f5f5;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.muted {
  color: #999;
  text-align: center;
  padding: 14px;
}
.muted.small { font-size: 13px; }
/* ---- Tool confirmation modal ---- */
.confirm-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.confirm-modal {
  background: var(--bg-card, #1e1e2e);
  border: 1px solid var(--border-color, #333346);
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.confirm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #333346);
  font-size: 15px;
  font-weight: 600;
}

.confirm-icon { font-size: 18px; }
.confirm-title { color: var(--text-primary, #cdd6f4); }

.confirm-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirm-tool {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary, #a6adc8);
}
.confirm-tool code {
  background: var(--bg-accent, #313244);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--accent, #cba6f7);
}

.confirm-label { font-weight: 600; }
.confirm-label-text {
  font-size: 13px;
  color: var(--text-secondary, #a6adc8);
  margin: 0;
}

.confirm-command {
  background: var(--bg-accent, #181825);
  border: 1px solid var(--border-color, #313244);
  border-radius: 8px;
  padding: 12px 16px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  color: var(--text-primary, #cdd6f4);
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
}

.confirm-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary, #a6adc8);
}
.confirm-meta code {
  background: var(--bg-accent, #313244);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color, #333346);
}

.confirm-approve {
  background: var(--accent-green, #a6e3a1) !important;
  color: #1e1e2e !important;
}
.confirm-approve:hover:not(:disabled) {
  filter: brightness(1.1);
}
</style>
