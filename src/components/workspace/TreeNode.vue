<template>
  <div>
    <div
      class="row"
      :class="{ dir: entry.directory }"
      :style="{ paddingLeft: (depth * 12 + 8) + 'px' }"
      @click="activate"
      @contextmenu.prevent="menu = true"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <span class="glyph">{{ entry.directory ? (expanded ? '▾' : '▸') : '·' }}</span>
      <span class="name" :title="entry.path">{{ entry.name }}</span>
      <span v-if="!entry.directory" class="size">{{ humanSize(entry.size) }}</span>
    </div>

    <div v-if="menu" class="ctx" @click.stop>
      <div class="ctx-item" @click="download">Download</div>
      <div v-if="entry.directory" class="ctx-item" @click="newFolder">New folder</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" @click="remove">Delete</div>
    </div>

    <template v-if="entry.directory && expanded">
      <TreeNode
        v-for="child in children"
        :key="child.path"
        :entry="child"
        :session-id="sessionId"
        :depth="depth + 1"
        @open-file="$emit('openFile', $event)"
        @changed="onChildChanged"
        @error="$emit('error', $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { workspaceApi, type WorkspaceEntry } from '@/services/workspace'

const props = withDefaults(defineProps<{
  entry: WorkspaceEntry
  sessionId: string
  depth?: number
}>(), { depth: 0 })

const emit = defineEmits<{
  openFile: [path: string]
  changed: []
  error: [message: string]
}>()

const expanded = ref(false)
const children = ref<WorkspaceEntry[]>([])
const menu = ref(false)

function activate() {
  menu.value = false
  if (!props.entry.directory) {
    emit('openFile', props.entry.path)
    return
  }
  expanded.value = !expanded.value
  if (expanded.value) void loadChildren()
}

async function loadChildren() {
  try {
    const { data } = await workspaceApi.tree(props.sessionId, props.entry.path)
    children.value = data.entries
  } catch {
    emit('error', 'Could not read this folder.')
  }
}

function onChildChanged() {
  void loadChildren()
  emit('changed')
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function download() {
  menu.value = false
  window.open(workspaceApi.downloadUrl(props.sessionId, props.entry.path), '_blank')
}

async function newFolder() {
  menu.value = false
  const name = window.prompt('Folder name')
  if (!name) return
  try {
    // A folder exists once something is written into it; an empty marker keeps it addressable.
    await workspaceApi.writeFile(props.sessionId, `${props.entry.path}/${name}/.keep`, '')
    onChildChanged()
  } catch {
    emit('error', 'Could not create the folder.')
  }
}

async function remove() {
  menu.value = false
  if (!window.confirm(`Delete ${props.entry.name}?`)) return
  try {
    await workspaceApi.deleteEntry(props.sessionId, props.entry.path)
    emit('changed')
  } catch {
    emit('error', 'Could not delete this entry.')
  }
}

async function onDrop(ev: DragEvent) {
  if (!props.entry.directory) return
  const files = [...(ev.dataTransfer?.files ?? [])]
  if (!files.length) return
  try {
    for (const file of files) await workspaceApi.upload(props.sessionId, props.entry.path, file)
    await loadChildren()
    emit('changed')
  } catch {
    emit('error', 'Upload failed.')
  }
}
</script>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font-size: 12px;
  color: var(--akiba-chat-text-muted);
  cursor: pointer;
}

.row:hover {
  background: var(--akiba-chat-hover);
  color: var(--vscode-editor-foreground);
}

.glyph {
  width: 10px;
  color: var(--akiba-chat-text-faint);
}

.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size {
  color: var(--akiba-chat-text-faint);
  font-size: 11px;
}

.ctx {
  position: fixed;
  z-index: 60;
  margin-left: 24px;
  padding: 4px 0;
  min-width: 150px;
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--akiba-radius-sm);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  font-size: 12px;
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
