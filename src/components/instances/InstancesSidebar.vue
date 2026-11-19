<template>
  <div class="instances-sidebar">
    <div class="search-row">
      <input v-model="query" type="search" placeholder="Search instances…" aria-label="Search instances" />
    </div>

    <div class="list" @contextmenu.self.prevent="blankMenu($event)">
      <div v-if="store.loading && !store.available.length" class="hint">Loading…</div>
      <div v-else-if="!store.available.length" class="hint">
        No instances yet. Right click here to create one.
      </div>

      <div
        v-for="i in visible"
        :key="i.name"
        class="row"
        :class="{ active: i.name === picked, current: i.name === store.selected }"
        :title="i.name === store.selected ? 'Currently in use' : i.name"
        @click="picked = i.name"
        @contextmenu.prevent="menu($event, i.name)"
      >
        <span class="dot" :class="store.busyInstances.includes(i.name) ? 'busy' : statusClass(i)"></span>
        <span class="name">{{ i.name }}</span>
        <span v-if="store.busyInstances.includes(i.name)" class="tag">backing up</span>
        <span v-else class="tag">{{ statusLabel(i) }}</span>
      </div>
    </div>

    <div
      v-if="ctx.show"
      class="ctx"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
      @click.self="ctx.show = false"
    >
      <template v-if="ctx.instance">
        <div class="ctx-item" @click="useInstance">Switch to this instance</div>
        <div class="ctx-item" @click="backup">Back up…</div>
        <div class="ctx-item" @click="toggleRun">{{ ctx.running ? 'Stop' : 'Start' }}</div>
        <div class="ctx-sep"></div>
        <div class="ctx-item danger" @click="remove">Delete instance</div>
      </template>
      <template v-else>
        <div class="ctx-item" @click="create">New instance…</div>
      </template>
    </div>

    <div v-if="error" class="hint error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { instanceApi } from '@/services/api'
import { useInstanceStore } from '@/stores/instance'
import type { InstanceSummary } from '@/types'

const store = useInstanceStore()
const query = ref('')
const error = ref('')
/** Selection is local: choosing an instance here must not change what the rest of the app reads. */
const picked = ref<string | null>(null)
const ctx = reactive({ show: false, x: 0, y: 0, instance: '', running: false })

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? store.available.filter(i => i.name.toLowerCase().includes(q)) : store.available
})

function statusClass(i: InstanceSummary): string {
  return i.running ? 'on' : 'off'
}

function statusLabel(i: InstanceSummary): string {
  return i.running ? 'running' : 'stopped'
}

function menu(ev: MouseEvent, name: string) {
  const found = store.available.find(i => i.name === name)
  ctx.show = true
  ctx.x = ev.clientX
  ctx.y = ev.clientY
  ctx.instance = name
  ctx.running = !!found?.running
}

function blankMenu(ev: MouseEvent) {
  ctx.show = true
  ctx.x = ev.clientX
  ctx.y = ev.clientY
  ctx.instance = ''
}

function closeMenu() {
  ctx.show = false
}

/** Switching is a deliberate act: it changes what every other view reads from. */
function useInstance() {
  const name = ctx.instance
  ctx.show = false
  store.select(name)
  window.location.reload()
}

async function backup() {
  const name = ctx.instance
  ctx.show = false
  const alias = window.prompt('Backup label (optional)', '') ?? ''
  try {
    await instanceApi.backup({ instanceName: name, alias: alias || undefined })
    await store.refresh()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Backup failed.'
  }
}

async function toggleRun() {
  const name = ctx.instance
  const running = ctx.running
  ctx.show = false
  try {
    running ? await instanceApi.shutdown(name) : await instanceApi.start(name)
    await store.refresh()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Could not change the instance state.'
  }
}

async function remove() {
  const name = ctx.instance
  ctx.show = false
  if (!window.confirm(`Delete instance ${name}? Its database, sessions and results go with it.`)) return
  try {
    await instanceApi.delete(name)
    if (store.selected === name) store.clear()
    await store.refresh()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Delete failed.'
  }
}

async function create() {
  ctx.show = false
  const name = window.prompt('New instance name (letters, digits, _ and -)')
  if (!name) return
  try {
    await instanceApi.create(name)
    await store.refresh()
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Could not create the instance.'
  }
}

onMounted(() => {
  void store.refresh()
  window.addEventListener('click', closeMenu)
})
onUnmounted(() => window.removeEventListener('click', closeMenu))
</script>

<style scoped>
.instances-sidebar {
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
  padding: 4px 10px;
  font-size: 12px;
  color: var(--akiba-chat-text-muted);
  cursor: default;
}

.row:hover {
  background: var(--akiba-chat-hover);
  color: var(--vscode-editor-foreground);
}

.row.active {
  background: color-mix(in srgb, var(--vscode-focusBorder) 18%, transparent);
  color: var(--vscode-editor-foreground);
}

/* The one in use is marked, so "selected here" and "in use" cannot be confused. */
.row.current .name {
  color: var(--vscode-editor-foreground);
  font-weight: 600;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: var(--akiba-chat-text-faint);
}

.dot.on { background: var(--akiba-success-text); }
.dot.off { background: var(--akiba-chat-text-faint); }
.dot.busy { background: var(--akiba-warning-text); }

.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
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
  min-width: 190px;
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
