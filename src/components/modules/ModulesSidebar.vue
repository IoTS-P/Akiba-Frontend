<template>
  <div class="modules-sidebar" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="upload">
    <div class="search-row">
      <input v-model="query" type="search" placeholder="Search modules…" aria-label="Search modules" />
    </div>

    <div class="list" :class="{ dragging }">
      <div v-if="!modules.length" class="hint">
        No modules yet. Drop a module jar here to install one.
      </div>
      <div
        v-for="m in visible"
        :key="m.jarFileName"
        class="row"
        :title="m.jarFileName"
        @contextmenu.prevent="menu($event, m)"
      >
        <span class="name">{{ m.mainClassName }}</span>
        <span class="version">{{ m.owner || '' }}</span>
      </div>
    </div>

    <div
      v-if="ctx.show"
      class="ctx"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
      @click.self="ctx.show = false"
    >
      <div class="ctx-item danger" @click="remove">Delete module</div>
    </div>

    <div v-if="error" class="hint error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { moduleApi, type ModuleEntry } from '@/services/api'

const modules = ref<ModuleEntry[]>([])
const query = ref('')
const error = ref('')
const dragging = ref(false)
const ctx = reactive({ show: false, x: 0, y: 0, module: null as ModuleEntry | null })

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? modules.value.filter((m: ModuleEntry) => m.mainClassName.toLowerCase().includes(q)) : modules.value
})

async function load() {
  try {
    const { data } = await moduleApi.list()
    modules.value = data.modules ?? []
  } catch {
    error.value = 'Could not load modules.'
  }
}

/** Dropping a jar installs it; the server compiles nothing, it just stores and registers. */
async function upload(ev: DragEvent) {
  dragging.value = false
  const files = [...(ev.dataTransfer?.files ?? [])]
  if (!files.length) return
  error.value = ''
  try {
    for (const file of files) {
      const form = new FormData()
      form.append('file', file, file.name)
      await moduleApi.upload(form)
    }
    await load()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Upload failed.'
  }
}

function menu(ev: MouseEvent, m: ModuleEntry) {
  ctx.show = true
  ctx.x = ev.clientX
  ctx.y = ev.clientY
  ctx.module = m
}

function closeMenu() {
  ctx.show = false
}

async function remove() {
  const m = ctx.module
  ctx.show = false
  if (!m) return
  const file = m.jarFileName
  if (!window.confirm(`Delete module ${m.mainClassName}? Plans and conversations using it will fail.`)) return
  try {
    await moduleApi.delete(file)
    modules.value = modules.value.filter((x: ModuleEntry) => x.jarFileName !== file)
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Delete failed.'
  }
}

onMounted(() => {
  void load()
  window.addEventListener('click', closeMenu)
})
onUnmounted(() => window.removeEventListener('click', closeMenu))
</script>

<style scoped>
.modules-sidebar {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.search-row {
  padding: 0 10px 8px;
}

.search-row input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  font-size: 12px;
}

.list {
  flex: 1;
  overflow: auto;
}

.list.dragging {
  outline: 1px dashed var(--vscode-focusBorder);
  outline-offset: -4px;
}

.row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--akiba-chat-text-muted);
  cursor: default;
}

.row:hover {
  background: var(--akiba-chat-hover);
  color: var(--vscode-editor-foreground);
}

.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.version {
  font-size: 11px;
  color: var(--akiba-chat-text-faint);
}

.hint {
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--akiba-chat-text-faint);
}

.hint.error {
  color: var(--akiba-danger-text);
}

.ctx {
  position: fixed;
  z-index: 60;
  padding: 4px 0;
  min-width: 170px;
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--akiba-radius-sm);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  font-size: 12px;
  color: var(--vscode-editor-foreground);
}

.ctx-item {
  padding: 5px 12px;
  cursor: pointer;
}

.ctx-item.danger:hover {
  background: var(--akiba-danger);
  color: #fff;
}
</style>
