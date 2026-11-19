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
      <div v-if="isScript" class="ctx-item" @click="addToScripts">Add to scripts list</div>
      <template v-if="entry.directory">
        <div class="ctx-item" @click="startDraft('file')">New file…</div>
        <div class="ctx-item" @click="startDraft('folder')">New folder…</div>
        <div class="ctx-sep"></div>
      </template>
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" @click="remove">Delete</div>
    </div>

    <div v-if="draft.kind" class="draft" :style="{ paddingLeft: (depth * 12 + 24) + 'px' }">
      <input
        ref="draftInput"
        v-model="draft.name"
        class="draft-input"
        :placeholder="draft.kind === 'file' ? 'File name' : 'Folder name'"
        @keyup.enter="commitDraft"
        @keyup.esc="draft.kind = ''"
        @blur="commitDraft"
      />
    </div>

    <template v-if="entry.directory && expanded">
      <TreeNode
        v-for="child in children"
        :key="child.path"
        :entry="child"
        :scope="scope"
        :depth="depth + 1"
        @open-file="$emit('openFile', $event)"
        @changed="onChildChanged"
        @error="$emit('error', $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { scriptApi } from '@/services/api'
import { workspaceApi, type WorkspaceEntry, type WorkspaceScope } from '@/services/workspace'

const props = withDefaults(defineProps<{
  entry: WorkspaceEntry
  scope: WorkspaceScope
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
const draft = reactive({ kind: '' as '' | 'file' | 'folder', name: '' })
const draftInput = ref<HTMLInputElement | null>(null)

function closeMenu() {
  menu.value = false
}

onMounted(() => window.addEventListener('click', closeMenu))
onUnmounted(() => window.removeEventListener('click', closeMenu))

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
    const { data } = await workspaceApi.tree(props.scope, props.entry.path)
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

/** Only .kts is a script: the workspace also holds notes, dumps and binaries. */
const isScript = computed(() => !props.entry.directory && /\.kts$/i.test(props.entry.name))

/** The library is a catalogue of reusable scripts, so this is an explicit choice —
 *  runs no longer fill it up on their own. */
async function addToScripts() {
  menu.value = false
  try {
    const { data } = await workspaceApi.readFile(props.scope, props.entry.path)
    if (data.binary) {
      emit('error', 'This file is binary; it cannot become a script.')
      return
    }
    await scriptApi.create({
      name: props.entry.name.replace(/\.kts$/i, ''),
      code: data.content,
      language: 'kotlin',
      description: `Imported from ${props.entry.path}`,
    })
    emit('changed')
  } catch (e: any) {
    emit('error', e?.response?.data?.error || 'Could not add this script to the library.')
  }
}

function download() {
  menu.value = false
  window.open(workspaceApi.downloadUrl(props.scope, props.entry.path), '_blank')
}

/** A new entry is typed in place, the way an editor does it, not in a dialog. */
function startDraft(kind: 'file' | 'folder') {
  menu.value = false
  draft.kind = kind
  draft.name = ''
  expanded.value = true
  void loadChildren()
  nextTick(() => draftInput.value?.focus())
}

async function commitDraft() {
  const kind = draft.kind
  const name = draft.name.trim()
  if (!kind || !name) {
    draft.kind = ''
    return
  }
  const path = `${props.entry.path}/${name}`
  draft.kind = ''
  try {
    if (kind === 'folder') await workspaceApi.createDirectory(props.scope, path)
    else await workspaceApi.writeFile(props.scope, path, '')
    onChildChanged()
  } catch (e: any) {
    emit('error', e?.response?.data?.error || 'Could not create the entry.')
  }
}

async function remove() {
  menu.value = false
  if (!window.confirm(`Delete ${props.entry.name}?`)) return
  try {
    await workspaceApi.deleteEntry(props.scope, props.entry.path)
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
    for (const file of files) await workspaceApi.upload(props.scope, props.entry.path, file)
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

.draft {
  padding: 2px 0;
}

.draft-input {
  width: 90%;
  padding: 1px 4px;
  font-size: 12px;
  background: var(--vscode-input-background);
  color: var(--vscode-editor-foreground);
  border: 1px solid var(--vscode-focusBorder);
  border-radius: 2px;
  outline: none;
}

.ctx-sep {
  height: 1px;
  margin: 4px 0;
  background: var(--vscode-panel-border);
}
</style>
