<template>
  <div class="settings">
    <div class="card">
      <h2>LLM Configuration</h2>
      <p class="subtitle">
        Configure the language model used by Akiba's chat agent.
        Credentials are stored in <code>~/.akiba/llm_keys.json</code>.
      </p>

      <div v-if="loading" class="muted">Loading…</div>

      <form v-else @submit.prevent="save" class="form">
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
          <label>Available models</label>
          <div class="model-row">
            <select v-model="selectedModel" class="model-select">
              <option value="" disabled>— select a model —</option>
              <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
            </select>
            <button
              type="button"
              class="btn-secondary"
              @click="useSelectedModel"
              :disabled="!selectedModel"
            >
              Use selected
            </button>
          </div>
        </div>

        <div class="form-group">
          <label>Model name</label>
          <input
            v-model="form.modelName"
            placeholder="e.g. deepseek-v4-flash"
            :disabled="saving"
          />
        </div>

        <div v-if="keys.length" class="key-list">
          <label>Saved keys</label>
          <div v-for="k in keys" :key="k.provider + k.baseUrl" class="key-item">
            <span class="key-meta">{{ k.provider }} — {{ k.modelNames.join(', ') }}</span>
            <span v-if="k.baseUrl" class="key-meta hint">({{ k.baseUrl }})</span>
          </div>
        </div>

        <div v-if="error" class="error">{{ error }}</div>
        <div v-if="message" class="success">{{ message }}</div>

        <div class="actions">
          <button
            type="button"
            class="btn-danger"
            @click="deleteConfig"
            :disabled="saving || !form.provider || !form.modelName"
          >
            Delete key
          </button>
          <button type="submit" class="btn-primary" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { llmConfigApi } from '@/services/api'
import type { LLMProviderInfo, StoredKeyEntry } from '@/services/api'

const providers = ref<LLMProviderInfo[]>([])
const keys = ref<StoredKeyEntry[]>([])
const loading = ref(false)
const saving = ref(false)
const showKey = ref(false)
const fetchingModels = ref(false)
const error = ref('')
const message = ref('')
const availableModels = ref<string[]>([])
const selectedModel = ref('')

const form = reactive({
  provider: '',
  modelName: '',
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
      const first = keys.value[0]
      form.provider = first.provider
      form.modelName = first.modelNames[0] || ''
      form.baseUrl = first.baseUrl || ''
    }
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Failed to load configuration'
  } finally {
    loading.value = false
  }
})

async function fetchModelList() {
  error.value = ''
  message.value = ''
  availableModels.value = []
  selectedModel.value = ''

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
    if (availableModels.value.length === 0) {
      message.value = 'No models returned by the provider.'
    }
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Failed to fetch models'
  } finally {
    fetchingModels.value = false
  }
}

function useSelectedModel() {
  if (selectedModel.value) {
    form.modelName = selectedModel.value
  }
}

async function save() {
  error.value = ''
  message.value = ''
  if (!form.provider || !form.modelName.trim() || !form.apiKey.trim()) {
    error.value = 'Provider, model name and API key are required.'
    return
  }

  saving.value = true
  try {
    await llmConfigApi.addKey({
      provider: form.provider,
      modelName: form.modelName.trim(),
      baseUrl: form.baseUrl?.trim() || undefined,
      apiKey: form.apiKey.trim()
    })
    const { data } = await llmConfigApi.keys()
    keys.value = data.keys || []
    message.value = 'Configuration saved.'
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Failed to save configuration'
  } finally {
    saving.value = false
  }
}

async function deleteConfig() {
  if (!confirm('Delete this key entry?')) return
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    await llmConfigApi.deleteKey(form.provider, form.modelName)
    const { data } = await llmConfigApi.keys()
    keys.value = data.keys || []
    if (keys.value.length === 0) {
      form.provider = ''
      form.modelName = ''
      form.baseUrl = ''
      form.apiKey = ''
    } else {
      const first = keys.value[0]
      form.provider = first.provider
      form.modelName = first.modelNames[0] || ''
      form.baseUrl = first.baseUrl || ''
    }
    message.value = 'Key deleted.'
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Failed to delete'
  } finally {
    saving.value = false
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

.actions {
  display: flex;
  justify-content: space-between;
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
</style>
