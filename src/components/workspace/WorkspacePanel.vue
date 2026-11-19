<template>
  <div class="workspace-panel" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
    <div class="panel-header">
      <span class="panel-title">Workspace</span>
      <button class="icon-btn" title="New file" @click="createFile">＋</button>
      <button class="icon-btn" title="Refresh" @click="load('')">↻</button>
      <button class="close-btn" title="Close workspace" @click="$emit('close')">×</button>
    </div>

    <div class="panel-body" :class="{ dragging }" @contextmenu.self.prevent="blankMenu($event)">
      <div v-if="draft.kind" class="draft">
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

      <div v-if="error" class="hint error">{{ error }}</div>
      <div v-else-if="!tree.length" class="hint">Empty workspace. Drop files here to upload.</div>

      <TreeNode
        v-for="entry in tree"
        :key="entry.path"
        :entry="entry"
        :scope="scope"
        @open-file="$emit('openFile', $event)"
        @changed="load('')"
        @error="error = $event"
      />
    </div>

    <div
      v-if="ctx.show"
      class="ctx"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
      @click.self="ctx.show = false"
    >
      <div class="ctx-item" @click="startDraft('file')">New file…</div>
      <div class="ctx-item" @click="startDraft('folder')">New folder…</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import TreeNode from '@/components/workspace/TreeNode.vue'
import { workspaceApi, type WorkspaceEntry, type WorkspaceScope } from '@/services/workspace'

const props = defineProps<{ scope: WorkspaceScope }>()
defineEmits<{ close: []; openFile: [path: string] }>()

const tree = ref<WorkspaceEntry[]>([])
const error = ref('')
const dragging = ref(false)
const ctx = reactive({ show: false, x: 0, y: 0 })

function blankMenu(ev: MouseEvent) {
  ctx.show = true
  ctx.x = ev.clientX
  ctx.y = ev.clientY
}

function closeMenu() {
  ctx.show = false
}

const draft = reactive({ kind: '' as '' | 'file' | 'folder', name: '' })
const draftInput = ref<HTMLInputElement | null>(null)

/** Typed in place, like an editor: a dialog in the middle of the screen breaks the flow. */
function startDraft(kind: 'file' | 'folder') {
  ctx.show = false
  draft.kind = kind
  draft.name = ''
  nextTick(() => draftInput.value?.focus())
}

async function commitDraft() {
  const kind = draft.kind
  const name = draft.name.trim()
  if (!kind || !name) {
    draft.kind = ''
    return
  }
  draft.kind = ''
  try {
    if (kind === 'folder') await workspaceApi.createDirectory(props.scope, name)
    else await workspaceApi.writeFile(props.scope, name, '')
    await load('')
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Could not create the entry.'
  }
}

async function load(path: string) {
  error.value = ''
  try {
    const { data } = await workspaceApi.tree(props.scope, path)
    if (path) return
    tree.value = data.entries
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Could not read the workspace.'
  }
}

async function createFile() {
  const name = window.prompt('New file name')
  if (!name) return
  try {
    await workspaceApi.writeFile(props.scope, name, '')
    await load('')
  } catch {
    error.value = 'Could not create the file.'
  }
}

/** Dropping onto the panel uploads into the root; a directory row takes its own drops. */
async function onDrop(ev: DragEvent) {
  dragging.value = false
  const files = [...(ev.dataTransfer?.files ?? [])]
  if (!files.length) return
  try {
    for (const file of files) await workspaceApi.upload(props.scope, '', file)
    await load('')
  } catch {
    error.value = 'Upload failed.'
  }
}

watch(() => props.scope, () => void load(''), { deep: true })
onMounted(() => {
  void load('')
  window.addEventListener('click', closeMenu)
})
onUnmounted(() => window.removeEventListener('click', closeMenu))
</script>

<style scoped>
.workspace-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  border-top: 1px solid var(--vscode-panel-border);
  background: var(--akiba-chat-surface);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 4px;
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

.icon-btn,
.close-btn {
  background: transparent;
  border: none;
  color: var(--akiba-chat-text-faint);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}

.icon-btn:hover,
.close-btn:hover {
  color: var(--vscode-editor-foreground);
}

.panel-body {
  flex: 1;
  overflow: auto;
  padding: 4px 0;
}

.panel-body.dragging {
  outline: 1px dashed var(--vscode-focusBorder);
  outline-offset: -4px;
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

.draft {
  padding: 2px 10px 4px;
}

.draft-input {
  width: 100%;
  box-sizing: border-box;
  padding: 1px 4px;
  font-size: 12px;
  background: var(--vscode-input-background);
  color: var(--vscode-editor-foreground);
  border: 1px solid var(--vscode-focusBorder);
  border-radius: 2px;
  outline: none;
}

.hint {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--akiba-chat-text-faint);
}

.hint.error {
  color: var(--akiba-danger-text);
}
</style>
