<template>
  <div class="files-sidebar">
    <div class="search-row">
      <input v-model="query" type="search" placeholder="Search files…" aria-label="Search files" @input="onSearch" />
    </div>

    <div class="list" @contextmenu.self.prevent="closeMenu">
      <div v-if="loading && !files.length" class="hint">Loading…</div>
      <div v-else-if="!files.length" class="hint">
        No files yet. Import binaries from the Files page or by importing into a project.
      </div>

      <div
        v-for="f in files"
        :key="f.id"
        class="row"
        :title="f.name"
        @contextmenu.prevent="openMenu($event, f)"
      >
        <span class="id">{{ f.id }}</span>
        <span class="divider"></span>
        <span class="name">{{ f.name }}</span>
      </div>

      <button v-if="hasMore && !query" class="more" @click="loadMore">Load more</button>
    </div>

    <div
      v-if="ctx.show"
      class="ctx"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
      @click.self="ctx.show = false"
    >
      <div class="ctx-item danger" @click="remove">Delete file</div>
    </div>

    <div v-if="error" class="hint error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { fileApi, type FileEntry } from '@/services/api'

const PAGE = 50

const files = ref<FileEntry[]>([])
const query = ref('')
const loading = ref(false)
const hasMore = ref(false)
const error = ref('')
const ctx = reactive({ show: false, x: 0, y: 0, file: null as FileEntry | null })

async function load(offset = 0) {
  loading.value = true
  error.value = ''
  try {
    const { data } = await fileApi.list(offset, PAGE)
    const rows = [...(data.files ?? [])].sort((a, b) => a.id - b.id)
    files.value = offset === 0 ? rows : [...files.value, ...rows]
    hasMore.value = files.value.length < (data.total ?? 0)
  } catch {
    error.value = 'Could not load files.'
  } finally {
    loading.value = false
  }
}

function loadMore() {
  void load(files.value.length)
}

let searchTimer: number | undefined
function onSearch() {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(async () => {
    const q = query.value.trim()
    if (!q) return void load(0)
    try {
      const { data } = await fileApi.search(q)
      files.value = data.files as unknown as FileEntry[]
      hasMore.value = false
    } catch {
      error.value = 'Search failed.'
    }
  }, 250)
}

function openMenu(ev: MouseEvent, file: FileEntry) {
  ctx.show = true
  ctx.x = ev.clientX
  ctx.y = ev.clientY
  ctx.file = file
}

function closeMenu() {
  ctx.show = false
}

async function remove() {
  const file = ctx.file
  ctx.show = false
  if (!file) return
  if (!window.confirm(`Delete ${file.name}? Projects using it will lose the binary.`)) return
  try {
    await fileApi.delete([file.id])
    files.value = files.value.filter(f => f.id !== file.id)
  } catch {
    error.value = 'Delete failed.'
  }
}

onMounted(() => {
  void load(0)
  window.addEventListener('click', closeMenu)
})
onUnmounted(() => window.removeEventListener('click', closeMenu))
</script>

<style scoped>
.files-sidebar {
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
  cursor: default;
}

.row:hover {
  background: var(--akiba-chat-hover);
  color: var(--vscode-editor-foreground);
}

/* The id is a reference, not a title: right aligned, low contrast, fenced by a hairline. */
.id {
  flex: 0 0 auto;
  min-width: 34px;
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

.more {
  width: 100%;
  padding: 6px;
  background: transparent;
  border: none;
  color: var(--akiba-info-text);
  font-size: 12px;
  cursor: pointer;
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
  min-width: 160px;
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
