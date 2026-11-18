<template>
  <div class="projects-sidebar">
    <div class="search-row">
      <input v-model="query" type="search" placeholder="Search programs…" aria-label="Search programs" />
    </div>

    <div class="tree">
      <div v-for="p in projects" :key="p.name" class="project">
        <div
          class="project-row"
          :class="{ active: p.name === selectedProject }"
          @click="toggleProject(p.name)"
          @dragover.prevent
          @drop.prevent="importInto(p.name, '', $event)"
        >
          <span class="chevron">{{ open.has(p.name) ? '▾' : '▸' }}</span>
          <span class="name">{{ p.name }}</span>
          <span class="count">{{ p.programCount ?? '' }}</span>
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
            @changed="reload(p.name)"
            @drop-import="importInto(p.name, $event.folder, $event.event)"
          />
        </template>
      </div>
    </div>

    <div v-if="error" class="hint error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
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

async function reload(name: string) {
  loading[name] = true
  try {
    const { data } = await projectApi.tree(name)
    entriesByProject[name] = data.entries
  } catch {
    error.value = `Could not read project ${name}.`
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
async function importInto(project: string, folder: string, ev: DragEvent) {
  const files = [...(ev.dataTransfer?.files ?? [])]
  if (!files.length) return
  try {
    for (const file of files) {
      const form = new FormData()
      form.append('files', file, file.name)
      const imported = await fileApi.import(form)
      for (const id of imported.data.fileIds ?? []) {
        await projectApi.importBinary(project, { binaryId: String(id), folder })
      }
    }
    await reload(project)
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Import failed.'
  }
}

onMounted(loadProjects)
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

.count {
  color: var(--akiba-chat-text-faint);
  font-weight: 400;
  font-size: 11px;
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
