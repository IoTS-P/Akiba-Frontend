<template>
  <div class="scripts">
    <div class="actions">
      <button @click="openCreateModal" class="btn-primary">New Script</button>
      <button @click="loadScripts" class="btn-secondary">Refresh</button>
    </div>
    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="scripts.length === 0" class="empty">No scripts yet</div>
    <div v-else class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Language</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="script in scripts" :key="script.id">
            <td>{{ script.id }}</td>
            <td>
              <div class="name-cell">
                <span class="name">{{ script.name }}</span>
                <span v-if="script.description" class="desc">{{ script.description }}</span>
              </div>
            </td>
            <td>{{ script.language || '—' }}</td>
            <td>
              <span :class="['status', script.status || 'unknown']">
                {{ script.status || 'unknown' }}
              </span>
            </td>
            <td>{{ formatDate(script.createdAt) }}</td>
            <td class="actions-cell">
              <button @click="viewScript(script)" class="btn-action">View</button>
              <button @click="openRunModal(script)" class="btn-action">Run</button>
              <button @click="deleteScript(script)" class="btn-action danger">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create modal -->
    <div v-if="showCreateModal" class="modal" @click.self="showCreateModal = false">
      <div class="modal-content wide">
        <h2>New Script</h2>
        <div class="form-group">
          <label>Name</label>
          <input v-model="newScript.name" placeholder="Script name" />
        </div>
        <div class="form-group">
          <label>Description</label>
          <input v-model="newScript.description" placeholder="What does this script do?" />
        </div>
        <div class="form-group">
          <label>Language</label>
          <select v-model="newScript.language">
            <option value="kotlin">kotlin</option>
            <option value="java">java</option>
          </select>
        </div>
        <div class="form-group">
          <label>Code</label>
          <textarea
            v-model="newScript.code"
            placeholder="class MyScript { ... }"
            rows="14"
          ></textarea>
        </div>
        <div class="form-group inline">
          <label>
            <input type="checkbox" v-model="newScript.runAfterCreate" />
            Run immediately after creation
          </label>
        </div>
        <div v-if="createError" class="error">{{ createError }}</div>
        <div class="modal-actions">
          <button @click="showCreateModal = false" class="btn-secondary">Cancel</button>
          <button @click="createScript" class="btn-primary" :disabled="creating">
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Run modal -->
    <div v-if="showRunModal" class="modal" @click.self="showRunModal = false">
      <div class="modal-content">
        <h2>Run "{{ selectedScript?.name }}"</h2>
        <div class="form-group">
          <label>Binary IDs (comma-separated, leave empty to run without a binary)</label>
          <input v-model="runForm.binaryIdsRaw" placeholder="e.g. 1, 2, 3" />
        </div>
        <div class="form-group inline">
          <label>
            <input type="checkbox" v-model="runForm.parallel" />
            Run in parallel
          </label>
        </div>
        <div v-if="runError" class="error">{{ runError }}</div>
        <div class="modal-actions">
          <button @click="showRunModal = false" class="btn-secondary">Cancel</button>
          <button @click="confirmRun" class="btn-primary" :disabled="running">
            {{ running ? 'Starting…' : 'Run' }}
          </button>
        </div>
      </div>
    </div>

    <!-- View modal -->
    <div v-if="showViewModal" class="modal" @click.self="showViewModal = false">
      <div class="modal-content wide">
        <h2>{{ selectedScript?.name }}</h2>
        <div v-if="selectedScript?.description" class="desc-block">
          {{ selectedScript.description }}
        </div>
        <div class="section-label">Code</div>
        <pre class="code-block">{{ selectedScript?.code }}</pre>
        <div class="section-label">Latest Output</div>
        <pre class="code-block output">{{ selectedScript?.output || 'No output' }}</pre>

        <div class="section-label">Executions</div>
        <div v-if="executionsLoading" class="loading small">Loading executions…</div>
        <div v-else-if="executions.length === 0" class="empty small">No executions yet</div>
        <table v-else class="table sub">
          <thead>
            <tr>
              <th>ID</th>
              <th>Binary</th>
              <th>Status</th>
              <th>Started</th>
              <th>Finished</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ex in executions" :key="ex.id">
              <td>{{ ex.id }}</td>
              <td>{{ ex.binaryId ?? '—' }}</td>
              <td><span :class="['status', ex.status || 'unknown']">{{ ex.status || 'unknown' }}</span></td>
              <td>{{ formatDate(ex.startedAt) }}</td>
              <td>{{ formatDate(ex.finishedAt) }}</td>
            </tr>
          </tbody>
        </table>

        <div class="modal-actions">
          <button @click="showViewModal = false" class="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { scriptApi } from '@/services/api'
import type { Script, ScriptExecution } from '@/types'

const scripts = ref<Script[]>([])
const loading = ref(false)

const showCreateModal = ref(false)
const showRunModal = ref(false)
const showViewModal = ref(false)

const selectedScript = ref<Script | null>(null)
const executions = ref<ScriptExecution[]>([])
const executionsLoading = ref(false)

const creating = ref(false)
const running = ref(false)
const createError = ref('')
const runError = ref('')

const newScript = ref({
  name: '',
  description: '',
  language: 'kotlin',
  code: '',
  runAfterCreate: false
})

const runForm = ref({
  binaryIdsRaw: '',
  parallel: true
})

onMounted(loadScripts)

async function loadScripts() {
  loading.value = true
  try {
    const { data } = await scriptApi.list()
    scripts.value = data.scripts || []
  } catch (e) {
    console.error('Failed to load scripts:', e)
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  newScript.value = {
    name: '',
    description: '',
    language: 'kotlin',
    code: '',
    runAfterCreate: false
  }
  createError.value = ''
  showCreateModal.value = true
}

async function createScript() {
  if (!newScript.value.name.trim() || !newScript.value.code.trim()) {
    createError.value = 'Name and code are required.'
    return
  }
  creating.value = true
  createError.value = ''
  try {
    const { data } = await scriptApi.create({
      name: newScript.value.name.trim(),
      description: newScript.value.description.trim() || undefined,
      language: newScript.value.language,
      code: newScript.value.code
    })
    if (newScript.value.runAfterCreate) {
      try {
        await scriptApi.run(data.id, [], true)
      } catch (e: any) {
        console.error('Auto-run failed:', e)
      }
    }
    showCreateModal.value = false
    await loadScripts()
  } catch (e: any) {
    createError.value = e?.response?.data?.error || e?.message || 'Create failed.'
  } finally {
    creating.value = false
  }
}

function openRunModal(script: Script) {
  selectedScript.value = script
  runForm.value = { binaryIdsRaw: '', parallel: true }
  runError.value = ''
  showRunModal.value = true
}

async function confirmRun() {
  if (!selectedScript.value) return
  const ids = runForm.value.binaryIdsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n))

  running.value = true
  runError.value = ''
  try {
    await scriptApi.run(selectedScript.value.id, ids, runForm.value.parallel)
    showRunModal.value = false
    await loadScripts()
  } catch (e: any) {
    runError.value = e?.response?.data?.error || e?.message || 'Run failed.'
  } finally {
    running.value = false
  }
}

async function viewScript(script: Script) {
  selectedScript.value = script
  showViewModal.value = true
  executions.value = []
  executionsLoading.value = true
  try {
    // Refresh the script in case the output has changed.
    const { data } = await scriptApi.get(script.id)
    selectedScript.value = data
  } catch (e) {
    console.error('Failed to refresh script:', e)
  }
  try {
    const { data } = await scriptApi.executions(script.id)
    executions.value = data.executions || []
  } catch (e) {
    console.error('Failed to load executions:', e)
  } finally {
    executionsLoading.value = false
  }
}

async function deleteScript(script: Script) {
  if (!confirm(`Delete script "${script.name}"?`)) return
  try {
    await scriptApi.delete(script.id)
    await loadScripts()
  } catch (e) {
    console.error('Failed to delete script:', e)
  }
}

function formatDate(date: string | null | undefined) {
  if (!date) return '—'
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? date : d.toLocaleString()
}
</script>

<style scoped>
.scripts {
  background: #fff;
  padding: 24px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.actions {
  margin-bottom: 20px;
  display: flex;
  gap: 10px;
}

.btn-primary {
  padding: 10px 20px;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-secondary {
  padding: 10px 20px;
  background: #f5f5f5;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.loading, .empty {
  text-align: center;
  padding: 40px;
  color: #999;
}
.loading.small, .empty.small { padding: 14px; font-size: 13px; }

.table-wrapper { overflow-x: auto; }

.table {
  width: 100%;
  border-collapse: collapse;
}
.table.sub { margin-top: 6px; }

.table th, .table td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid #eee;
}
.table.sub th, .table.sub td { padding: 8px 12px; font-size: 13px; }

.table th {
  font-weight: 600;
  color: #666;
  font-size: 14px;
}

.name-cell { display: flex; flex-direction: column; gap: 2px; }
.name-cell .name { font-weight: 500; }
.name-cell .desc { font-size: 12px; color: #888; }

.actions-cell { white-space: nowrap; }

.status {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: 500;
  text-transform: lowercase;
}

.status.pending { background: #fff8e1; color: #f57c00; }
.status.running { background: #e3f2fd; color: #1976d2; }
.status.completed { background: #e8f5e9; color: #388e3c; }
.status.failed { background: #ffebee; color: #d32f2f; }
.status.cancelled { background: #f5f5f5; color: #777; }
.status.unknown { background: #f5f5f5; color: #999; }

.btn-action {
  padding: 6px 12px;
  margin-right: 6px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.btn-action.danger { color: #e94560; border-color: #e94560; }
.btn-action.danger:hover { background: #e94560; color: #fff; }

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
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content.wide { width: 800px; }

.modal-content h2 {
  margin-bottom: 20px;
  font-size: 20px;
}

.form-group { margin-bottom: 16px; }
.form-group.inline { display: flex; align-items: center; }

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
}
.form-group.inline label {
  margin-bottom: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 400;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  font-family: monospace;
  box-sizing: border-box;
}

.form-group textarea { resize: vertical; }

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.section-label {
  font-size: 14px;
  font-weight: 500;
  color: #666;
  margin: 16px 0 8px;
}

.desc-block {
  background: #f8f9fa;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  color: #555;
}

.code-block {
  background: #f8f9fa;
  padding: 14px;
  border-radius: 6px;
  font-size: 13px;
  font-family: monospace;
  overflow-x: auto;
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
}

.code-block.output { max-height: 200px; }

.error {
  color: #d32f2f;
  font-size: 13px;
  margin-top: 4px;
  margin-bottom: 8px;
}
</style>
