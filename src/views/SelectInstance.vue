<template>
  <div class="select-page">
    <div class="card">
      <h1 class="title">Select an instance</h1>
      <p class="subtitle">
        Pick one of your akiba_db_daemon instances. All subsequent
        operations will be scoped to it.
      </p>

      <div v-if="store.loading" class="muted">Loading instances…</div>

      <template v-else-if="store.hasAny">
        <ul class="instance-list">
          <li
            v-for="name in store.available"
            :key="name"
            :class="{ active: name === store.selected }"
            @click="choose(name)"
          >
            <span class="name">{{ name }}</span>
            <span v-if="name === store.selected" class="badge">current</span>
          </li>
        </ul>
        <div class="actions">
          <button class="btn-secondary" @click="store.refresh">Refresh</button>
          <div class="action-links">
            <button class="btn-link" @click="showProbe = true">+ Add existing</button>
            <button class="btn-link" @click="showCreate = true">+ Create new</button>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="empty">
          <p>No instances are available.</p>
          <p class="hint">
            Either create a new instance, or attach an existing one by
            its name if you know it.
          </p>
          <div class="empty-actions">
            <button class="btn-primary" @click="showCreate = true">Create new</button>
            <button class="btn-secondary" @click="showProbe = true">Add existing</button>
          </div>
          <button class="btn-link" @click="store.refresh">Refresh</button>
        </div>
      </template>

      <p v-if="store.lastError" class="error">{{ store.lastError }}</p>
    </div>

    <!-- Create instance modal -->
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
        <div v-if="createError" class="error">{{ createError }}</div>
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

    <!-- Probe / add existing modal -->
    <div v-if="showProbe" class="modal" @click.self="showProbe = false">
      <div class="modal-content">
        <h2>Add existing instance</h2>
        <p class="modal-hint">
          The daemon does not list instances automatically. Enter the name
          of an instance that already exists and we will verify it.
        </p>
        <div class="form-group">
          <label>Name</label>
          <input
            v-model="probeName"
            placeholder="instance name"
            @keyup.enter="probeInstance"
            :disabled="probing"
          />
        </div>
        <div v-if="probeError" class="error">{{ probeError }}</div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showProbe = false" :disabled="probing">
            Cancel
          </button>
          <button class="btn-primary" @click="probeInstance" :disabled="probing || !probeName.trim()">
            {{ probing ? 'Verifying…' : 'Verify & select' }}
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
const createError = ref('')

const showProbe = ref(false)
const probeName = ref('')
const probing = ref(false)
const probeError = ref('')

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
  createError.value = ''
  try {
    await instanceApi.create(name)
    store.select(name)
    showCreate.value = false
    newName.value = ''
    router.push('/')
  } catch (e: any) {
    createError.value =
      e?.response?.data?.message ||
      e?.response?.data?.error ||
      e?.message ||
      'Failed to create instance'
  } finally {
    creating.value = false
  }
}

async function probeInstance() {
  const name = probeName.value.trim()
  if (!name) return
  probing.value = true
  probeError.value = ''
  try {
    const ok = await store.probeAndAdd(name)
    if (ok) {
      store.select(name)
      showProbe.value = false
      probeName.value = ''
      router.push('/')
    } else {
      probeError.value = store.lastError || `Instance "${name}" is not reachable.`
    }
  } finally {
    probing.value = false
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
}

.muted {
  color: #888;
  text-align: center;
  padding: 30px 0;
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
.badge {
  font-size: 11px;
  padding: 2px 8px;
  background: #e94560;
  color: #fff;
  border-radius: 10px;
}

.empty {
  text-align: center;
  padding: 24px 0;
}
.empty p { margin: 4px 0; color: #555; }
.empty .hint { color: #888; font-size: 13px; margin-bottom: 18px; }
.empty-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-bottom: 8px;
}

.actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.action-links { display: flex; gap: 12px; }

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
.modal-hint {
  font-size: 13px;
  color: #666;
  margin: -6px 0 14px;
}

.form-group { margin-bottom: 16px; }
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

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>
