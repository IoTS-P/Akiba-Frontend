<template>
  <div class="scripts-sidebar">
    <div class="search-row">
      <input v-model="query" type="search" placeholder="Search scripts…" aria-label="Search scripts" />
    </div>

    <div class="list">
      <div v-if="!scripts.length" class="hint">No scripts yet.</div>

      <div
        v-for="s in visible"
        :key="s.id"
        class="row"
        :class="{ active: s.id === activeId }"
        :title="s.description || s.name"
        @click="open(s.id)"
        @contextmenu.prevent="menu($event, s)"
      >
        <span class="id">{{ s.id }}</span>
        <span class="divider"></span>
        <span class="name">{{ s.name }}</span>
      </div>
    </div>

    <div
      v-if="ctx.show"
      class="ctx"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
      @click.self="ctx.show = false"
    >
      <div class="ctx-item" @click="rename">Rename</div>
      <div class="ctx-item" @click="editDescription">Edit description</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" @click="remove">Delete script</div>
    </div>

    <div v-if="error" class="hint error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { scriptApi } from '@/services/api'
import type { Script } from '@/types'

const route = useRoute()
const router = useRouter()

const scripts = ref<Script[]>([])
const query = ref('')
const error = ref('')
const ctx = reactive({ show: false, x: 0, y: 0, script: null as Script | null })

const activeId = computed(() => Number(route.query.id) || null)
const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? scripts.value.filter(s => s.name.toLowerCase().includes(q)) : scripts.value
})

async function load() {
  try {
    const { data } = await scriptApi.list(200)
    scripts.value = [...(data.scripts ?? [])].sort((a, b) => a.id - b.id)
  } catch {
    error.value = 'Could not load scripts.'
  }
}

function open(id: number) {
  router.push({ path: '/scripts', query: { id: String(id) } })
}

function menu(ev: MouseEvent, script: Script) {
  ctx.show = true
  ctx.x = ev.clientX
  ctx.y = ev.clientY
  ctx.script = script
}

function closeMenu() {
  ctx.show = false
}

async function rename() {
  const script = ctx.script
  ctx.show = false
  if (!script) return
  const name = window.prompt('Script name', script.name)
  if (!name || name === script.name) return
  try {
    await scriptApi.update(script.id, { name })
    await load()
  } catch {
    error.value = 'Rename failed.'
  }
}

async function editDescription() {
  const script = ctx.script
  ctx.show = false
  if (!script) return
  const description = window.prompt('Description', script.description ?? '')
  if (description == null) return
  try {
    await scriptApi.update(script.id, { description })
    await load()
  } catch {
    error.value = 'Could not save the description.'
  }
}

async function remove() {
  const script = ctx.script
  ctx.show = false
  if (!script) return
  if (!window.confirm(`Delete script ${script.name}? This cannot be undone.`)) return
  try {
    await scriptApi.delete(script.id)
    scripts.value = scripts.value.filter(s => s.id !== script.id)
    if (activeId.value === script.id) router.push('/scripts')
  } catch {
    error.value = 'Delete failed.'
  }
}

onMounted(() => {
  void load()
  window.addEventListener('click', closeMenu)
})
onUnmounted(() => window.removeEventListener('click', closeMenu))
</script>

<style scoped>
.scripts-sidebar {
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

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--akiba-chat-text-muted);
  cursor: pointer;
}

.row:hover {
  background: var(--akiba-chat-hover);
  color: var(--vscode-editor-foreground);
}

.row.active {
  background: color-mix(in srgb, var(--vscode-focusBorder) 18%, transparent);
  color: var(--vscode-editor-foreground);
}

.id {
  flex: 0 0 auto;
  min-width: 28px;
  text-align: right;
  color: var(--akiba-chat-text-faint);
  font-variant-numeric: tabular-nums;
}

.divider {
  flex: 0 0 auto;
  width: 1px;
  height: 11px;
  background: var(--vscode-panel-border);
}

.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hint {
  padding: 8px 12px;
  font-size: 12px;
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

.ctx-item:hover {
  background: var(--vscode-focusBorder);
  color: #fff;
}

.ctx-item.danger:hover {
  background: var(--akiba-danger);
}

.ctx-sep {
  height: 1px;
  margin: 4px 0;
  background: var(--vscode-panel-border);
}
</style>
