<template>
  <div v-if="open" class="modal" @click.self="close">
    <div class="modal-content wide">
      <h2>New Agent Session</h2>
      <p class="subtitle">Search for a binary file to analyze, or use an existing Ghidra project.</p>

      <div v-if="!llmConfigured" class="no-llm-warning">
        <strong>No LLM configuration found.</strong>
        You need to create an LLM configuration in
        <a href="#/settings" class="llm-link">Settings</a> before the agent can respond.
      </div>

      <!-- Mode tabs -->
      <div class="session-mode-tabs">
        <button
          :class="['tab-btn', { active: mode === 'binary' }]"
          @click="mode = 'binary'"
        >Search Binary</button>
        <button
          :class="['tab-btn', { active: mode === 'project' }]"
          @click="mode = 'project'"
        >Use Existing Project</button>
      </div>

      <!-- Tab 1: Binary search -->
      <div v-if="mode === 'binary'">
        <div class="form-group">
          <label>Search files</label>
          <div class="search-row">
            <input
              v-model="fileSearchQuery"
              placeholder="Search by name, ID, architecture…"
              @keydown.enter="searchFiles"
              class="search-input"
            />
            <button class="btn-secondary" @click="searchFiles" :disabled="searching">
              {{ searching ? 'Searching…' : 'Search' }}
            </button>
          </div>
        </div>

        <div v-if="searchError" class="error">{{ searchError }}</div>

        <div v-if="searchResults.length > 0" class="file-list">
          <div
            v-for="f in searchResults"
            :key="f.id"
            :class="['file-item', { selected: selectedFile?.id === f.id }]"
            @click="selectFile(f)"
          >
            <div class="file-name">{{ f.name }}</div>
            <div class="file-meta">
              <span class="tag">ID: {{ f.id }}</span>
              <span v-if="f.arch" class="tag">{{ f.arch }}</span>
              <span v-if="f.format" class="tag">{{ f.format }}</span>
            </div>
          </div>
        </div>
        <div v-else-if="fileSearchQuery && !searching" class="muted small">
          No matching files found.
        </div>

        <div v-if="selectedFile" class="form-group project-group">
          <label>Ghidra project</label>
          <div class="project-mode-row">
            <label class="radio-label">
              <input type="radio" value="new" v-model="projectMode" />
              Create new project
            </label>
            <label class="radio-label">
              <input type="radio" value="existing" v-model="projectMode" :disabled="ghidraProjects.length === 0" />
              Use existing project
            </label>
          </div>
          <input
            v-if="projectMode === 'new'"
            v-model="selectedProjectName"
            class="search-input"
            placeholder="Project name"
          />
          <select v-else v-model="selectedProjectName" class="search-input">
            <option value="" disabled>— Select project —</option>
            <option v-for="p in ghidraProjects" :key="p" :value="p">{{ p }}</option>
          </select>
          <div class="muted small project-hint">
            run_module and Ghidra scripts will use this project for the selected binary.
          </div>
          <div v-if="projectNameError" class="error project-error">{{ projectNameError }}</div>
        </div>
      </div>

      <!-- Tab 2: Use existing project → pick program -->
      <div v-if="mode === 'project'">
        <div class="form-group">
          <label>Select Ghidra project</label>
          <select v-model="selectedExistingProject" class="search-input" @change="onExistingProjectChange">
            <option value="" disabled>— Select project —</option>
            <option v-for="p in ghidraProjects" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>

        <div v-if="loadingPrograms" class="muted small">Loading programs…</div>
        <div v-else-if="programList.length > 0" class="file-list">
          <div
            v-for="prog in programList"
            :key="prog.name"
            :class="['file-item', { selected: selectedProgram?.name === prog.name }]"
            @click="selectedProgram = prog"
          >
            <div class="file-name">{{ prog.name }}</div>
            <div class="file-meta">
              <span class="tag">{{ prog.path }}</span>
            </div>
          </div>
        </div>
        <div v-else-if="selectedExistingProject && !loadingPrograms" class="muted small">
          No programs found in this project.
        </div>
      </div>

      <div class="modal-actions">
        <button @click="close" class="btn-secondary">Cancel</button>
        <button @click="createSession" class="btn-primary" :disabled="!canCreate">
          {{ creating ? 'Creating…' : createButtonLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { agentApi, fileApi, projectApi, workflowApi } from '@/services/api'
import type { AgentSession } from '@/types'
import type { FileSearchResult } from '@/services/api'

const props = defineProps<{
  open: boolean
  creating: boolean
  llmConfigured: boolean
  /** Model picked in the composer, recorded on the new session. */
  modelName?: string
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  'update:creating': [creating: boolean]
  created: [session: AgentSession]
}>()

const mode = ref<'binary' | 'project'>('binary')
const fileSearchQuery = ref('')
const searchResults = ref<FileSearchResult[]>([])
const searching = ref(false)
const searchError = ref('')
const selectedFile = ref<FileSearchResult | null>(null)
const ghidraProjects = ref<string[]>([])
const projectMode = ref<'new' | 'existing'>('new')
const selectedProjectName = ref('')
const validProjectName = /^[A-Za-z0-9._-]{1,64}$/
const modalError = ref('')

const selectedExistingProject = ref('')
const programList = ref<{ name: string; path: string }[]>([])
const selectedProgram = ref<{ name: string; path: string } | null>(null)
const loadingPrograms = ref(false)

const projectNameError = computed(() => {
  if (!selectedFile.value) return ''
  const name = selectedProjectName.value.trim()
  if (!name) return 'Project name is required.'
  if (!validProjectName.test(name) || name.includes('..')) {
    return 'Use 1-64 chars: letters, digits, dot, underscore or hyphen.'
  }
  return ''
})

const canCreate = computed(() => {
  if (props.creating) return false
  if (mode.value === 'binary') return true
  return !!selectedExistingProject.value && !!selectedProgram.value
})

const createButtonLabel = computed(() => {
  if (mode.value === 'binary') {
    return selectedFile.value ? `Analyze "${selectedFile.value.name}"` : 'Start Empty'
  }
  return selectedProgram.value ? `Analyze "${selectedProgram.value.name}"` : 'Select a program'
})

function close() {
  emit('update:open', false)
}

function defaultProjectName(file?: FileSearchResult | null): string {
  const base = (file?.name || 'agent-session')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'agent-session'
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return `${base}-${stamp}`
}

/** Opening the modal resets every field and reloads the project list. */
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    fileSearchQuery.value = ''
    searchResults.value = []
    searchError.value = ''
    modalError.value = ''
    selectedFile.value = null
    projectMode.value = 'new'
    selectedProjectName.value = defaultProjectName()
    mode.value = 'binary'
    selectedExistingProject.value = ''
    programList.value = []
    selectedProgram.value = null
    loadGhidraProjects()
  }
)

function selectFile(file: FileSearchResult) {
  selectedFile.value = file
  modalError.value = ''
  if (projectMode.value === 'new') selectedProjectName.value = defaultProjectName(file)
}

async function loadGhidraProjects() {
  try {
    const { data } = await workflowApi.projects()
    ghidraProjects.value = data.projects || []
    if (projectMode.value === 'existing') {
      selectedProjectName.value = ghidraProjects.value[0] || ''
    }
  } catch {
    ghidraProjects.value = []
    if (projectMode.value === 'existing') selectedProjectName.value = ''
  }
}

watch(projectMode, (m) => {
  modalError.value = ''
  if (m === 'existing') {
    selectedProjectName.value = ghidraProjects.value[0] || ''
  } else {
    selectedProjectName.value = defaultProjectName(selectedFile.value)
  }
})

watch(selectedProjectName, () => {
  modalError.value = ''
})

async function searchFiles() {
  if (!fileSearchQuery.value.trim()) return
  searching.value = true
  searchError.value = ''
  try {
    const { data } = await fileApi.search(fileSearchQuery.value.trim())
    searchResults.value = data.files || []
  } catch (e: any) {
    searchError.value = e?.response?.data?.error || e?.message || 'Search failed.'
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

async function onExistingProjectChange() {
  selectedProgram.value = null
  programList.value = []
  if (!selectedExistingProject.value) return
  loadingPrograms.value = true
  try {
    const { data } = await projectApi.programs(selectedExistingProject.value)
    programList.value = data.programs || []
  } catch {
    programList.value = []
  } finally {
    loadingPrograms.value = false
  }
}

async function createSession() {
  if (props.creating) return
  modalError.value = ''

  if (mode.value === 'binary') {
    if (selectedFile.value && projectNameError.value) {
      modalError.value = projectNameError.value
      return
    }
  } else if (!selectedExistingProject.value || !selectedProgram.value) {
    return
  }

  emit('update:creating', true)
  try {
    const payload: any = { modelName: props.modelName || undefined }
    if (mode.value === 'binary' && selectedFile.value) {
      payload.binaryId = selectedFile.value.id
      payload.sessionName = `Analysis of ${selectedFile.value.name}`
      payload.projectName = selectedProjectName.value.trim()
      payload.projectMode = projectMode.value
    } else if (mode.value === 'project') {
      payload.projectName = selectedExistingProject.value
      payload.projectMode = 'existing'
      payload.programName = selectedProgram.value!.name
      payload.sessionName = `Analysis of ${selectedProgram.value!.name}`
    }
    const { data } = await agentApi.createSession(payload)
    close()
    emit('created', data)
  } catch (e: any) {
    modalError.value = e?.response?.data?.error || e?.message || 'Failed to create session.'
  } finally {
    emit('update:creating', false)
  }
}
</script>

<style scoped>
/* Shared utilities, copied so the component does not depend on the view's scope. */
.btn-primary {
  padding: 10px 18px;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-secondary {
  padding: 10px 20px;
  background: #f5f5f5;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.muted {
  color: #999;
  text-align: center;
  padding: 14px;
}
.muted.small { font-size: 13px; }
.llm-link {
  color: #e94560;
  text-decoration: underline;
  cursor: pointer;
}
/* ---- New Session Modal ---------------------------------------------------- */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal-content {
  background: #fff;
  padding: 30px;
  border-radius: 10px;
  width: 500px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
}
.modal-content.wide { width: 650px; }
.modal-content h2 { margin-bottom: 6px; font-size: 20px; }
.subtitle { color: #666; font-size: 13px; margin: 0 0 18px; }

.session-mode-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
  border-bottom: 2px solid #eee;
}
.tab-btn {
  padding: 8px 18px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  font-size: 13px;
  color: #888;
  transition: color 0.15s, border-color 0.15s;
}
.tab-btn:hover { color: #555; }
.tab-btn.active {
  color: #e94560;
  border-bottom-color: #e94560;
  font-weight: 600;
}

.no-llm-warning {
  background: #fff3cd;
  border: 1px solid #ffeeba;
  color: #856404;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 16px;
}

.form-group { margin-bottom: 16px; }
.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
}

.search-row {
  display: flex;
  gap: 10px;
}
.search-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
}
.project-mode-row {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #444;
}
.project-hint { margin-top: 6px; }
.project-error { margin-top: 6px; font-size: 12px; }
.modal-error {
  background: #ffebee;
  border: 1px solid #ffcdd2;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 14px;
}

.file-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 6px;
  margin-bottom: 16px;
}
.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}
.file-item:hover { background: #fafafa; }
.file-item.selected { background: #fff5f7; border-left: 3px solid #e94560; }
.file-item:last-child { border-bottom: none; }
.file-name { font-size: 14px; font-weight: 500; }
.file-meta { display: flex; gap: 6px; align-items: center; }
.tag {
  font-size: 11px;
  padding: 2px 8px;
  background: #f5f5f5;
  border-radius: 4px;
  color: #666;
  white-space: nowrap;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
.btn-secondary {
  padding: 10px 20px;
  background: #f5f5f5;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-secondary:hover:not(:disabled) { background: #eee; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.error {
  color: #d32f2f;
  font-size: 13px;
  margin: 8px 0;
}
</style>
