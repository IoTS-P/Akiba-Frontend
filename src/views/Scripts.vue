<template>
  <div class="script-editor">
    <div v-if="!activeId" class="empty">
      Select a script in the sidebar to edit it.
    </div>
    <template v-else>
      <div class="bar">
        <span class="title">{{ script?.name }}</span>
        <span class="saved" :class="{ dirty }">{{ dirty ? 'Saving…' : 'Saved' }}</span>
      </div>
      <div class="body">
        <WorkspaceEditor v-model="code" :language="script?.language || 'kotlin'" :uri="`akiba://script/${activeId}`" @save="save" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import WorkspaceEditor from '@/components/workspace/WorkspaceEditor.vue'
import { scriptApi } from '@/services/api'
import type { Script } from '@/types'

const route = useRoute()
const script = ref<Script | null>(null)
const code = ref('')
const dirty = ref(false)
/** A load is not an edit: without this the old text is saved into the newly chosen script. */
const loading = ref(false)

const activeId = computed(() => Number(route.query.id) || null)

async function load(id: number) {
  loading.value = true
  script.value = null
  code.value = ''
  try {
    const { data } = await scriptApi.get(id)
    script.value = data
    code.value = data.code ?? ''
    dirty.value = false
  } catch {
    script.value = null
  } finally {
    loading.value = false
  }
}

let timer: number | undefined
watch(code, () => {
  if (loading.value || !script.value) return
  dirty.value = true
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void save(), 800)
})

async function save() {
  const current = script.value
  if (!current) return
  try {
    await scriptApi.update(current.id, { code: code.value })
    dirty.value = false
  } catch {
    // Leave it marked dirty: a failed write must not look saved.
  }
}

watch(activeId, id => {
  if (id) void load(id)
  else script.value = null
}, { immediate: true })
</script>

<style scoped>
.script-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.empty {
  padding: 24px 28px;
  font-size: 13px;
  color: var(--akiba-chat-text-faint);
}

.bar {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--vscode-panel-border);
  font-size: 12px;
}

.title {
  color: var(--vscode-editor-foreground);
  font-weight: 600;
}

.description {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--akiba-chat-text-faint);
}

.saved {
  color: var(--akiba-chat-text-faint);
}

.saved.dirty {
  color: var(--akiba-warning-text);
}

.body {
  flex: 1;
  min-height: 0;
}
</style>
