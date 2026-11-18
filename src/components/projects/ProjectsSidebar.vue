<template>
  <div class="projects-sidebar">
    <div class="search-row">
      <input v-model="query" type="search" placeholder="Search programs…" aria-label="Search programs" />
    </div>

    <div
      class="tree"
      @contextmenu.self.prevent="blankMenu($event)"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="dropOnEmpty"
      :class="{ 'drop-target': dragOver }"
    >
      <div v-for="p in projects" :key="p.name" class="project">
        <div
          class="project-row"
          :class="{ active: p.name === selectedProject }"
          @click="toggleProject(p.name)"
          @contextmenu.prevent="projectMenu($event, p.name)"
          @dragover.prevent
          @drop.prevent="importInto(p.name, '', $event)"
        >
          <span class="chevron">{{ open.has(p.name) ? '▾' : '▸' }}</span>
          <span class="name">{{ p.name }}</span>
          <!-- The project is locked while files are imported; say so instead of showing an error. -->
          <span v-if="importing.has(p.name)" class="importing">
            <span class="spinner"></span>importing files
          </span>
          <span v-else class="count">{{ p.programCount ?? '' }}</span>
        </div>

        <template v-if="open.has(p.name)">
          <div v-if="loading[p.name]" class="hint">Loading…</div>
          <TreeRow
            v-for="e in rootsOf(p.name)"
            :key="`${p.name}:${e.path}`"
            :project="p.name"
            :entry="e"
            :all="entriesByProject[p.name] ?? []"
            :depth="0"
            @open-workspace="$emit('openWorkspace', $event)"
            @changed="onChanged(p.name, $event)"
            @error="error = $event"
            @drop-import="importInto(p.name, $event.folder, $event.event)"
          />
        </template>
      </div>
    </div>

    <div
      v-if="ctx.show"
      class="ctx"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
      @click.self="ctx.show = false"
    >
      <template v-if="ctx.project">
        <div class="ctx-item" @click="newRootFolder">New folder</div>
        <div class="ctx-item" @click="pickGar">Import .gar into…</div>
        <div class="ctx-item" @click="exportProject">{{ ctx.exportWorkspace ? 'Export workspace' : 'Export project' }}</div>
        <div class="ctx-sep"></div>
        <div class="ctx-item danger" @click="deleteProject">Delete project</div>
      </template>
      <template v-else>
        <div class="ctx-item" @click="newProject">New project</div>
      </template>
    </div>

    <div v-if="error" class="hint error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import TreeRow from '@/components/projects/TreeRow.vue'
import { projectApi, fileApi } from '@/services/api'

interface Entry {
  path: string
  name: string
  folder: boolean
  size: number
  programId?: string | null
}

const emit = defineEmits<{ openWorkspace: [scope: { project: string; program: string }] }>()

const projects = ref<{ name: string; programCount?: number }[]>([])
const entriesByProject = reactive<Record<string, Entry[]>>({})
const loading = reactive<Record<string, boolean>>({})
const open = ref<Set<string>>(new Set())
const query = ref('')
const selectedProject = ref<string | null>(null)
const error = ref('')
const dragOver = ref(false)
/** Projects with an import running; the project is locked by Ghidra until it finishes. */
const importing = ref<Set<string>>(new Set())

function rootsOf(project: string): Entry[] {
  const all = entriesByProject[project] ?? []
  const q = query.value.trim().toLowerCase()
  if (q) return all.filter(e => e.name.toLowerCase().includes(q))
  // Only top-level entries are rendered; TreeRow asks for its own children.
  return all.filter(e => !e.path.substring(1).includes('/'))
}

async function loadProjects() {
  try {
    const { data } = await projectApi.list()
    projects.value = (data.projects ?? []).map((p: any) => ({
      name: p.name,
      programCount: p.programCount,
    }))
  } catch {
    error.value = 'Could not list projects.'
  }
}

async function toggleProject(name: string) {
  selectedProject.value = name
  const next = new Set(open.value)
  if (next.has(name)) {
    next.delete(name)
  } else {
    next.add(name)
    await reload(name)
  }
  open.value = next
}

/** A copy or a move can land in another project; both trees need to know. */
async function onChanged(source: string, target?: string) {
  await reload(source)
  if (target && target !== source && entriesByProject[target]) await reload(target)
}

async function reload(name: string) {
  loading[name] = true
  try {
    const { data } = await projectApi.tree(name)
    entriesByProject[name] = data.entries
  } catch (e: any) {
    const message = e?.response?.data?.error || ''
    // While an import holds the project, reading its tree fails. That is expected, not news.
    if (!(importing.value.has(name) && /in use/i.test(message))) {
      error.value = message || `Could not read project ${name}.`
    }
  } finally {
    loading[name] = false
  }
}

/**
 * Dropping a file on a project or a folder imports it there.
 *
 * A binary enters Akiba first (the file store gives it an id) and is then attached to the
 * project folder, which is the same order the Files page uses.
 */
/** A drop on the tree's empty space means "into the project that is open". */
async function dropOnEmpty(ev: DragEvent) {
  dragOver.value = false
  const project = selectedProject.value ?? projects.value[0]?.name
  if (!project) return
  await importInto(project, '', ev)
}

/**
 * Importing a file is a background job: the POST returns a task id, not a file id.
 *
 * The id is therefore looked for in the file list until it appears; consuming the progress
 * stream instead would tie this panel to an event format for one number.
 */
async function waitForBinaryId(name: string, timeoutMs = 120_000): Promise<number | null> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const { data } = await fileApi.list(0, 30)
      const hit = (data.files ?? []).find(
        f => f.name === name || (f.originalPath ?? '').endsWith(`/${name}`),
      )
      if (hit) return hit.id
    } catch {
      // A failed poll is not a failed import; keep trying until the timeout.
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  return null
}

async function importInto(project: string, folder: string, ev: DragEvent) {
  const files = [...(ev.dataTransfer?.files ?? [])]
  if (!files.length) return
  error.value = ''
  importing.value = new Set(importing.value).add(project)
  try {
    for (const file of files) {
      const form = new FormData()
      form.append('files', file, file.name)
      await fileApi.import(form)

      const id = await waitForBinaryId(file.name)
      if (id == null) {
        error.value = `${file.name} is still being imported; check the Files page in a moment.`
        continue
      }
      await projectApi.importBinary(project, { binaryId: String(id), folder })
    }
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Import failed.'
  } finally {
    const done = new Set(importing.value)
    done.delete(project)
    importing.value = done
    await reload(project)
  }
}

const ctx = reactive({ show: false, x: 0, y: 0, project: '' as string, exportWorkspace: false })

function blankMenu(ev: MouseEvent) {
  ctx.show = true
  ctx.x = ev.clientX
  ctx.y = ev.clientY
  ctx.project = ''
}

function projectMenu(ev: MouseEvent, name: string) {
  ctx.show = true
  ctx.x = ev.clientX
  ctx.y = ev.clientY
  ctx.project = name
  // Exporting the project archive and its files are two different things; the modifier decides.
  ctx.exportWorkspace = ev.shiftKey
}

async function newProject() {
  ctx.show = false
  const name = window.prompt('New project name')
  if (!name) return
  try {
    await projectApi.create(name)
    await loadProjects()
  } catch {
    error.value = 'Could not create the project.'
  }
}

async function newRootFolder() {
  ctx.show = false
  const name = window.prompt('Folder name')
  if (!name) return
  try {
    await projectApi.createFolder(ctx.project, '/', name)
    await reload(ctx.project)
  } catch {
    error.value = 'Could not create the folder.'
  }
}

function pickGar() {
  ctx.show = false
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.gar'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      await projectApi.importGar(file, ctx.project)
      await reload(ctx.project)
    } catch {
      error.value = 'Could not import the archive.'
    }
  }
  input.click()
}

async function exportProject() {
  ctx.show = false
  try {
    const response = ctx.exportWorkspace
      ? await projectApi.exportWorkspace(ctx.project)
      : await projectApi.exportProject(ctx.project)
    const url = URL.createObjectURL(new Blob([response.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `${ctx.project}${ctx.exportWorkspace ? '-workspace' : ''}.zip`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    error.value = 'Export failed.'
  }
}

async function deleteProject() {
  ctx.show = false
  const name = ctx.project
  if (!window.confirm(`Delete project ${name}? Its workspace files are deleted too.`)) return
  try {
    await projectApi.deleteProject(name, true, true, true)
    delete entriesByProject[name]
    await loadProjects()
  } catch {
    error.value = 'Could not delete the project.'
  }
}

function closeMenu() {
  ctx.show = false
}

onMounted(() => {
  void loadProjects()
  // A menu that survives a click elsewhere stops being a menu and becomes a panel.
  window.addEventListener('click', closeMenu)
})

onUnmounted(() => window.removeEventListener('click', closeMenu))
void emit
</script>

<style scoped>
.projects-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
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

.tree {
  flex: 1;
  overflow: auto;
}

.project-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-editor-foreground);
  cursor: pointer;
}

.project-row:hover,
.project-row.active {
  background: var(--akiba-chat-hover);
}

.chevron {
  width: 10px;
  color: var(--akiba-chat-text-faint);
}

.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.importing {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 400;
  font-size: 11px;
  color: var(--akiba-info-text);
}

.spinner {
  width: 9px;
  height: 9px;
  border: 1.5px solid color-mix(in srgb, var(--akiba-info-text) 35%, transparent);
  border-top-color: var(--akiba-info-text);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.count {
  color: var(--akiba-chat-text-faint);
  font-weight: 400;
  font-size: 11px;
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

.tree.drop-target {
  outline: 1px dashed var(--vscode-focusBorder);
  outline-offset: -4px;
}

.hint {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--akiba-chat-text-faint);
}

.hint.error {
  color: var(--akiba-danger-text);
}
</style>
