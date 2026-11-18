<template>
  <div class="workspace-panel">
    <div class="panel-header">
      <span class="panel-title">Workspace</span>
      <button class="close-btn" title="Close workspace" @click="$emit('close')">×</button>
    </div>
    <div class="panel-body">
      <p class="empty">
        Browsing the files of this conversation needs the workspace file API, which is the
        next step. The panel is in place so the split, the tree and the editor route can land
        on top of it.
      </p>
      <p class="session">Session <code>{{ sessionId }}</code></p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ sessionId: string }>()
defineEmits<{ close: [] }>()
</script>

<style scoped>
.workspace-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-top: 1px solid var(--vscode-panel-border);
  background: var(--akiba-chat-surface);
}

.panel-header {
  display: flex;
  align-items: center;
  padding: 4px 10px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.panel-title {
  flex: 1;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vscode-descriptionForeground);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--akiba-chat-text-faint);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.close-btn:hover {
  color: var(--vscode-editor-foreground);
}

.panel-body {
  padding: 10px;
  overflow: auto;
}

.empty {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--akiba-chat-text-faint);
}

.session {
  margin: 0;
  font-size: 12px;
  color: var(--akiba-chat-text-muted);
}
</style>
