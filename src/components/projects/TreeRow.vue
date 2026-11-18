<template>
  <div>
    <div
      class="row"
      :class="{ folder: entry.folder }"
      :style="{ paddingLeft: (depth * 12 + 16) + 'px' }"
      @click="activate"
      @dragover.prevent
      @drop.prevent="onDrop"
      @contextmenu.prevent="menu = true"
    >
      <span class="glyph">{{ entry.folder ? (expanded ? '▾' : '▸') : '·' }}</span>
      <span class="name" :title="entry.path">{{ entry.name }}</span>
      <span v-if="!entry.folder" class="size">{{ humanSize(entry.size) }}</span>
    </div>

    <div v-if="menu" class="ctx" @click.stop>
      <template v-if="!entry.folder">
        <div class="ctx-item" @click="openWs">Open workspace</div>
        <div class="ctx-item" @click="copyUuid">Copy program UUID</div>
        <div class="ctx-sep"></div>
        <div class="ctx-item" @click="copyEntry(true)">Copy with workspace…</div>
        <div class="ctx-item" @click="copyEntry(false)">Copy without workspace…</div>
        <div class="ctx-item" @click="moveEntry">Move to…</div>
        <div class="ctx-sep"></div>
      </template>
      <div v-else class="ctx-item" @click="newFolder">New folder inside</div>
      <div class="ctx-item" @click="copyPath">Copy path</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" @click="remove">Delete</div>
    </div>

    <template v-if="entry.folder && expanded">
      <TreeRow
        v-for="child in children"
        :key="child.path"
        :project="project"
        :entry="child"
        :all="all"
        :depth="depth + 1"
        @open-workspace="$emit('open-workspace', $event)"
        @error="$emit('error', $event)"
        @changed="$emit('changed', $event)"
        @drop-import="$emit('drop-import', $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { projectApi } from '@/services/api'
import { copyText } from '@/utils/clipboard'

interface Entry {
  path: string
  name: string
  folder: boolean
  size: number
  programId?: string | null
}

const props = withDefaults(defineProps<{
  project: string
  entry: Entry
  all: Entry[]
  depth?: number
}>(), { depth: 0 })

const emit = defineEmits<{
  'open-workspace': [scope: { project: string; program: string }]
  changed: [project?: string]
  error: [message: string]
  'drop-import': [payload: { folder: string; event: DragEvent }]
}>()

const expanded = ref(false)
const menu = ref(false)

/** Children come from the project's one tree response, not from a request per folder. */
const children = computed(() => {
  const prefix = props.entry.path.endsWith('/') ? props.entry.path : `${props.entry.path}/`
  return props.all
    .filter(e => e.path.startsWith(prefix) && !e.path.substring(prefix.length).includes('/'))
    .sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name))
})

function activate() {
  menu.value = false
  if (props.entry.folder) {
    expanded.value = !expanded.value
    return
  }
  emit('open-workspace', { project: props.project, program: props.entry.path })
}

function closeMenu() {
  menu.value = false
}

onMounted(() => window.addEventListener('click', closeMenu))
onUnmounted(() => window.removeEventListener('click', closeMenu))

function openWs() {
  menu.value = false
  emit('open-workspace', { project: props.project, program: props.entry.path })
}

function onDrop(ev: DragEvent) {
  emit('drop-import', { folder: props.entry.folder ? props.entry.path : '', event: ev })
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function copyUuid() {
  menu.value = false
  if (props.entry.programId) await copyText(props.entry.programId)
}

async function copyPath() {
  menu.value = false
  await copyText(`${props.project}:${props.entry.path}`)
}

/**
 * Where a copy or a move should go.
 *
 * Asking for `project:/folder` in one field keeps this to one dialog; the project may be another
 * one, which is the whole reason copy is not limited to the current tree.
 */
function askDestination(verb: string): { project: string; folder: string } | null {
  const answer = window.prompt(
    `${verb} to (project:/folder, leave the project empty for "${props.project}")`,
    `${props.project}:/`,
  )
  if (!answer) return null
  const [projectPart, ...rest] = answer.split(':')
  const project = projectPart.trim() || props.project
  const folder = rest.join(':').trim()
  return { project, folder: folder === '' ? '/' : folder }
}

async function copyEntry(withWorkspace: boolean) {
  menu.value = false
  const dest = askDestination('Copy')
  if (!dest) return
  try {
    await projectApi.transferEntry(dest.project, {
      fromProject: props.project,
      path: props.entry.path,
      targetFolder: dest.folder,
      move: false,
      withWorkspace,
    } as any)
    emit('changed', dest.project)
  } catch (e: any) {
    emit('error', e?.response?.data?.error || 'Copy failed.')
  }
}

async function moveEntry() {
  menu.value = false
  const dest = askDestination('Move')
  if (!dest) return
  try {
    if (dest.project === props.project) {
      await projectApi.moveEntry(props.project, props.entry.path, dest.folder)
    } else {
      await projectApi.transferEntry(dest.project, {
        fromProject: props.project,
        path: props.entry.path,
        targetFolder: dest.folder,
        move: true,
      } as any)
    }
    emit('changed', dest.project)
  } catch (e: any) {
    emit('error', e?.response?.data?.error || 'Move failed.')
  }
}

async function newFolder() {
  menu.value = false
  const name = window.prompt('Folder name')
  if (!name) return
  try {
    await projectApi.createFolder(props.project, props.entry.path, name)
    emit('changed')
  } catch (e: any) {
    emit('error', e?.response?.data?.error || 'Could not create the folder.')
  }
}

async function remove() {
  menu.value = false
  if (!window.confirm(`Delete ${props.entry.name}? Its workspace will be deleted too.`)) return
  try {
    await projectApi.deleteEntry(props.project, props.entry.path)
    emit('changed')
  } catch (e: any) {
    emit('error', e?.response?.data?.error || 'Delete failed.')
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
  min-width: 190px;
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
