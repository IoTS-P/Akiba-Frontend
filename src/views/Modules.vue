<template>
  <div class="modules-page">
    <!-- Upload section -->
    <section class="panel upload-panel">
      <div>
        <h2>Module Jars</h2>
        <p class="hint">
          Upload a module <code>.jar</code> file. The jar must contain a <code>Main-Class</code>
          manifest attribute pointing to a class that extends <code>AkibaModule</code>.
          Uploaded modules are stored privately under <code>modules/&lt;your-username&gt;/</code>.
        </p>
      </div>
      <div class="upload-row">
        <input ref="fileInput" class="native-file-input" type="file" accept=".jar" @change="onFileSelected" />
        <button type="button" class="secondary" @click="chooseFile">Choose Jar File</button>
        <span class="selected">{{ selectedFile ? selectedFile.name : 'No file selected' }}</span>
        <button :disabled="!selectedFile || uploading" @click="uploadModule">
          {{ uploading ? 'Uploading...' : 'Upload Module' }}
        </button>
      </div>
      <div v-if="message" class="message">{{ message }}</div>
      <div v-if="error" class="error">{{ error }}</div>
    </section>

    <!-- Module list -->
    <section class="panel">
      <div class="toolbar">
        <h3>Available Modules</h3>
        <button @click="loadModules">Refresh</button>
      </div>
      <div v-if="loading" class="hint">Loading...</div>
      <div v-else-if="modules.length === 0" class="empty">No modules available.</div>
      <div v-else class="module-list">
        <article v-for="mod in modules" :key="mod.mainClassName" class="module-card"
                 :class="{ 'private': mod.owner, 'public': !mod.owner }">
          <div class="module-header">
            <div>
              <h4>{{ mod.mainClassName.split('.').pop() }}</h4>
              <div class="module-class">{{ mod.mainClassName }}</div>
            </div>
            <div class="module-actions">
              <span class="badge" :class="mod.owner ? 'badge-private' : 'badge-public'">
                {{ mod.owner ? 'Private' : 'Public' }}
              </span>
              <button v-if="mod.owner" class="danger sm" @click="deleteModule(mod.jarFileName)">Delete</button>
            </div>
          </div>
          <div class="meta">
            <span>File: {{ mod.jarFileName }}</span>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { moduleApi, type ModuleEntry } from '@/services/api'

const modules = ref<ModuleEntry[]>([])
const loading = ref(false)
const uploading = ref(false)
const selectedFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const message = ref('')
const error = ref('')

function chooseFile() {
  fileInput.value?.click()
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] || null
  message.value = ''
  error.value = ''
}

async function loadModules() {
  loading.value = true
  error.value = ''
  try {
    const res = await moduleApi.list()
    modules.value = res.data.modules
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || 'Failed to load modules'
  } finally {
    loading.value = false
  }
}

async function uploadModule() {
  if (!selectedFile.value) return
  uploading.value = true
  error.value = ''
  message.value = ''
  try {
    const form = new FormData()
    form.append('file', selectedFile.value)
    const res = await moduleApi.upload(form)
    message.value = res.data.message + ': ' + res.data.module.mainClassName
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
    await loadModules()
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || 'Upload failed'
  } finally {
    uploading.value = false
  }
}

async function deleteModule(jarFileName: string) {
  if (!confirm(`Delete module jar "${jarFileName}"?`)) return
  error.value = ''
  try {
    await moduleApi.delete(jarFileName)
    await loadModules()
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || 'Delete failed'
  }
}

onMounted(loadModules)
</script>

<style scoped>
.modules-page { display: flex; flex-direction: column; gap: 20px; }
.panel { background: #fff; border-radius: 10px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.upload-panel { display: flex; flex-direction: column; gap: 12px; }
.hint { color: #666; margin: 6px 0 0; }
.upload-row, .toolbar, .module-header, .meta { display: flex; align-items: center; gap: 12px; }
.upload-row { flex-wrap: wrap; }
.toolbar, .module-header { justify-content: space-between; }
.native-file-input { display: none; }
button { padding: 8px 12px; border: none; border-radius: 6px; background: #e94560; color: #fff; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.secondary { background: #16213e; }
button.danger { background: #8b1e2d; }
button.sm { padding: 4px 8px; font-size: 13px; }
.message { color: #0a7a32; }
.error { color: #c62828; }
.selected, .module-class, .meta { color: #666; font-size: 13px; }
.module-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
.module-card { border: 1px solid #eee; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.module-card.private { border-left: 3px solid #e94560; }
.module-card.public { border-left: 3px solid #0a7a32; }
.module-card h4 { margin: 0; }
.module-actions { display: flex; align-items: center; gap: 8px; }
.badge { padding: 3px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.badge-public { background: #e3f6e8; color: #0a7a32; }
.badge-private { background: #fce4e8; color: #c62828; }
.empty { color: #888; }
code { background: #f3f3f8; padding: 2px 4px; border-radius: 4px; }
</style>
