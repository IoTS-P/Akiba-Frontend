<template>
  <div class="skills-page">
    <section class="panel upload-panel">
      <div>
        <h2>Skills</h2>
        <p class="hint">
          Upload a skill zip containing <code>skill.json</code>, Claude-style <code>SKILL.md</code>,
          or <code>instructions.md</code>. Installed skills are stored per user.
        </p>
      </div>
      <div class="upload-row">
        <input ref="fileInput" class="native-file-input" type="file" accept=".zip" @change="onFileSelected" />
        <button type="button" class="secondary" @click="chooseFile">Choose Zip File</button>
        <span class="selected">{{ selectedFile ? selectedFile.name : 'No file selected' }}</span>
        <button :disabled="!selectedFile || uploading" @click="uploadSkill">
          {{ uploading ? 'Uploading...' : 'Upload Skill Zip' }}
        </button>
      </div>
      <div v-if="message" class="message">{{ message }}</div>
      <div v-if="error" class="error">{{ error }}</div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <h3>Installed Skills</h3>
        <button @click="loadSkills">Refresh</button>
      </div>
      <div v-if="loading" class="hint">Loading...</div>
      <div v-else-if="skills.length === 0" class="empty">No skills installed.</div>
      <div v-else class="skill-list">
        <article v-for="skill in skills" :key="skill.id" class="skill-card">
          <div class="skill-header">
            <div>
              <h4>{{ skill.name }}</h4>
              <div class="skill-id">{{ skill.id }}</div>
            </div>
            <button class="danger" @click="deleteSkill(skill.id)">Delete</button>
          </div>
          <p>{{ skill.description || '(no description)' }}</p>
          <div class="meta">
            <span>Entry: {{ skill.entry }}</span>
            <span v-if="skill.version">Version: {{ skill.version }}</span>
          </div>
          <div v-if="skill.triggers?.length" class="chips">
            <span v-for="trigger in skill.triggers" :key="trigger">{{ trigger }}</span>
          </div>
          <details>
            <summary>Files ({{ skill.files?.length || 0 }})</summary>
            <ul>
              <li v-for="file in skill.files" :key="file.path">
                <button class="link" @click="readFile(skill.id, file.path)">{{ file.path }}</button>
                <span class="file-size">{{ file.size }} bytes</span>
              </li>
            </ul>
          </details>
          <button @click="readSkill(skill.id)">Read Entry</button>
        </article>
      </div>
    </section>

    <section v-if="reader" class="panel reader">
      <div class="toolbar">
        <h3>{{ reader.skill.id }} / {{ readerPath || reader.path || reader.skill.entry }}</h3>
        <button @click="reader = null">Close</button>
      </div>
      <pre>{{ reader.content }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { skillApi, type SkillInfo, type SkillReadResult } from '@/services/api'

const skills = ref<SkillInfo[]>([])
const loading = ref(false)
const uploading = ref(false)
const selectedFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const message = ref('')
const error = ref('')
const reader = ref<SkillReadResult | null>(null)
const readerPath = ref('')

function chooseFile() {
  fileInput.value?.click()
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] || null
  message.value = ''
  error.value = ''
}

async function loadSkills() {
  loading.value = true
  error.value = ''
  try {
    const res = await skillApi.list()
    skills.value = res.data.skills
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || 'Failed to load skills'
  } finally {
    loading.value = false
  }
}

async function uploadSkill() {
  if (!selectedFile.value) return
  uploading.value = true
  error.value = ''
  message.value = ''
  try {
    const form = new FormData()
    form.append('file', selectedFile.value)
    const res = await skillApi.upload(form)
    message.value = res.data.message
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
    await loadSkills()
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || 'Upload failed'
  } finally {
    uploading.value = false
  }
}

async function readSkill(skillId: string) {
  error.value = ''
  try {
    const res = await skillApi.read(skillId)
    reader.value = res.data
    readerPath.value = ''
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || 'Failed to read skill'
  }
}

async function readFile(skillId: string, path: string) {
  error.value = ''
  try {
    const res = await skillApi.readFile(skillId, path)
    reader.value = res.data
    readerPath.value = path
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || 'Failed to read file'
  }
}

async function deleteSkill(skillId: string) {
  if (!confirm(`Delete skill ${skillId}?`)) return
  error.value = ''
  try {
    await skillApi.delete(skillId)
    if (reader.value?.skill.id === skillId) reader.value = null
    await loadSkills()
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || 'Delete failed'
  }
}

onMounted(loadSkills)
</script>

<style scoped>
.skills-page { display: flex; flex-direction: column; gap: 20px; }
.panel { background: #fff; border-radius: 10px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.upload-panel { display: flex; flex-direction: column; gap: 12px; }
.hint { color: #666; margin: 6px 0 0; }
.upload-row, .toolbar, .skill-header, .meta { display: flex; align-items: center; gap: 12px; }
.upload-row { flex-wrap: wrap; }
.toolbar, .skill-header { justify-content: space-between; }
.native-file-input { display: none; }
button { padding: 8px 12px; border: none; border-radius: 6px; background: #e94560; color: #fff; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.secondary { background: #16213e; }
button.danger { background: #8b1e2d; }
button.link { background: transparent; color: #e94560; padding: 0; }
.message { color: #0a7a32; }
.error { color: #c62828; }
.selected, .skill-id, .file-size, .meta { color: #666; font-size: 13px; }
.skill-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.skill-card { border: 1px solid #eee; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.skill-card h4 { margin: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips span { background: #f3f3f8; border-radius: 999px; padding: 3px 8px; font-size: 12px; }
ul { padding-left: 18px; }
li { margin: 6px 0; }
.reader pre { max-height: 500px; overflow: auto; background: #111827; color: #e5e7eb; padding: 16px; border-radius: 8px; white-space: pre-wrap; }
.empty { color: #888; }
code { background: #f3f3f8; padding: 2px 4px; border-radius: 4px; }
</style>
