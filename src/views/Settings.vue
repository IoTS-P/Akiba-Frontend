<template>
  <div class="settings">
    <div class="card">
      <h2>LLM Configuration</h2>
      <p class="subtitle">
        Configure the language model used by Akiba's chat agent.
        Credentials are stored in <code>~/.akiba/llm_keys.json</code>.
      </p>

      <div v-if="loading" class="muted">Loading…</div>

      <template v-else>
        <!-- Saved configuration selector -->
        <div v-if="keys.length > 0" class="config-selector">
          <label class="selector-label">Saved Configurations</label>
          <div class="selector-row">
            <select v-model="selectedConfigIndex" class="config-select" @change="onConfigSelected">
              <option :value="-1">— New configuration —</option>
              <option
                v-for="(k, idx) in keys"
                :key="k.provider + '|' + k.modelNames.join(',') + '|' + (k.baseUrl || '')"
                :value="idx"
              >
                {{ k.provider }} / {{ k.modelNames.length }} models{{ k.baseUrl ? ` (${k.baseUrl})` : '' }}
              </option>
            </select>
            <button
              type="button"
              class="btn-danger small"
              :disabled="selectedConfigIndex < 0"
              @click="deleteSelectedConfig"
            >
              Delete
            </button>
          </div>
        </div>

        <div v-else class="muted small">No saved configurations yet. Fill in the form below to create one.</div>

        <form @submit.prevent="save" class="form">
          <div class="form-row">
            <div class="form-group">
              <label>Provider</label>
              <select v-model="form.provider" :disabled="saving">
                <option value="" disabled>— select —</option>
                <option v-for="p in providers" :key="p.id" :value="p.id">
                  {{ p.displayName }}
                </option>
              </select>
            </div>
            <div class="form-group flex2">
              <label>Base URL <span class="hint">(optional)</span></label>
              <input
                v-model="form.baseUrl"
                placeholder="Override the provider's default endpoint"
                :disabled="saving"
              />
            </div>
          </div>

          <div class="form-group">
            <label>API key</label>
            <div class="key-row">
              <input
                v-model="form.apiKey"
                placeholder="sk-…"
                :type="showKey ? 'text' : 'password'"
                autocomplete="off"
                :disabled="saving"
                class="key-input"
              />
              <button type="button" class="btn-secondary" @click="showKey = !showKey">
                {{ showKey ? 'Hide' : 'Show' }}
              </button>
              <button
                type="button"
                class="btn-secondary"
                @click="fetchModelList"
                :disabled="fetchingModels || !form.provider || !form.apiKey"
              >
                {{ fetchingModels ? 'Fetching…' : 'Fetch Models' }}
              </button>
            </div>
          </div>

          <div v-if="availableModels.length" class="form-group">
            <label>Models to save</label>
            <div class="model-checkbox-list">
              <label v-for="m in availableModels" :key="m" class="model-checkbox-item">
                <input type="checkbox" :value="m" v-model="selectedModelNames" />
                {{ m }}
              </label>
            </div>
          </div>

          <div v-if="error" class="error">{{ error }}</div>
          <div v-if="message" class="success">{{ message }}</div>

          <div class="actions">
            <button type="submit" class="btn-primary" :disabled="saving">
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </form>
      </template>
    </div>

    <!-- Runtime Configuration -->
    <div class="card">
      <h2>Runtime Configuration</h2>
      <p class="subtitle">
        Create and manage workflow configuration files for batch pipeline tasks.
        Configurations are saved to <code>~/.akiba/user_configs/</code>.
        <em>(Batch pipeline execution is currently under development.)</em>
      </p>

      <div class="runtime-actions">
        <button
          v-for="c in runtimeConfigs"
          :key="c.name"
          :class="['btn-secondary', { active: activeConfig === c.name }]"
          @click="loadRuntimeConfig(c.name)"
        >
          {{ c.name }}
        </button>
        <button class="btn-secondary" @click="newRuntimeConfig">+ New</button>
      </div>

      <template v-if="activeConfig">
        <!-- Config name & editor mode toggle -->
        <div class="runtime-toolbar">
          <div class="form-group" style="flex:1; margin:0">
            <label>Configuration Name</label>
            <input v-model="runtimeConfigName" placeholder="e.g. my_workflow" :disabled="savingConfig" />
          </div>
          <div class="mode-toggle">
            <button :class="['btn-sm', editorMode === 'gui' ? 'active' : '']" @click="switchToGui">GUI</button>
            <button :class="['btn-sm', editorMode === 'json' ? 'active' : '']" @click="switchToJson">JSON</button>
          </div>
        </div>

        <!-- GUI mode -->
        <div v-if="editorMode === 'gui'" class="gui-editor">
          <!-- Auth -->
          <details class="config-section" open>
            <summary>Authentication</summary>
            <div class="form-row">
              <div class="form-group"><label>Username</label><input v-model="gui.username" placeholder="akiba" /></div>
              <div class="form-group"><label>Password</label><input v-model="gui.password" placeholder="akiba" type="password" /></div>
              <div class="form-group"><label>Instance Name</label><input v-model="gui.usingInstance" placeholder="akiba-instance" /></div>
            </div>
          </details>

          <!-- Global -->
          <details class="config-section">
            <summary>Global Settings</summary>
            <div class="form-row">
              <div class="form-group">
                <label>Console Log Level <span class="hint">(OFF for batch workflow)</span></label>
                <select v-model="gui.globalConsoleLogLevel">
                  <option selected>OFF</option><option>FATAL</option><option>ERROR</option><option>WARN</option><option>INFO</option><option>DEBUG</option><option>TRACE</option>
                </select>
              </div>
              <div class="form-group">
                <label>File Log Level</label>
                <select v-model="gui.globalFileLogLevel">
                  <option>OFF</option><option>FATAL</option><option>ERROR</option><option>WARN</option><option>INFO</option><option selected>DEBUG</option><option>TRACE</option>
                </select>
              </div>
            </div>
          </details>

          <!-- General -->
          <details class="config-section">
            <summary>General</summary>
            <div class="form-row">
              <div class="form-group">
                <label>Binaries Root <span class="hint">(auto: {{ computedBinariesRoot }})</span></label>
                <input :value="computedBinariesRoot" readonly class="readonly-input" tabindex="-1" />
              </div>
              <div class="form-group">
                <label>Import Root <span class="hint">(managed via Files page)</span></label>
                <input :value="gui.general.importRoot || '(auto-determined)'" disabled class="readonly-input" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Processor</label><input v-model="gui.general.processor" placeholder="n/a" /></div>
              <div class="form-group"><label>Auto Analysis Timeout (s)</label><input v-model.number="gui.general.autoAnalysisTimeout" type="number" /></div>
              <div class="form-group"><label>Threads</label><input v-model.number="gui.general.threads" type="number" min="1" /></div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Logs Root <span class="hint">(default: ~/.akiba/logs)</span></label>
                <input v-model="gui.general.logsRoot" :placeholder="gui.general.logsRoot || '~/.akiba/logs'" />
              </div>
              <div class="form-group">
                <label>Workspace Root <span class="hint">(default: ~/.akiba/workspace)</span></label>
                <input v-model="gui.general.workspaceRoot" :placeholder="gui.general.workspaceRoot || '~/.akiba/workspace'" />
              </div>
            </div>
          </details>

          <!-- Ghidra Project -->
          <details class="config-section">
            <summary>Ghidra Project</summary>
            <div class="form-row">
              <div class="form-group"><label>Project Root</label><input v-model="gui.ghidra.projectRoot" placeholder="ghidra_projects" /></div>
              <div class="form-group"><label>Project Name</label><input v-model="gui.ghidra.name" placeholder="my_project" /></div>
              <div class="form-group">
                <label>Mode</label>
                <select v-model="gui.ghidra.mode">
                  <option value="new">new</option>
                  <option value="fork">fork</option>
                  <option value="base">base</option>
                </select>
              </div>
            </div>
            <div class="form-row" v-if="gui.ghidra.mode === 'fork'">
              <div class="form-group"><label>Fork To</label><input v-model="gui.ghidra.forkTo" placeholder="(optional)" /></div>
              <div class="form-group inline-check"><label><input type="checkbox" v-model="gui.ghidra.forkOnTask" /> Fork on Task</label></div>
            </div>
            <div class="form-row">
              <div class="form-group inline-check"><label><input type="checkbox" v-model="gui.ghidra.saveProject" /> Save Project</label></div>
              <div class="form-group inline-check"><label><input type="checkbox" v-model="gui.ghidra.noCreateProgram" /> No Create Program</label></div>
              <div class="form-group inline-check"><label><input type="checkbox" v-model="gui.ghidra.overwriteProject" /> Overwrite Project</label></div>
              <div class="form-group inline-check"><label><input type="checkbox" v-model="gui.ghidra.deletePreviousProgram" /> Delete Previous</label></div>
            </div>
          </details>

          <!-- SQL Source -->
          <details class="config-section">
            <summary>Database Source (SQL)</summary>
            <div class="form-row">
              <div class="form-group"><label>Server IP</label><input v-model="gui.sqlSource.serverIP" placeholder="127.0.0.1" /></div>
              <div class="form-group"><label>Server Port</label><input v-model.number="gui.sqlSource.serverPort" type="number" /></div>
              <div class="form-group"><label>Snapshot</label><input v-model="gui.sqlSource.useSnapshot" placeholder="current" /></div>
            </div>
            <div class="form-row">
              <div class="form-group flex2"><label>Constraint (WHERE clause)</label><input v-model="gui.sqlSource.constraint" placeholder="WHERE original_path LIKE '%.elf'" /></div>
              <div class="form-group inline-check"><label><input type="checkbox" v-model="gui.sqlSource.disableUpdate" /> Disable Update</label></div>
            </div>
            <div class="form-group"><label>Local Cache Path</label><input v-model="gui.sqlSource.useLocalCache" placeholder="(optional)" /></div>
          </details>

          <!-- LLM -->
          <details class="config-section">
            <summary>LLM (for AgentModule tasks)</summary>

            <!-- Import from separately saved LLM configs -->
            <div v-if="keys.length > 0" class="llm-import-row">
              <label class="import-label">Import from saved LLM config:</label>
              <select v-model="selectedSavedLlmIdx" class="import-select" @change="importSavedLlm">
                <option :value="-1">— Select —</option>
                <option v-for="(k, idx) in keys" :key="idx" :value="idx">
                  {{ k.provider }} / {{ k.modelNames.length }} models{{ k.baseUrl ? ` (${k.baseUrl})` : '' }}
                </option>
              </select>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Provider</label>
                <select v-model="gui.llm.provider">
                  <option value="">— Not set —</option>
                  <option v-for="p in llmProviderList" :key="p.value" :value="p.value">{{ p.label }}</option>
                </select>
              </div>
              <div class="form-group">
                  <label>Model Name</label>
                  <div v-if="availableRuntimeModels.length > 0" class="model-row">
                    <select v-model="gui.llm.modelName" class="model-select">
                      <option value="" disabled>— select a model —</option>
                      <option v-for="m in availableRuntimeModels" :key="m" :value="m">{{ m }}</option>
                    </select>
                    <button type="button" class="btn-secondary sm" @click="reloadRuntimeModels" :disabled="fetchingRuntimeModels" title="Refresh models">
                      {{ fetchingRuntimeModels ? '⋯' : '↻' }}
                    </button>
                  </div>
                  <input v-else v-model="gui.llm.modelName" placeholder="deepseek-v4-flash" />
                </div>
              <div class="form-group"><label>Base URL <span class="hint">(required for LLM, optional for local)</span></label><input v-model="gui.llm.baseUrl" placeholder="e.g. https://api.deepseek.com" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>API Key Env <span class="hint">(or literal key below)</span></label><input v-model="gui.llm.apiKeyEnv" placeholder="AKIBA_LLM_API_KEY" /></div>
              <div class="form-group"><label>API Key (literal) <span class="hint">(required if no env)</span></label><input v-model="gui.llm.apiKey" type="password" placeholder="sk-…" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Temperature</label><input v-model.number="gui.llm.temperature" type="number" step="0.1" min="0" max="2" /></div>
              <div class="form-group"><label>Top P</label><input v-model.number="gui.llm.topP" type="number" step="0.1" min="0" max="1" /></div>
              <div class="form-group"><label>Max Tokens</label><input v-model.number="gui.llm.maxTokens" type="number" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Timeout (s)</label><input v-model.number="gui.llm.timeoutSeconds" type="number" /></div>
              <div class="form-group"><label>Max Retries</label><input v-model.number="gui.llm.maxRetries" type="number" /></div>
              <div class="form-group inline-check"><label><input type="checkbox" v-model="gui.llm.debugLogging" /> Debug Logging</label></div>
            </div>
          </details>

          <!-- Tasks -->
          <details class="config-section" open>
            <summary>Tasks <span class="badge">{{ gui.tasks.length }}</span></summary>
            <div v-for="(task, idx) in gui.tasks" :key="idx" class="task-item">
              <div class="form-row">
                <div class="form-group flex2"><label>Main Class</label><input v-model="task.mainClassName" placeholder="org.iotsplab.akiba.module.AkibaUtils" /></div>
                <div class="form-group"><label>Timeout (s) <span class="hint">(empty = no limit)</span></label><input :value="task.timeout" @input="(e: any) => { const v = e.target.value; (task as any).timeout = v === '' ? null : Number(v) }" type="number" placeholder="e.g. 600" /></div>
                <div class="form-group"><label>Table Name</label><input v-model="task.tableName" placeholder="(auto)" /></div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Log Level (file)</label>
                  <select v-model="task.fileLogLevel">
                    <option>OFF</option><option>FATAL</option><option>ERROR</option><option>WARN</option><option selected>INFO</option><option>DEBUG</option><option>TRACE</option>
                  </select>
                </div>
                <div class="form-group"><label>Config Key</label><input v-model="task.configKey" placeholder="(auto-set with module config)" /></div>
                <div class="form-group task-actions">
                  <label>&nbsp;</label>
                  <button class="btn-danger sm" @click="removeTask(idx)" :disabled="gui.tasks.length <= 1">✕</button>
                </div>
              </div>
              <!-- Module Config JSON editor -->
              <details class="task-module-config">
                <summary>Module Config <span v-if="task.moduleConfig.trim()" class="badge">JSON</span></summary>
                <div class="form-group" style="margin-top:8px">
                  <label>Module-specific JSON configuration</label>
                  <textarea v-model="task.moduleConfig" class="module-json-editor" rows="6" spellcheck="false" placeholder='e.g. {"option1": "value1", "option2": 42}'></textarea>
                </div>
              </details>
            </div>
            <button class="btn-secondary sm" @click="addTask" style="margin-top:8px">+ Add Task</button>
          </details>
        </div>

        <!-- JSON mode -->
        <div v-else class="form-group">
          <label>JSON Editor</label>
          <textarea v-model="runtimeConfigJson" class="json-editor" rows="20" spellcheck="false" :disabled="savingConfig"></textarea>
        </div>

        <div class="form-group">
          <label>Description</label>
          <input v-model="runtimeConfigDesc" placeholder="What does this workflow do?" :disabled="savingConfig" />
        </div>

        <div v-if="configError || configMessage" class="messages">
          <div v-if="configError" class="error">{{ configError }}</div>
          <div v-if="configMessage" class="success">{{ configMessage }}</div>
        </div>

        <div class="actions">
          <button class="btn-danger" @click="deleteRuntimeConfig" :disabled="savingConfig">Delete</button>
          <button class="btn-primary" @click="saveRuntimeConfig" :disabled="savingConfig || !runtimeConfigName.trim()">
            {{ savingConfig ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </template>

      <div v-else class="muted small">
        Select an existing configuration above or create a new one.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { llmConfigApi, runtimeConfigApi } from '@/services/api'
import type { LLMProviderInfo, StoredKeyEntry, RuntimeConfigEntry } from '@/services/api'

const providers = ref<LLMProviderInfo[]>([])
const keys = ref<StoredKeyEntry[]>([])
const loading = ref(false)
const saving = ref(false)
const showKey = ref(false)
const fetchingModels = ref(false)
const error = ref('')
const message = ref('')
const availableModels = ref<string[]>([])
const selectedModelNames = ref<string[]>([])
const selectedConfigIndex = ref(-1) // -1 means "new config"

const form = reactive({
  provider: '',
  apiKey: '',
  baseUrl: ''
})

onMounted(async () => {
  loading.value = true
  try {
    const [{ data: provData }, { data: keyData }] = await Promise.all([
      llmConfigApi.providers(),
      llmConfigApi.keys()
    ])
    providers.value = provData.providers || []
    keys.value = keyData.keys || []

    if (keys.value.length > 0) {
      selectedConfigIndex.value = 0
      populateFormFromKey(keys.value[0])
    }
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Failed to load configuration'
  } finally {
    loading.value = false
  }
})

function populateFormFromKey(key: StoredKeyEntry) {
  form.provider = key.provider
  form.baseUrl = key.baseUrl || ''
  form.apiKey = '' // API key is not returned for security
  selectedModelNames.value = key.modelNames.filter(Boolean)
  availableModels.value = key.modelNames.filter(Boolean)
}

function onConfigSelected() {
  const idx = selectedConfigIndex.value
  if (idx >= 0 && idx < keys.value.length) {
    populateFormFromKey(keys.value[idx])
    error.value = ''
    message.value = ''
  } else {
    // New config — clear form
    form.provider = ''
    form.baseUrl = ''
    form.apiKey = ''
    availableModels.value = []
    selectedModelNames.value = []
    error.value = ''
    message.value = ''
  }
}

async function deleteSelectedConfig() {
  const idx = selectedConfigIndex.value
  if (idx < 0 || idx >= keys.value.length) return
  const key = keys.value[idx]
  const label = `${key.provider} / ${key.modelNames.join(', ')}`
  if (!confirm(`Delete LLM configuration "${label}"?`)) return

  saving.value = true
  error.value = ''
  message.value = ''
  try {
    await llmConfigApi.deleteKey(key.provider, key.modelNames[0] || '')
    const { data } = await llmConfigApi.keys()
    keys.value = data.keys || []
    if (keys.value.length === 0) {
      selectedConfigIndex.value = -1
      form.provider = ''
      form.baseUrl = ''
      form.apiKey = ''
      availableModels.value = []
      selectedModelNames.value = []
    } else {
      selectedConfigIndex.value = 0
      populateFormFromKey(keys.value[0])
    }
    message.value = 'Configuration deleted.'
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Failed to delete'
  } finally {
    saving.value = false
  }
}

async function fetchModelList() {
  error.value = ''
  message.value = ''
  availableModels.value = []
  selectedModelNames.value = []

  if (!form.provider || !form.apiKey) {
    error.value = 'Provider and API key are required to fetch models.'
    return
  }

  fetchingModels.value = true
  try {
    const { data } = await llmConfigApi.fetchModels(
      form.provider,
      form.apiKey,
      form.baseUrl || undefined
    )
    availableModels.value = data.models || []
    // Auto-select all fetched models
    selectedModelNames.value = [...availableModels.value]
    if (availableModels.value.length === 0) {
      message.value = 'No models returned by the provider.'
    }
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Failed to fetch models'
  } finally {
    fetchingModels.value = false
  }
}

async function save() {
  error.value = ''
  message.value = ''
  if (!form.provider || selectedModelNames.value.length === 0 || !form.apiKey.trim()) {
    error.value = 'Provider, at least one model, and API key are required.'
    return
  }

  saving.value = true
  try {
    await llmConfigApi.addKey({
      provider: form.provider,
      modelNames: selectedModelNames.value.map(s => s.trim()).filter(Boolean),
      baseUrl: form.baseUrl?.trim() || undefined,
      apiKey: form.apiKey.trim()
    })
    // Reload keys and auto-select the new/updated entry
    const { data } = await llmConfigApi.keys()
    keys.value = data.keys || []
    // Find the saved entry by matching any of the saved models
    const idx = keys.value.findIndex(
      (k) => k.provider === form.provider && selectedModelNames.value.some(m => k.modelNames.includes(m))
    )
    selectedConfigIndex.value = idx >= 0 ? idx : 0
    message.value = 'Configuration saved.'
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Failed to save configuration'
  } finally {
    saving.value = false
  }
}

// ---- Runtime configuration --------------------------------------------------

// Supported LLM providers (matches LLMProvider enum in framework)
const llmProviderList = [
  { value: 'DEEP_SEEK', label: 'DeepSeek' },
  { value: 'OPEN_AI', label: 'OpenAI' },
  { value: 'ANTHROPIC', label: 'Anthropic' },
  { value: 'GOOGLE_GEMINI', label: 'Google Gemini' },
  { value: 'MISTRAL', label: 'Mistral AI' },
  { value: 'OLLAMA', label: 'Ollama' },
  { value: 'AZURE_OPEN_AI', label: 'Azure OpenAI' },
  { value: 'MOONSHOT', label: 'Moonshot / Kimi' },
  { value: 'ZHIPU', label: 'Zhipu AI / ChatGLM' },
  { value: 'QWEN', label: 'Qwen / DashScope' },
  { value: 'OPEN_AI_COMPATIBLE', label: 'OpenAI-Compatible' }
]

const runtimeConfigs = ref<RuntimeConfigEntry[]>([])

// Compute binaries root from username/instance for display
const computedBinariesRoot = computed(() => {
  const user = gui.username || 'default'
  const inst = gui.usingInstance || 'default'
  return `~/.akiba/binaries/${user}/${inst}/`
})

// Import from saved LLM configs (the keys from the LLM Configuration card above)
const selectedSavedLlmIdx = ref(-1)
const availableRuntimeModels = ref<string[]>([])
const fetchingRuntimeModels = ref(false)

function normalizeModelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  return trimmed.endsWith('/v1') ? `${trimmed}/models` : `${trimmed}/v1/models`
}

function importSavedLlm() {
  const idx = selectedSavedLlmIdx.value
  if (idx < 0 || idx >= keys.value.length) return
  const k = keys.value[idx]
  gui.llm.provider = k.provider
  gui.llm.modelName = k.modelNames[0] || ''
  gui.llm.baseUrl = k.baseUrl || ''
  // Prefix with 'K_' to ensure the env var name doesn't start with a digit
  // (POSIX env var names must start with letter or underscore).
  gui.llm.apiKeyEnv = 'K_' + k.id.substring(0, 8)
  gui.llm.apiKey = ''
  // Populate model dropdown from the saved config's modelNames directly
  availableRuntimeModels.value = k.modelNames
}

async function reloadRuntimeModels() {
  const baseUrl = gui.llm.baseUrl
  const apiKey = gui.llm.apiKey
  if (!baseUrl || !apiKey) return
  fetchingRuntimeModels.value = true
  availableRuntimeModels.value = []
  try {
    const url = normalizeModelsUrl(baseUrl)
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const body = await resp.json()
    // OpenAI-compatible response: { data: [{ id: "model-name" }, ...] }
    const models: string[] = body.data?.map((m: any) => m.id).filter(Boolean) || []
    availableRuntimeModels.value = models
  } catch (_e: any) {
    // keep empty so text input shows
  } finally {
    fetchingRuntimeModels.value = false
  }
}
const activeConfig = ref<string | null>(null)
const runtimeConfigName = ref('')
const runtimeConfigJson = ref('')
const runtimeConfigDesc = ref('')
const savingConfig = ref(false)
const configError = ref('')
const configMessage = ref('')
const editorMode = ref<'gui' | 'json'>('gui')

// ---- GUI form model ---------------------------------------------------------
interface GuiTask {
  mainClassName: string
  timeout: number | null
  consoleLogLevel: string
  fileLogLevel: string
  tableName: string
  configKey: string
  moduleConfig: string
}
const gui = reactive({
  username: 'akiba',
  password: 'akiba',
  usingInstance: 'akiba-instance',
  globalConsoleLogLevel: 'INFO',
  globalFileLogLevel: 'DEBUG',
  general: {
    binariesRoot: '',
    importRoot: '' as string,
    processor: 'n/a',
    autoAnalysisTimeout: 180,
    threads: 1,
    logsRoot: '',
    workspaceRoot: ''
  },
  ghidra: {
    projectRoot: 'ghidra_projects',
    name: 'my_project',
    mode: 'new' as string,
    forkTo: '' as string,
    forkOnTask: false,
    saveProject: true,
    noCreateProgram: false,
    overwriteProject: false,
    deletePreviousProgram: false
  },
  sqlSource: {
    serverIP: '127.0.0.1',
    serverPort: 31777,
    useSnapshot: 'current',
    constraint: "WHERE original_path LIKE '%.elf'",
    disableUpdate: false,
    useLocalCache: '' as string
  },
  llm: {
    provider: '',
    modelName: '',
    apiKeyEnv: '',
    apiKey: '',
    baseUrl: '',
    temperature: null as number | null,
    topP: null as number | null,
    maxTokens: null as number | null,
    timeoutSeconds: 120,
    maxRetries: 3,
    debugLogging: false
  },
  tasks: [
    { mainClassName: 'org.iotsplab.akiba.module.AkibaUtils', timeout: null, consoleLogLevel: 'INFO', fileLogLevel: 'INFO', tableName: '', configKey: '', moduleConfig: '' },
    { mainClassName: 'org.iotsplab.akiba.module.AkibaExample1', timeout: null, consoleLogLevel: 'DEBUG', fileLogLevel: 'DEBUG', tableName: 'example_table_1', configKey: '', moduleConfig: '' }
  ] as GuiTask[]
})

onMounted(async () => {
  await loadRuntimeConfigs()
})

async function loadRuntimeConfigs() {
  try {
    const { data } = await runtimeConfigApi.list()
    runtimeConfigs.value = data.configs || []
  } catch (_e: any) {
    runtimeConfigs.value = []
  }
}

// ---- GUI <-> JSON sync ------------------------------------------------------

function guiToJson(): string {
  const mainObj: any = {}
  if (gui.username) mainObj.username = gui.username
  if (gui.password) mainObj.password = gui.password
  if (gui.usingInstance) mainObj.usingInstance = gui.usingInstance

  const g = gui.general
  const general: any = {}
  if (g.importRoot) general.importRoot = g.importRoot
  general.processor = g.processor
  general.autoAnalysisTimeout = g.autoAnalysisTimeout
  general.threads = g.threads
  if (g.logsRoot) general.logsRoot = g.logsRoot
  if (g.workspaceRoot) general.workspaceRoot = g.workspaceRoot
  mainObj.general = general
  mainObj.globalConsoleLogLevel = 'OFF'
  mainObj.globalFileLogLevel = gui.globalFileLogLevel

  const gp = gui.ghidra
  const gproj: any = { projectRoot: gp.projectRoot, mode: gp.mode, saveProject: gp.saveProject, noCreateProgram: gp.noCreateProgram }
  if (gp.name) gproj.name = gp.name
  if (gp.forkTo) gproj.forkTo = gp.forkTo
  gproj.forkOnTask = gp.forkOnTask
  gproj.overwriteProject = gp.overwriteProject
  gproj.deletePreviousProgram = gp.deletePreviousProgram
  mainObj.withGhidraProject = gproj

  const sql = gui.sqlSource
  const sqlObj: any = { serverIP: sql.serverIP, serverPort: sql.serverPort, useSnapshot: sql.useSnapshot}
  if (sql.constraint) sqlObj.constraint = sql.constraint
  sqlObj.disableUpdate = sql.disableUpdate
  if (sql.useLocalCache) sqlObj.useLocalCache = sql.useLocalCache
  mainObj.sqlSource = sqlObj

  // LLM
  if (gui.llm.provider) {
    const llm: any = { provider: gui.llm.provider, modelName: gui.llm.modelName }
    if (gui.llm.apiKeyEnv) llm.apiKeyEnv = gui.llm.apiKeyEnv
    if (gui.llm.apiKey) llm.apiKey = gui.llm.apiKey
    if (gui.llm.baseUrl) llm.baseUrl = gui.llm.baseUrl
    if (gui.llm.temperature != null) llm.temperature = gui.llm.temperature
    if (gui.llm.topP != null) llm.topP = gui.llm.topP
    if (gui.llm.maxTokens != null) llm.maxTokens = gui.llm.maxTokens
    llm.timeoutSeconds = gui.llm.timeoutSeconds
    llm.maxRetries = gui.llm.maxRetries
    llm.debugLogging = gui.llm.debugLogging
    mainObj.llm = llm
  }

  // Build wrapped structure: {"main": <mainConfig>, "<ModuleName>": <moduleConfig>}
  const wrapped: any = { main: mainObj }

  // Add module configs at top level
  gui.tasks.filter(t => t.mainClassName.trim() && t.moduleConfig.trim()).forEach(t => {
    const moduleName = t.mainClassName.trim().split('.').pop()!
    try {
      wrapped[moduleName] = JSON.parse(t.moduleConfig)
    } catch (_) { /* skip invalid JSON */ }
  })

  // Build tasks array
  mainObj.tasks = gui.tasks.filter(t => t.mainClassName.trim()).map(t => {
    const task: any = { mainClassName: t.mainClassName.trim() }
    if (t.timeout != null && t.timeout > 0) {
      task.timeout = t.timeout
    } else {
      task.timeout = -1
    }
    if (t.fileLogLevel && t.fileLogLevel !== 'INFO') task.fileLogLevel = t.fileLogLevel.toLowerCase()
    if (t.tableName.trim()) task.tableName = t.tableName.trim()
    // Auto-set configKey for tasks with module config
    const moduleName = t.mainClassName.trim().split('.').pop()!
    if (t.moduleConfig.trim()) {
      task.configKey = '@@/' + moduleName
    } else if (t.configKey.trim()) {
      task.configKey = t.configKey.trim()
    }
    return task
  })

  return JSON.stringify(wrapped, null, 2)
}

function jsonToGui(json: string) {
  const moduleConfigs = new Map<string, string>()
  let proc: any
  try {
    const root = JSON.parse(json)
    if (!root || typeof root !== 'object') return

    // Check if wrapped format: {"main": {...}, "<Module>": {...}}
    if (root.main && typeof root.main === 'object') {
      proc = root.main
      // Extract module configs from top-level keys (everything except "main")
      for (const key of Object.keys(root)) {
        if (key !== 'main' && root[key] && typeof root[key] === 'object') {
          moduleConfigs.set(key, JSON.stringify(root[key], null, 2))
        }
      }
    } else {
      proc = root  // Old flat format
    }
  } catch (_e: any) { return }

  try {
    if (!proc || typeof proc !== 'object') return

    gui.username = proc.username || 'akiba'
    gui.password = proc.password || ''
    gui.usingInstance = proc.usingInstance || ''
    gui.globalConsoleLogLevel = proc.globalConsoleLogLevel || 'OFF'
    gui.globalFileLogLevel = proc.globalFileLogLevel || 'DEBUG'

    const general = proc.general || {}
    gui.general.binariesRoot = general.binariesRoot || ''
    gui.general.importRoot = general.importRoot || ''
    gui.general.processor = general.processor || 'n/a'
    gui.general.autoAnalysisTimeout = general.autoAnalysisTimeout || 180
    gui.general.threads = general.threads || 1
    gui.general.logsRoot = general.logsRoot || ''
    gui.general.workspaceRoot = general.workspaceRoot || ''

    const gproj = proc.withGhidraProject || {}
    gui.ghidra.projectRoot = gproj.projectRoot || 'ghidra_projects'
    gui.ghidra.name = gproj.name || ''
    gui.ghidra.mode = gproj.mode || 'new'
    gui.ghidra.forkTo = gproj.forkTo || ''
    gui.ghidra.forkOnTask = gproj.forkOnTask || false
    gui.ghidra.saveProject = gproj.saveProject || false
    gui.ghidra.noCreateProgram = gproj.noCreateProgram || false
    gui.ghidra.overwriteProject = gproj.overwriteProject || false
    gui.ghidra.deletePreviousProgram = gproj.deletePreviousProgram || false

    const sql = proc.sqlSource || {}
    gui.sqlSource.serverIP = sql.serverIP || '127.0.0.1'
    gui.sqlSource.serverPort = sql.serverPort || 31777
    gui.sqlSource.useSnapshot = sql.useSnapshot || 'current'
    gui.sqlSource.constraint = sql.constraint || ''
    gui.sqlSource.disableUpdate = sql.disableUpdate || false
    gui.sqlSource.useLocalCache = sql.useLocalCache || ''

    const llm = proc.llm || {}
    gui.llm.provider = llm.provider || ''
    gui.llm.modelName = llm.modelName || ''
    gui.llm.apiKeyEnv = llm.apiKeyEnv || ''
    gui.llm.apiKey = llm.apiKey || ''
    gui.llm.baseUrl = llm.baseUrl || ''
    gui.llm.temperature = llm.temperature ?? null
    gui.llm.topP = llm.topP ?? null
    gui.llm.maxTokens = llm.maxTokens ?? null
    gui.llm.timeoutSeconds = llm.timeoutSeconds || 120
    gui.llm.maxRetries = llm.maxRetries || 3
    gui.llm.debugLogging = llm.debugLogging || false

    gui.tasks = (proc.tasks || []).map((t: any) => {
      const moduleName = t.mainClassName?.split('.').pop() || ''
      return {
        mainClassName: t.mainClassName || '',
        timeout: t.timeout && t.timeout > 0 ? t.timeout : null,
        consoleLogLevel: 'OFF',
        fileLogLevel: (t.fileLogLevel || 'info').toUpperCase(),
        tableName: t.tableName || '',
        configKey: t.configKey || '',
        moduleConfig: moduleConfigs.get(moduleName) || ''
      }
    })
    if (gui.tasks.length === 0) {
      gui.tasks.push({ mainClassName: '', timeout: null, consoleLogLevel: 'INFO', fileLogLevel: 'INFO', tableName: '', configKey: '', moduleConfig: '' })
    }
  } catch (_e: any) { /* ignore */ }
}

function switchToGui() {
  if (editorMode.value === 'gui') return
  // Sync JSON -> GUI
  jsonToGui(runtimeConfigJson.value)
  editorMode.value = 'gui'
}

function switchToJson() {
  if (editorMode.value === 'json') return
  // Sync GUI -> JSON
  runtimeConfigJson.value = guiToJson()
  editorMode.value = 'json'
}

// ---- Tasks management -------------------------------------------------------
function addTask() {
  gui.tasks.push({ mainClassName: '', timeout: null, consoleLogLevel: 'INFO', fileLogLevel: 'INFO', tableName: '', configKey: '', moduleConfig: '' })
}

function removeTask(idx: number) {
  if (gui.tasks.length <= 1) return
  gui.tasks.splice(idx, 1)
}

// ---- CRUD -------------------------------------------------------------------

function newRuntimeConfig() {
  activeConfig.value = `new_${Date.now()}`
  runtimeConfigName.value = ''
  runtimeConfigDesc.value = ''
  editorMode.value = 'gui'
  // Reset GUI to defaults
  gui.username = 'akiba'; gui.password = 'akiba'; gui.usingInstance = 'akiba-instance'
  gui.general.binariesRoot = ''; gui.general.importRoot = ''; gui.general.processor = 'n/a'
  gui.general.autoAnalysisTimeout = 180; gui.general.threads = 1; gui.general.logsRoot = ''; gui.general.workspaceRoot = ''
  gui.ghidra.projectRoot = 'ghidra_projects'; gui.ghidra.name = 'my_project'; gui.ghidra.mode = 'new'
  gui.ghidra.forkTo = ''; gui.ghidra.forkOnTask = false; gui.ghidra.saveProject = true; gui.ghidra.noCreateProgram = false
  gui.ghidra.overwriteProject = false; gui.ghidra.deletePreviousProgram = false
  gui.sqlSource.serverIP = '127.0.0.1'; gui.sqlSource.serverPort = 31777; gui.sqlSource.useSnapshot = 'current'
  gui.sqlSource.constraint = "WHERE original_path LIKE '%.elf'"; gui.sqlSource.disableUpdate = false; gui.sqlSource.useLocalCache = ''
  gui.llm.provider = ''; gui.llm.modelName = ''; gui.llm.apiKeyEnv = ''; gui.llm.apiKey = ''; gui.llm.baseUrl = ''
  gui.llm.temperature = null; gui.llm.topP = null; gui.llm.maxTokens = null
  gui.llm.timeoutSeconds = 120; gui.llm.maxRetries = 3; gui.llm.debugLogging = false
  gui.tasks = [
    { mainClassName: 'org.iotsplab.akiba.module.AkibaUtils', timeout: null, consoleLogLevel: 'OFF', fileLogLevel: 'INFO', tableName: '', configKey: '', moduleConfig: '' }
  ]
  runtimeConfigJson.value = guiToJson()
  configError.value = ''
  configMessage.value = ''
}

function loadRuntimeConfig(name: string) {
  activeConfig.value = name
  const cfg = runtimeConfigs.value.find((c) => c.name === name)
  if (cfg) {
    runtimeConfigName.value = cfg.name
    runtimeConfigJson.value = cfg.json
    runtimeConfigDesc.value = cfg.description || ''
    // Auto-populate GUI from loaded JSON
    jsonToGui(cfg.json)
    // Default to GUI mode with parsed data
    editorMode.value = 'gui'
  }
  configError.value = ''
  configMessage.value = ''
}

async function saveRuntimeConfig() {
  if (!runtimeConfigName.value.trim()) {
    configError.value = 'Configuration name is required.'
    return
  }
  // If in GUI mode, sync to JSON first
  if (editorMode.value === 'gui') {
    runtimeConfigJson.value = guiToJson()
  }
  // Validate JSON
  try {
    JSON.parse(runtimeConfigJson.value)
  } catch (e: any) {
    configError.value = `Invalid JSON: ${e.message}`
    return
  }
  savingConfig.value = true
  configError.value = ''
  configMessage.value = ''
  try {
    await runtimeConfigApi.save({
      name: runtimeConfigName.value.trim(),
      description: runtimeConfigDesc.value.trim() || undefined,
      json: runtimeConfigJson.value
    })
    await loadRuntimeConfigs()
    activeConfig.value = runtimeConfigName.value.trim()
    configMessage.value = 'Configuration saved.'
  } catch (e: any) {
    configError.value = e?.response?.data?.error || e?.message || 'Failed to save configuration'
  } finally {
    savingConfig.value = false
  }
}

async function deleteRuntimeConfig() {
  if (!confirm(`Delete runtime configuration "${runtimeConfigName.value}"?`)) return
  savingConfig.value = true
  configError.value = ''
  configMessage.value = ''
  try {
    await runtimeConfigApi.delete(runtimeConfigName.value.trim())
    await loadRuntimeConfigs()
    activeConfig.value = null
    configMessage.value = 'Configuration deleted.'
  } catch (e: any) {
    configError.value = e?.response?.data?.error || e?.message || 'Failed to delete'
  } finally {
    savingConfig.value = false
  }
}
</script>

<style scoped>
.settings { display: flex; flex-direction: column; gap: 18px; }

.card {
  background: #fff;
  padding: 24px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.card h2 { font-size: 20px; margin: 0 0 6px; }
.subtitle { color: #666; font-size: 13px; margin: 0 0 18px; }

.muted { color: #888; padding: 24px 0; text-align: center; }
.muted.small { font-size: 13px; padding: 8px 0 16px; }

.config-selector {
  background: #f8f9fa;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 20px;
}
.selector-label {
  display: block;
  font-size: 12px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}
.selector-row {
  display: flex;
  gap: 10px;
  align-items: center;
}
.config-select {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  background: #fff;
}
.btn-danger.small {
  padding: 10px 14px;
  font-size: 13px;
  white-space: nowrap;
}

.form { display: flex; flex-direction: column; gap: 14px; }
.form-row { display: flex; gap: 12px; }
.form-row .form-group { flex: 1; }
.form-row .form-group.flex2 { flex: 2; }

.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 13px; font-weight: 500; color: #333; }
.form-group .hint { color: #888; font-weight: 400; font-size: 12px; margin-left: 4px; }

.form-group input,
.form-group select {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  background: #fff;
}

.key-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.key-input {
  flex: 1;
}

.model-checkbox-list {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 6px 0;
  background: #fafafa;
}
.model-checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 13px;
  font-family: 'Courier New', monospace;
  cursor: pointer;
  transition: background 0.15s;
}
.model-checkbox-item:hover {
  background: #f0f0f0;
}
.model-checkbox-item input[type="checkbox"] {
  width: auto;
  margin: 0;
}

.model-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.model-select {
  flex: 1;
}

.btn-secondary {
  padding: 10px 14px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 6px;
  color: #333;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.btn-secondary:hover:not(:disabled) { background: #eee; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary.active {
  background: #fff5f7;
  border-color: #e94560;
  color: #e94560;
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
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

.btn-danger {
  padding: 10px 16px;
  background: #fff;
  border: 1px solid #e94560;
  color: #e94560;
  border-radius: 6px;
  cursor: pointer;
}
.btn-danger:hover:not(:disabled) { background: #e94560; color: #fff; }
.btn-danger:disabled { opacity: 0.4; cursor: not-allowed; }

.error { color: #d32f2f; font-size: 13px; }
.success { color: #388e3c; font-size: 13px; }

.key-list {
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.key-list label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
.key-item {
  font-size: 13px;
  color: #444;
}
.key-meta {
  margin-right: 6px;
}

/* ---- Runtime Config -------------------------------------------------------- */

.runtime-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.runtime-actions .btn-secondary { padding: 8px 14px; font-size: 13px; }

.runtime-toolbar {
  display: flex;
  gap: 16px;
  align-items: flex-end;
  margin-bottom: 16px;
}

.mode-toggle {
  display: flex;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
}
.mode-toggle .btn-sm {
  padding: 8px 16px;
  border: none;
  background: #fff;
  color: #666;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.mode-toggle .btn-sm.active {
  background: #e94560;
  color: #fff;
}

/* GUI sections */
.gui-editor {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  overflow: hidden;
}

.config-section {
  border-bottom: 1px solid #eee;
}
.config-section:last-child { border-bottom: none; }

.config-section summary {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #444;
  background: #fafafa;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.config-section summary:hover { background: #f5f5f5; }
.config-section .badge {
  font-size: 11px;
  background: #e94560;
  color: #fff;
  padding: 2px 8px;
  border-radius: 8px;
  font-weight: 500;
  margin-left: 8px;
}

.config-section > *:not(summary) {
  padding: 0 16px 14px;
}

/* Task items */
.task-item {
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 10px;
}
.task-actions {
  display: flex;
  align-items: flex-end;
}

.btn-sm { padding: 6px 12px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px; background: #fff; cursor: pointer; }
.btn-sm.active { background: #e94560; color: #fff; border-color: #e94560; }
.btn-sm.sm { padding: 4px 8px; font-size: 11px; }
.btn-secondary.sm { padding: 6px 14px; font-size: 12px; }
.btn-danger.sm { padding: 6px 10px; font-size: 12px; line-height: 1; }

.flex2 { flex: 2; }
.inline-check { align-items: flex-end; }
.readonly-input {
  background: #f5f5f5 !important;
  color: #888 !important;
  cursor: not-allowed !important;
  border-color: #e8e8e8 !important;
}

.llm-import-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  margin-bottom: 12px;
  background: #f8f9fa;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
}
.import-label {
  font-size: 12px;
  font-weight: 500;
  color: #666;
  white-space: nowrap;
  margin-bottom: 0;
}
.import-select {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 13px;
  font-family: inherit;
  background: #fff;
}

.inline-check label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 400;
  font-size: 13px;
  margin-bottom: 0;
}
.inline-check input[type="checkbox"] { width: auto; margin: 0; }

.messages { margin-top: 8px; }

.form-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.form-row .form-group {
  flex: 1;
  margin-bottom: 0;
}
.form-group { margin-bottom: 14px; }
.form-group label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #666;
  margin-bottom: 4px;
}
.form-group input,
.form-group select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 13px;
  font-family: inherit;
  background: #fff;
}

.json-editor {
  width: 100%;
  min-height: 300px;
  padding: 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  background: #1a1a2e;
  color: #e0e0e0;
}

.json-editor:focus {
  outline: none;
  border-color: #e94560;
  box-shadow: 0 0 0 2px rgba(233, 69, 96, 0.15);
}

/* Task module config editor */
.task-module-config {
  margin-top: 10px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  overflow: hidden;
}
.task-module-config summary {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #555;
  background: #f5f5f5;
  cursor: pointer;
  user-select: none;
}
.task-module-config summary:hover { background: #f0f0f0; }
.task-module-config .badge {
  font-size: 10px;
  background: #e94560;
  color: #fff;
  padding: 1px 6px;
  border-radius: 6px;
  margin-left: 6px;
}
.module-json-editor {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
  background: #1a1a2e;
  color: #e0e0e0;
  box-sizing: border-box;
}
</style>
