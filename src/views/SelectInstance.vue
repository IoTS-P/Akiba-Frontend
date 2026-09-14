<template>
  <div class="select-page">
    <div class="card">
      <template v-if="store.loading && !store.loaded">
        <h1 class="title">Select an instance</h1>
        <p class="subtitle">Loading your instances…</p>
      </template>

      <!-- No instance yet: this is the first thing a new user sees, so ask for
           the name directly instead of hiding it behind a button. -->
      <template v-else-if="!store.hasAny">
        <h1 class="title">Create your first instance</h1>
        <p class="subtitle">
          An instance is the database that holds your binaries and analysis
          results. Nothing is created for you by default — pick a name and
          Akiba will create it in the database daemon.
        </p>
        <div class="form-group">
          <label>Instance name</label>
          <input
            v-model="newName"
            placeholder="e.g. firmware-analysis"
            @keyup.enter="createInstance"
            :disabled="creating"
          />
          <p class="hint">Letters, digits, dot, underscore and hyphen, up to 64 characters.</p>
        </div>
        <div v-if="error" class="error">{{ error }}</div>
        <div class="actions-row">
          <button class="btn-secondary" @click="store.refresh" :disabled="creating">Refresh</button>
          <button
            class="btn-primary"
            @click="createInstance"
            :disabled="creating || !newName.trim()"
          >
            {{ creating ? 'Creating…' : 'Create & enter' }}
          </button>
        </div>
      </template>

      <template v-else>
        <h1 class="title">Select an instance</h1>
        <p class="subtitle">
          Pick one of your instances. All subsequent operations will be scoped to it.
        </p>
        <ul class="instance-list">
          <li
            v-for="instance in store.available"
            :key="instance.name"
            :class="{ active: instance.name === store.selected }"
            @click="choose(instance.name)"
          >
            <span class="name">{{ instance.name }}</span>
            <span class="meta">
              <span class="badge" v-if="instance.name === store.selected">current</span>
              <span class="state" :class="{ running: instance.running }">
                {{ instance.running ? 'running' : 'stopped' }}
              </span>
            </span>
          </li>
        </ul>
        <div class="actions-row">
          <button class="btn-secondary" @click="store.refresh">Refresh</button>
          <button class="btn-link" @click="showCreate = true">+ Create new</button>
        </div>
        <p v-if="store.lastError" class="error">{{ store.lastError }}</p>
      </template>
    </div>

    <!-- Create instance modal (from the list view) -->
    <div v-if="showCreate" class="modal" @click.self="showCreate = false">
      <div class="modal-content">
        <h2>Create instance</h2>
        <div class="form-group">
          <label>Name</label>
          <input
            v-model="newName"
            placeholder="e.g. my-instance"
            @keyup.enter="createInstance"
            :disabled="creating"
          />
        </div>
        <div v-if="error" class="error">{{ error }}</div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showCreate = false" :disabled="creating">
            Cancel
          </button>
          <button class="btn-primary" @click="createInstance" :disabled="creating || !newName.trim()">
            {{ creating ? 'Creating…' : 'Create & select' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useInstanceStore } from '@/stores/instance'
import { instanceApi } from '@/services/api'

const router = useRouter()
const store = useInstanceStore()

const showCreate = ref(false)
const newName = ref('')
const creating = ref(false)
const error = ref('')

onMounted(async () => {
  await store.refresh()
})

function choose(name: string) {
  store.select(name)
  router.push('/')
}

async function createInstance() {
  const name = newName.value.trim()
  if (!name) return
  creating.value = true
  error.value = ''
  try {
    await instanceApi.create(name)
    await store.refresh()
    store.select(name)
    showCreate.value = false
    newName.value = ''
    router.push('/')
  } catch (e: any) {
    error.value =
      e?.response?.data?.message ||
      e?.response?.data?.error ||
      e?.message ||
      'Failed to create instance'
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.select-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  padding: 24px;
}

.card {
  background: #fff;
  padding: 36px 40px;
  border-radius: 12px;
  width: 480px;
  max-width: 100%;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.title {
  font-size: 26px;
  color: #1a1a2e;
  margin-bottom: 6px;
}

.subtitle {
  color: #666;
  font-size: 14px;
  margin-bottom: 22px;
  line-height: 1.55;
}

.instance-list {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
}

.instance-list li {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  border-bottom: 1px solid #eee;
  transition: background 0.15s;
}
.instance-list li:last-child { border-bottom: none; }
.instance-list li:hover { background: #fafafa; }
.instance-list li.active {
  background: #fff5f7;
  border-left: 3px solid #e94560;
  padding-left: 13px;
}

.name { font-weight: 500; color: #222; }
.meta { display: flex; align-items: center; gap: 10px; }
.badge {
  font-size: 11px;
  padding: 2px 8px;
  background: #e94560;
  color: #fff;
  border-radius: 10px;
}
.state { font-size: 12px; color: #999; }
.state.running { color: #2e7d32; }

.actions-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.btn-primary {
  padding: 10px 18px;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-primary:hover:not(:disabled) { background: #d63850; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-secondary {
  padding: 10px 18px;
  background: #f5f5f5;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-link {
  background: transparent;
  border: none;
  color: #e94560;
  cursor: pointer;
  font-size: 14px;
  padding: 6px;
}
.btn-link:hover { text-decoration: underline; }

.error {
  color: #d32f2f;
  font-size: 13px;
  margin-top: 12px;
  text-align: center;
}

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
  padding: 28px;
  border-radius: 10px;
  width: 400px;
  max-width: 90vw;
}
.modal-content h2 { margin: 0 0 16px; font-size: 18px; }

.form-group { margin-bottom: 6px; }
.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
}
.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}
.hint { font-size: 12px; color: #888; margin: 6px 0 0; }

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>
