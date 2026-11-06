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
                :placeholder="selectedConfigIndex >= 0 ? 'Leave blank to keep the stored key' : 'sk-…'"
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
            <label>
              Models to save
              <span class="hint">context length is the model's window in tokens</span>
            </label>
            <p class="model-ctx-note">
              Leave a context length blank to keep the built-in table value shown next to the model.
              Set it when a provider renames a model and the table's guess is too small.
            </p>
            <div class="model-checkbox-list">
              <div v-for="m in availableModels" :key="m" class="model-checkbox-item">
                <label class="model-check-line">
                  <input type="checkbox" :value="m" v-model="selectedModelNames" />
                  <span class="model-name">{{ m }}</span>
                </label>
                <input
                  class="ctx-input"
                  type="number"
                  min="1"
                  :max="MAX_CONTEXT_TOKENS"
                  placeholder="auto"
                  :disabled="saving || !selectedModelNames.includes(m)"
                  v-model="contextLengths[m]"
                  @input="contextError = ''"
                />
                <span class="ctx-hint" :class="{ invalid: isContextInvalid(m) }">{{ contextHint(m) }}</span>
              </div>
            </div>
            <div v-if="contextError" class="error">{{ contextError }}</div>
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
                <label>Logs Root <span class="hint">(fixed per user)</span></label>
                <input :value="computedLogsRoot" readonly class="readonly-input" tabindex="-1" />
              </div>
              <div class="form-group">
                <label>Workspace Root <span class="hint">(fixed per user)</span></label>
                <input :value="computedWorkspaceRoot" readonly class="readonly-input" tabindex="-1" />
              </div>
            </div>
          </details>

          <!-- Ghidra Project -->
          <details class="config-section">
            <summary>Ghidra Project</summary>
            <div class="form-row">
              <div class="form-group">
                <label>Project Root <span class="hint">(fixed per user)</span></label>
                <input :value="computedProjectRoot" readonly class="readonly-input" tabindex="-1" />
              </div>
              <div class="form-group">
                <label>Project Name</label>
                <select v-model="ghidraProjectSelection" @change="onGhidraProjectSelectionChange">
                  <option value="__new__">+ New Project</option>
                  <option v-for="p in ghidraProjectOptions" :key="p.name" :value="p.name">
                    {{ p.name }}{{ p.fileCount ? ` (${p.fileCount} files)` : '' }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>Mode</label>
                <select v-model="gui.ghidra.mode" :disabled="ghidraProjectSelection === '__new__'">
                  <template v-if="ghidraProjectSelection === '__new__'">
                    <option value="new">new</option>
                  </template>
                  <template v-else>
                    <option value="base">base</option>
                    <option value="fork">fork</option>
                  </template>
                </select>
              </div>
            </div>
            <!-- New project: editable name -->
            <div v-if="ghidraProjectSelection === '__new__'" class="form-row">
              <div class="form-group flex2">
                <label>New Project Name <span class="hint">(default: {{ defaultNewProjectName }})</span></label>
                <input v-model="gui.ghidra.name" :placeholder="defaultNewProjectName" />
              </div>
            </div>
            <!-- Existing project (read-only display) -->
            <div v-else class="form-row">
              <div class="form-group flex2">
                <label>Source Project <span class="hint">(using existing)</span></label>
                <input :value="ghidraProjectSelection" readonly class="readonly-input" tabindex="-1" />
              </div>
            </div>
            <!-- Fork target -->
            <div v-if="ghidraProjectSelection !== '__new__' && gui.ghidra.mode === 'fork'" class="form-row">
              <div class="form-group flex2">
                <label>Fork To <span class="hint">(default: {{ defaultForkName }})</span></label>
                <input v-model="gui.ghidra.forkTo" :placeholder="defaultForkName" />
              </div>
              <div class="form-group inline-check"><label><input type="checkbox" v-model="gui.ghidra.forkOnTask" /> Fork on Task</label></div>
            </div>
            <!-- Base mode: continue log (required, mirrors fork's Fork To) -->
            <div v-if="ghidraProjectSelection !== '__new__' && gui.ghidra.mode === 'base'" class="form-row">
              <div class="form-group flex2">
                <label>Continue Log <span class="hint">(required, default: {{ defaultContinueLogName }})</span></label>
                <input v-model="gui.ghidra.continueLog" :placeholder="defaultContinueLogName" />
              </div>
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
                <div class="form-group flex2">
                  <label>Main Class</label>
                  <select v-model="task.mainClassName">
                    <option value="" disabled>— select module —</option>
                    <option v-for="opt in moduleOptionsFor(task.mainClassName)" :key="opt.value" :value="opt.value">
                      {{ opt.label }}<template v-if="opt.group !== 'Current'"> ({{ opt.group }})</template>
                    </option>
                  </select>
                </div>
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
                  <textarea v-model="task.moduleConfig" class="module-json-editor" rows="6" spellcheck="false" placeholder='e.g. {"option1": "value1", "option2": 42}' @keydown="handleTabKey"></textarea>
                </div>
              </details>
            </div>
            <button class="btn-secondary sm" @click="addTask" style="margin-top:8px">+ Add Task</button>
          </details>
        </div>

        <!-- JSON mode -->
        <div v-else class="form-group">
          <label>JSON Editor</label>
          <textarea v-model="runtimeConfigJson" class="json-editor" rows="20" spellcheck="false" :disabled="savingConfig" @keydown="handleTabKey"></textarea>
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

    <!-- Auto-update -->
    <div class="card">
      <h2>Software Update</h2>
      <p class="subtitle">Check for new Akiba releases from GitHub.</p>

      <div v-if="updateStatus.updateAvailable" class="update-banner">
        <strong>Update available!</strong>
        Current: {{ updateStatus.currentVersion || '?' }} →
        Latest: {{ updateStatus.latestVersion || '?' }}
        <br />
        <span class="hint">{{ updateStatus.stagedArtifacts.length }} artifact(s) staged. Restart the container to apply.</span>
      </div>

      <div v-else-if="updateStatus.currentVersion && updateStatus.latestVersion" class="muted small">
        Up to date (version {{ updateStatus.currentVersion }}).
      </div>

      <div v-if="updateStatus.error" class="error-text small">{{ updateStatus.error }}</div>

      <div class="actions">
        <button class="btn-primary" @click="checkForUpdates" :disabled="checkingUpdates">
          {{ checkingUpdates ? 'Checking…' : 'Check for Updates' }}
        </button>
      </div>

      <div v-if="updateStatus.lastCheck" class="muted small">
        Last checked: {{ updateStatus.lastCheck }}
      </div>
    </div>
    <div class="card">
      <h2>Operator Password</h2>
      <p class="subtitle">
        Akiba serves a single operator, so this password is the only way in.
        Changing it keeps the current session valid.
      </p>

      <form @submit.prevent="changePassword" class="form">
        <div class="form-row">
          <div class="form-group">
            <label>Current password</label>
            <input v-model="passwordForm.current" type="password" autocomplete="current-password" />
          </div>
          <div class="form-group">
            <label>New password</label>
            <input v-model="passwordForm.next" type="password" autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label>Repeat new password</label>
            <input v-model="passwordForm.confirm" type="password" autocomplete="new-password" />
          </div>
        </div>

        <div v-if="passwordError" class="error">{{ passwordError }}</div>
        <div v-if="passwordNotice" class="muted small">{{ passwordNotice }}</div>

        <button class="btn-primary" type="submit" :disabled="passwordSaving">
          {{ passwordSaving ? 'Saving…' : 'Change Password' }}
        </button>
      </form>
    </div>

  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch } from 'vue'
import { llmConfigApi, runtimeConfigApi, projectApi, updateApi, moduleApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import type { LLMProviderInfo, StoredKeyEntry, RuntimeConfigEntry, ModuleEntry, ModelContextLengthInfo } from '@/services/api'

const authStore = useAuthStore()

// Operator password form. Akiba has exactly one credential, so this is the
// whole account surface: no registration, no user list, no reset by proxy.
const passwordForm = reactive({ current: '', next: '', confirm: '' })
const passwordSaving = ref(false)
const passwordError = ref('')
const passwordNotice = ref('')

async function changePassword() {
  passwordError.value = ''
  passwordNotice.value = ''
  if (passwordForm.next.length < 6) {
    passwordError.value = 'Password must be at least 6 characters'
    return
  }
  if (passwordForm.next !== passwordForm.confirm) {
    passwordError.value = 'Passwords do not match'
    return
  }
  passwordSaving.value = true
  try {
    await authStore.changePassword(passwordForm.current, passwordForm.next)
    passwordForm.current = ''
    passwordForm.next = ''
    passwordForm.confirm = ''
    passwordNotice.value = 'Password changed.'
  } catch (e: any) {
    passwordError.value =
      e.response?.data?.message || e.response?.data?.error || 'Password change failed'
  } finally {
    passwordSaving.value = false
  }
}

// Paths are computed — the operator cannot override them. Akiba serves a single
// operator, so the tree has no per-user level.
const computedLogsRoot = computed(() => `~/.akiba/logs`)
const computedWorkspaceRoot = computed(() => `~/.akiba/workspace`)
const computedProjectRoot = computed(() => `ghidra_projects`)

// Sentinel used in the Project Name dropdown to mark the "create a new
// project" option. We can't use the empty string because that would be
// ambiguous with "user cleared the field".
const NEW_PROJECT_SENTINEL = '__new__'

// Available Ghidra projects loaded from the backend. We only need the
// name and the file count for the dropdown labels — fork default-name
// generation depends on whether a candidate `<original>_forked_<N>`
// already exists on disk.
const ghidraProjectOptions = ref<{ name: string; fileCount: number }[]>([])

/**
 * Drive value of the Project Name dropdown. Either a sentinel
 * (`__new__`) for "create new" or an existing project name.
 */
const ghidraProjectSelection = ref<string>(NEW_PROJECT_SENTINEL)

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

/** Upper bound the framework accepts for a per-model context length. */
const MAX_CONTEXT_TOKENS = 2_000_000

/** Raw input text per model; '' means "use the built-in table". */
const contextLengths = ref<Record<string, string>>({})
/** What the backend resolves per model, so a blank field can show its fallback. */
const effectiveWindows = ref<Record<string, ModelContextLengthInfo>>({})
const contextError = ref('')

/** True while a saved configuration is selected, i.e. its key is already on disk. */
const editingStoredConfig = computed(() => selectedConfigIndex.value >= 0)

const SOURCE_LABELS: Record<string, string> = {
  configured: 'custom',
  table: 'built-in table',
  default: '128K fallback'
}

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
  resetContextLengths(availableModels.value, key.contextLengths || {})
}

/** Rebuild one input per model, seeding saved overrides and refreshing the hints. */
function resetContextLengths(models: string[], saved: Record<string, number> = {}) {
  const next: Record<string, string> = {}
  for (const model of models) {
    const value = saved[model]
    next[model] = value === undefined ? '' : String(value)
  }
  contextLengths.value = next
  contextError.value = ''
  void loadEffectiveWindows(models)
}

/** Ask the backend what applies right now; a failure only blanks the hint. */
async function loadEffectiveWindows(models: string[]) {
  const wanted = models.filter(Boolean)
  if (wanted.length === 0) {
    effectiveWindows.value = {}
    return
  }
  try {
    const { data } = await llmConfigApi.contextLengths(wanted)
    effectiveWindows.value = data.contextLengths || {}
  } catch {
    effectiveWindows.value = {}
  }
}

/** Parsed input: null for blank, NaN for junk. */
function parseContextLength(model: string): number | null {
  const text = (contextLengths.value[model] || '').trim()
  if (text === '') return null
  const value = Number(text)
  return Number.isFinite(value) ? value : NaN
}

function isContextInvalid(model: string): boolean {
  const value = parseContextLength(model)
  if (value === null) return false
  return !Number.isInteger(value) || value <= 0 || value > MAX_CONTEXT_TOKENS
}

/** One-line explanation of the effective window and what the table would give. */
function contextHint(model: string): string {
  const info = effectiveWindows.value[model]
  const builtIn = info
    ? `${info.tableLength.toLocaleString('en-US')} tokens in the built-in table`
    : 'the 128K fallback'
  const typed = parseContextLength(model)
  if (typed === null) {
    if (!info) return `effective: ${builtIn}`
    const source = SOURCE_LABELS[info.source] || info.source
    return `effective now: ${info.contextLength.toLocaleString('en-US')} tokens (${source})`
  }
  if (isContextInvalid(model)) {
    return `must be a whole number from 1 to ${MAX_CONTEXT_TOKENS.toLocaleString('en-US')} tokens`
  }
  return `${typed.toLocaleString('en-US')} tokens · otherwise ${builtIn}`
}

/**
 * Payload map for the selected models; null when an input is out of range.
 *
 * Omitted models keep no override, which is how clearing a field resets it.
 */
function collectContextLengths(): Record<string, number> | null {
  const collected: Record<string, number> = {}
  for (const model of selectedModelNames.value) {
    const value = parseContextLength(model)
    if (value === null) continue
    if (isContextInvalid(model)) {
      contextError.value = `Context length for "${model}" must be a whole number ` +
        `from 1 to ${MAX_CONTEXT_TOKENS.toLocaleString('en-US')} tokens.`
      return null
    }
    collected[model] = value
  }
  return collected
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
    resetContextLengths([])
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
      resetContextLengths([])
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
    // Carry over saved overrides and anything already typed for these models.
    const saved = keys.value.find(
      k => k.provider === form.provider && (k.baseUrl || '') === (form.baseUrl || '')
    )?.contextLengths || {}
    const carried: Record<string, number> = { ...saved }
    for (const model of availableModels.value) {
      const typed = parseContextLength(model)
      if (typed !== null && !isContextInvalid(model)) carried[model] = typed
    }
    resetContextLengths(availableModels.value, carried)
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
  contextError.value = ''
  if (!form.provider || selectedModelNames.value.length === 0) {
    error.value = 'Provider and at least one model are required.'
    return
  }
  // A stored key never leaves the server, so an existing configuration is
  // editable without re-entering it; a new one still needs a key.
  if (!editingStoredConfig.value && !form.apiKey.trim()) {
    error.value = 'API key is required for a new configuration.'
    return
  }
  const lengths = collectContextLengths()
  if (lengths === null) return

  saving.value = true
  try {
    await llmConfigApi.addKey({
      provider: form.provider,
      modelNames: selectedModelNames.value.map(s => s.trim()).filter(Boolean),
      baseUrl: form.baseUrl?.trim() || undefined,
      contextLengths: lengths,
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
    // Reflect what the server actually stored (key blanked, overrides resolved).
    if (keys.value.length > 0) populateFormFromKey(keys.value[selectedConfigIndex.value])
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

// Binaries root for display: one directory per instance, no user level.
const computedBinariesRoot = computed(() => {
  const inst = gui.usingInstance || 'default'
  return `~/.akiba/binaries/${inst}/`
})

// Compute a sensible default name for a brand-new project, based on the
// runtime-config name (so related workflows end up grouped) plus a numeric
// suffix to avoid collisions with anything already on disk.
const defaultNewProjectName = computed(() => {
  const confBase = (runtimeConfigName.value || 'project').replace(/[^A-Za-z0-9._-]/g, '_')
  let n = 1
  while (ghidraProjectOptions.value.some(p => p.name === `${confBase}_${n}`)) {
    n++
  }
  return `${confBase}_${n}`
})

// Compute default fork target name: `<original>_forked_<N>` where N is the
// smallest positive integer such that no project with that name already
// exists on disk.
const defaultForkName = computed(() => {
  if (ghidraProjectSelection.value === NEW_PROJECT_SENTINEL) return ''
  const original = ghidraProjectSelection.value
  const prefix = `${original}_forked_`
  let n = 1
  while (ghidraProjectOptions.value.some(p => p.name === `${prefix}${n}`)) {
    n++
  }
  return `${prefix}${n}`
})

// Compute default continue-log name for base mode: `<projectName>-<N>`
// where N is the smallest positive integer such that no project with
// that name already exists on disk.  Mirrors defaultForkName so the
// required continue-log field always has a sensible, collision-free
// default the moment the user picks `base`.
const defaultContinueLogName = computed(() => {
  if (ghidraProjectSelection.value === NEW_PROJECT_SENTINEL) return ''
  const original = ghidraProjectSelection.value
  const prefix = `${original}-`
  let n = 1
  while (ghidraProjectOptions.value.some(p => p.name === `${prefix}${n}`)) {
    n++
  }
  return `${prefix}${n}`
})

/**
 * Whenever the user changes the Project Name dropdown, reset dependent
 * fields so the form stays internally consistent:
 *   - switching to "+ New Project" → mode forced to `new`, name auto-filled
 *     with the default new-project name. We always overwrite the name
 *     here (even if the user previously typed something) so the field
 *     never carries a stale "selected project" string into the new-project
 *     context — that would be confusing UX.
 *   - switching to an existing project → mode forced to `base` (a fork
 *     default is filled in later, only when the user picks `fork`).
 */
function onGhidraProjectSelectionChange() {
  if (ghidraProjectSelection.value === NEW_PROJECT_SENTINEL) {
    gui.ghidra.mode = 'new'
    gui.ghidra.name = defaultNewProjectName.value
    gui.ghidra.forkTo = ''
    gui.ghidra.continueLog = ''
  } else {
    // Treat the selection as the source project.
    gui.ghidra.name = ghidraProjectSelection.value
    // Default to `base` on first switch; the user can then opt into `fork`.
    if (gui.ghidra.mode !== 'fork' && gui.ghidra.mode !== 'base') {
      gui.ghidra.mode = 'base'
    }
    gui.ghidra.forkTo = ''
    // Continue-log is required in base mode; pre-fill it with a fresh
    // default based on the newly selected project so the field is
    // never empty.  In fork mode it's not used, so clear it.
    if (gui.ghidra.mode === 'base') {
      gui.ghidra.continueLog = defaultContinueLogName.value
    } else {
      gui.ghidra.continueLog = ''
    }
  }
}

/**
 * When the user toggles between `base` and `fork` on an existing project,
 * pre-fill `forkTo` with the default `<original>_forked_<N>` name so they
 * can simply press Save — but only if they haven't already typed a custom
 * fork target.
 */
watch(
  () => gui.ghidra.mode,
  (newMode) => {
    if (
      newMode === 'fork' &&
      ghidraProjectSelection.value !== NEW_PROJECT_SENTINEL &&
      !gui.ghidra.forkTo.trim()
    ) {
      gui.ghidra.forkTo = defaultForkName.value
    }
    // Mirror the fork behaviour for base mode: pre-fill the required
    // continue-log with `<projectName>-<N>` when the user switches to
    // `base`, unless they have already typed a custom value.
    if (
      newMode === 'base' &&
      ghidraProjectSelection.value !== NEW_PROJECT_SENTINEL &&
      !gui.ghidra.continueLog.trim()
    ) {
      gui.ghidra.continueLog = defaultContinueLogName.value
    }
  }
)

/**
 * Fetch the list of existing Ghidra projects for the current user.
 * Refreshed when the Settings view mounts; failures are non-fatal —
 * the dropdown simply shows only the "+ New Project" option.
 */
async function loadGhidraProjects() {
  try {
    const { data } = await projectApi.list()
    ghidraProjectOptions.value = (data.projects ?? []).map(p => ({
      name: p.name,
      fileCount: p.fileCount
    }))
  } catch (_e) {
    ghidraProjectOptions.value = []
  }
}

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
    // Path to a "continue log" — only meaningful when mode === 'base',
    // lets a new run resume / pick up where a previous base-mode run
    // left off.  Empty means "start fresh".
    continueLog: '' as string,
    saveProject: true,
    noCreateProgram: false,
    overwriteProject: false,
    deletePreviousProgram: false
  },
  sqlSource: {
    serverIP: '127.0.0.1',
    serverPort: 31777,
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
  await Promise.all([loadRuntimeConfigs(), loadGhidraProjects(), loadUpdateStatus(), loadAvailableModules()])
})

async function loadRuntimeConfigs() {
  try {
    const { data } = await runtimeConfigApi.list()
    runtimeConfigs.value = data.configs || []
  } catch (_e: any) {
    runtimeConfigs.value = []
  }
}

// ---- Available modules (for task dropdown) ---------------------------------

const availableModules = ref<ModuleEntry[]>([])

async function loadAvailableModules() {
  try {
    const { data } = await moduleApi.list()
    availableModules.value = data.modules || []
  } catch (_e: any) {
    availableModules.value = []
  }
}

/**
 * Compute the option list for a task's Main Class <select>.
 *
 * Includes all available modules plus the current value (if non-empty
 * and not already in the list) so that editing an existing config that
 * references a deleted/unloaded module doesn't silently drop the value.
 */
function moduleOptionsFor(currentValue: string): { value: string; label: string; group: string }[] {
  const opts = availableModules.value.map(m => ({
    value: m.mainClassName,
    label: m.mainClassName.split('.').pop()!,
    group: m.owner ? 'Private' : 'Public',
  }))
  if (currentValue.trim() && !opts.some(o => o.value === currentValue.trim())) {
    opts.unshift({ value: currentValue.trim(), label: currentValue.trim() + ' (not found)', group: 'Current' })
  }
  return opts
}

// ---- Auto-update ------------------------------------------------------------

const updateStatus = reactive({
  lastCheck: null as string | null,
  currentVersion: null as string | null,
  latestVersion: null as string | null,
  updateAvailable: false,
  stagedArtifacts: [] as string[],
  error: null as string | null
})
const checkingUpdates = ref(false)

async function loadUpdateStatus() {
  try {
    const { data } = await updateApi.getStatus()
    Object.assign(updateStatus, data)
  } catch (_e: any) {
    // Non-fatal — the update endpoint may not exist on older builds.
  }
}

async function checkForUpdates() {
  checkingUpdates.value = true
  try {
    const { data } = await updateApi.check()
    Object.assign(updateStatus, data)
  } catch (e: any) {
    updateStatus.error = e?.response?.data?.error || e?.message || 'Failed to check for updates'
  } finally {
    checkingUpdates.value = false
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
  // Logs Root and Workspace Root are fixed per-user paths. We always
  // emit the computed value so a stale entry in the GUI state can't
  // leak through to the saved JSON.
  general.logsRoot = computedLogsRoot.value
  general.workspaceRoot = computedWorkspaceRoot.value
  mainObj.general = general
  mainObj.globalConsoleLogLevel = 'OFF'
  mainObj.globalFileLogLevel = gui.globalFileLogLevel

  const gp = gui.ghidra
  // Project Root is fixed to `ghidra_projects/<username>/`.
  const gproj: any = {
    projectRoot: computedProjectRoot.value,
    mode: gp.mode,
    saveProject: gp.saveProject,
    noCreateProgram: gp.noCreateProgram
  }
  if (gp.name) gproj.name = gp.name
  // For fork mode, default an empty forkTo to the standard
  // `<original>_forked_<N>` pattern so the saved config is always usable
  // without further edits.
  if (gp.mode === 'fork') {
    const forkTarget = (gp.forkTo || '').trim() || defaultForkName.value
    gproj.forkTo = forkTarget
  }
  // For base mode, the continue-log is required.  Default an empty
  // value to `<projectName>-<N>` (mirroring fork's forkTo defaulting)
  // so the saved config is always usable — the UI also validates this
  // upstream, but this guarantees correctness even if the JSON editor
  // path is used.
  if (gp.mode === 'base') {
    const cl = (gp.continueLog || '').trim() || defaultContinueLogName.value
    if (cl) gproj.continueLog = cl
  }
  gproj.forkOnTask = gp.forkOnTask
  gproj.overwriteProject = gp.overwriteProject
  gproj.deletePreviousProgram = gp.deletePreviousProgram
  mainObj.withGhidraProject = gproj

  const sql = gui.sqlSource
  const sqlObj: any = { serverIP: sql.serverIP, serverPort: sql.serverPort }
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
    // Logs Root and Workspace Root are not user-editable; we keep the GUI
    // state empty so the computed fixed path is always emitted on save.
    gui.general.logsRoot = ''
    gui.general.workspaceRoot = ''

    const gproj = proc.withGhidraProject || {}
    // Project Root is also not user-editable.
    gui.ghidra.projectRoot = ''
    // Decide whether the JSON describes a "new project" or an existing
    // one. We consider a project "existing" only if its name matches one
    // we know about on disk; otherwise we default to new.
    const knownNames = new Set(ghidraProjectOptions.value.map(p => p.name))
    const loadedName = gproj.name || ''
    if (loadedName && knownNames.has(loadedName)) {
      ghidraProjectSelection.value = loadedName
      gui.ghidra.name = loadedName
      // Default mode from JSON if valid, else `base`.
      const mode = gproj.mode
      if (mode === 'fork' || mode === 'base') {
        gui.ghidra.mode = mode
      } else {
        gui.ghidra.mode = 'base'
      }
    } else {
      ghidraProjectSelection.value = NEW_PROJECT_SENTINEL
      gui.ghidra.name = loadedName
      gui.ghidra.mode = 'new'
    }
    gui.ghidra.forkTo = gproj.forkTo || ''
    gui.ghidra.forkOnTask = gproj.forkOnTask || false
    gui.ghidra.continueLog = gproj.continueLog || ''
    // If loading a base-mode config that has no continue-log (e.g. an
    // older config saved before this field existed), pre-fill the
    // required default so the field is never shown empty.
    if (gui.ghidra.mode === 'base' && !gui.ghidra.continueLog.trim() &&
        ghidraProjectSelection.value !== NEW_PROJECT_SENTINEL) {
      gui.ghidra.continueLog = defaultContinueLogName.value
    }
    gui.ghidra.saveProject = gproj.saveProject || false
    gui.ghidra.noCreateProgram = gproj.noCreateProgram || false
    gui.ghidra.overwriteProject = gproj.overwriteProject || false
    gui.ghidra.deletePreviousProgram = gproj.deletePreviousProgram || false

    const sql = proc.sqlSource || {}
    gui.sqlSource.serverIP = sql.serverIP || '127.0.0.1'
    gui.sqlSource.serverPort = sql.serverPort || 31777
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
  gui.general.autoAnalysisTimeout = 180; gui.general.threads = 1
  // Logs Root and Workspace Root are fixed; no user-editable state needed.
  gui.general.logsRoot = ''; gui.general.workspaceRoot = ''
  // Reset Ghidra project to "create new" with auto-generated default name.
  ghidraProjectSelection.value = NEW_PROJECT_SENTINEL
  gui.ghidra.projectRoot = ''
  gui.ghidra.name = defaultNewProjectName.value
  gui.ghidra.mode = 'new'
  gui.ghidra.forkTo = ''; gui.ghidra.forkOnTask = false; gui.ghidra.saveProject = true; gui.ghidra.noCreateProgram = false
  gui.ghidra.overwriteProject = false; gui.ghidra.deletePreviousProgram = false
  gui.sqlSource.serverIP = '127.0.0.1'; gui.sqlSource.serverPort = 31777
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

async function loadRuntimeConfig(name: string) {
  activeConfig.value = name
  const cfg = runtimeConfigs.value.find((c) => c.name === name)
  if (cfg) {
    runtimeConfigName.value = cfg.name
    runtimeConfigJson.value = cfg.json
    runtimeConfigDesc.value = cfg.description || ''
    // Ensure the project dropdown is up-to-date before mapping the JSON's
    // project name back to either "+ New Project" or an existing entry.
    // Without this, a freshly created config that references an existing
    // project could mis-classify as a new project on first load.
    await loadGhidraProjects()
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
  // In GUI mode, enforce that base mode has a continue-log value
  // (it is a required field, mirroring how fork requires a forkTo).
  if (editorMode.value === 'gui' &&
      gui.ghidra.mode === 'base' &&
      ghidraProjectSelection.value !== NEW_PROJECT_SENTINEL &&
      !gui.ghidra.continueLog.trim()) {
    configError.value = 'Continue Log is required when Ghidra Project mode is "base".'
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

// Allow Tab / Shift+Tab in JSON textareas
function handleTabKey(e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  e.preventDefault()
  const target = e.target as HTMLTextAreaElement
  const start = target.selectionStart
  const end = target.selectionEnd
  const value = target.value

  if (e.shiftKey) {
    // Shift+Tab: un-indent selected lines
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const lineEnd = value.indexOf('\n', end)
    const effectiveEnd = lineEnd >= 0 ? lineEnd : value.length
    const lines = value.substring(lineStart, effectiveEnd).split('\n')
    const unindented = lines.map(line => line.startsWith('\t') ? line.slice(1) : line.startsWith('    ') ? line.slice(4) : line)
    target.value = value.substring(0, lineStart) + unindented.join('\n') + value.substring(effectiveEnd)
    const removedChars = lines.reduce((sum, l) => sum + (l.startsWith('\t') ? 1 : l.startsWith('    ') ? 4 : 0), 0)
    target.selectionStart = start
    target.selectionEnd = end - removedChars
  } else {
    // Tab: indent at cursor or selected lines
    if (start === end) {
      target.value = value.substring(0, start) + '\t' + value.substring(end)
      target.selectionStart = target.selectionEnd = start + 1
    } else {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const lineEnd = value.indexOf('\n', end)
      const effectiveEnd = lineEnd >= 0 ? lineEnd : value.length
      const lines = value.substring(lineStart, effectiveEnd).split('\n')
      const indented = lines.map(line => '\t' + line)
      target.value = value.substring(0, lineStart) + indented.join('\n') + value.substring(effectiveEnd)
      target.selectionStart = lineStart
      target.selectionEnd = lineStart + lines.length + indented.join('\n').length
    }
  }

  target.dispatchEvent(new Event('input', { bubbles: true }))
}
</script>

<style scoped>
.settings { display: flex; flex-direction: column; gap: 18px; }

.update-banner {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  padding: 12px 16px;
  margin: 12px 0;
}
.error-text { color: #dc3545; margin: 8px 0; }

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
  transition: background 0.15s;
}
.model-check-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.model-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ctx-input {
  width: 120px;
  flex: none;
  padding: 3px 6px;
  font-size: 12px;
}
.ctx-hint {
  width: 300px;
  flex: none;
  color: #888;
  font-family: inherit;
  font-size: 11px;
}
.ctx-hint.invalid {
  color: #c0392b;
}
.model-ctx-note {
  margin: 0 0 8px;
  color: #777;
  font-size: 12px;
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
