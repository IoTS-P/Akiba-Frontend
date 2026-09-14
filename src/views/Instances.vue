<template>
  <div class="instances">
    <div class="actions">
      <div class="input-group">
        <input v-model="newInstanceName" placeholder="Instance name" @keyup.enter="createInstance" />
        <button @click="createInstance" :disabled="creating || !newInstanceName">
          {{ creating ? 'Creating…' : 'Create' }}
        </button>
      </div>
      <button class="btn-secondary" @click="store.refresh">Refresh</button>
    </div>

    <div v-if="store.loading && !store.loaded" class="loading">Loading...</div>
    <div v-else-if="!store.hasAny" class="empty">
      No instances yet. Create one above — an instance is the database that holds
      your binaries and analysis results.
    </div>
    <div v-else class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Last backup used</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="instance in store.available" :key="instance.name">
            <td>{{ instance.name }}</td>
            <td>
              <span v-if="instance.name === store.selected" class="status active">selected</span>
              <span v-else class="status muted">available</span>
              <span class="status" :class="instance.running ? 'active' : 'muted'">
                {{ instance.running ? 'running' : 'stopped' }}
              </span>
            </td>
            <td class="mono">{{ instance.logicalPrior || '—' }}</td>
            <td>
              <button
                v-if="instance.name !== store.selected"
                @click="store.select(instance.name)"
                class="btn-action"
              >Select</button>
              <button @click="startInstance(instance.name)" class="btn-action">Start</button>
              <button @click="shutdownInstance(instance.name)" class="btn-action">Shutdown</button>
              <button @click="openBackups(instance.name)" class="btn-action">Backups…</button>
              <button @click="deleteInstance(instance.name)" class="btn-action danger">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="message" :class="['message', messageType]">{{ message }}</div>

    <!-- Backups panel: choose a backup and restore it explicitly. -->
    <div v-if="backupInstanceName" class="modal" @click.self="closeBackups">
      <div class="modal-content wide">
        <h2>Backups of “{{ backupInstanceName }}”</h2>
        <p class="modal-hint">
          Restoring replaces the current content of this instance with the chosen
          backup and discards everything written since. There is no automatic
          rollback: an instance only changes state when you restore it here.
        </p>

        <div v-if="loadingBackups" class="loading">Loading backups…</div>
        <div v-else-if="backups.length === 0" class="empty">
          No backups yet. Create one with “Create backup” below.
        </div>
        <table v-else class="table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Type</th>
              <th>Alias</th>
              <th>Description</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="backup in backups" :key="backup.label">
              <td class="mono">{{ backup.label }}</td>
              <td>{{ backup.backupType }}</td>
              <td>{{ backup.alias || '—' }}</td>
              <td>{{ backup.description || '—' }}</td>
              <td class="mono">{{ formatTime(backup.createdAt) }}</td>
              <td>
                <button class="btn-action" @click="askRestore(backup)">Restore…</button>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="backup-create">
          <input v-model="newBackupAlias" placeholder="alias (optional)" />
          <input v-model="newBackupDescription" placeholder="description (optional)" />
          <button
            class="btn-secondary"
            :disabled="isBusy(backupInstanceName!)"
            @click="createBackup(backupInstanceName!)"
          >{{ isBusy(backupInstanceName!) ? 'Backup running…' : 'Create backup' }}</button>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" @click="closeBackups">Close</button>
        </div>
      </div>
    </div>

    <!-- Restore confirmation: the instance name must be typed, because this
         operation destroys everything written after the chosen backup. -->
    <div v-if="pendingRestore" class="modal" @click.self="pendingRestore = null">
      <div class="modal-content">
        <h2 class="danger-title">Confirm restore</h2>
        <p class="modal-hint">
          Instance <strong>{{ pendingRestore.instance }}</strong> will be rolled back to
          backup <strong>{{ pendingRestore.backup.label }}</strong>
          ({{ pendingRestore.backup.backupType }}, {{ formatTime(pendingRestore.backup.createdAt) }}).
          All data written after that backup is lost.
        </p>
        <div class="form-group">
          <label>Type the instance name to confirm</label>
          <input v-model="restoreConfirmText" :placeholder="pendingRestore.instance" />
        </div>
        <div v-if="restoreError" class="error">{{ restoreError }}</div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="pendingRestore = null" :disabled="restoring">
            Cancel
          </button>
          <button
            class="btn-danger"
            :disabled="restoring || restoreConfirmText.trim() !== pendingRestore.instance"
            @click="doRestore"
          >
            {{ restoring ? 'Restoring…' : 'Restore backup' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { instanceApi } from '@/services/api'
import { useInstanceStore } from '@/stores/instance'
import type { BackupSummary } from '@/types'

const router = useRouter()
const store = useInstanceStore()

const newInstanceName = ref('')
const creating = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

const backupInstanceName = ref<string | null>(null)
const backups = ref<BackupSummary[]>([])
const loadingBackups = ref(false)
const newBackupAlias = ref('')
const newBackupDescription = ref('')

const pendingRestore = ref<{ instance: string; backup: BackupSummary } | null>(null)
const restoreConfirmText = ref('')
const restoring = ref(false)
const restoreError = ref('')
/** Instance this page is currently asking the server to back up. */
const backingUp = ref<string | null>(null)

onMounted(async () => {
  await store.refresh()
})

function showMessage(text: string, type: 'success' | 'error') {
  message.value = text
  messageType.value = type
}

function formatTime(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return isNaN(date.getTime()) ? value : date.toLocaleString()
}

async function createInstance() {
  if (!newInstanceName.value) return
  const name = newInstanceName.value.trim()
  creating.value = true
  try {
    await instanceApi.create(name)
    store.select(name)
    newInstanceName.value = ''
    showMessage(`Instance "${name}" created`, 'success')
    await store.refresh()
  } catch (e: any) {
    showMessage(
      e?.response?.data?.message || e?.response?.data?.error || 'Failed to create instance',
      'error'
    )
  } finally {
    creating.value = false
  }
}

async function startInstance(name: string) {
  try {
    await instanceApi.start(name)
    showMessage(`Instance "${name}" started`, 'success')
    await store.refresh()
  } catch (e: any) {
    showMessage(e?.response?.data?.error || 'Failed to start instance', 'error')
  }
}

async function shutdownInstance(name: string) {
  try {
    await instanceApi.shutdown(name)
    showMessage(`Instance "${name}" shutdown`, 'success')
    await store.refresh()
  } catch (e: any) {
    showMessage(e?.response?.data?.error || 'Failed to shutdown instance', 'error')
  }
}

/**
 * Whether [name] must not be backed up right now.
 *
 * Two sources: this page's own in-flight request, and the server's view of the
 * daemon (`backupInProgress`), which also covers runs started elsewhere (another
 * tab, the CLI, the automatic snapshot after a write). The daemon refuses a
 * concurrent run anyway (HTTP 409), so this is about not offering the action
 * rather than about correctness.
 */
function isBusy(name: string): boolean {
  return backingUp.value === name || store.isBackupRunning(name)
}

async function createBackup(name: string) {
  if (isBusy(name)) return
  backingUp.value = name
  // Mark it busy straight away: the daemon only takes its lock once the request
  // arrives, and a second click must not slip through that window. The first full
  // backup of an instance takes up to a minute, so without this nothing would say
  // "in progress" until it is over.
  store.markBackupRunning(name)
  store.watchBusyInstances()
  try {
    const { data } = await instanceApi.backup({
      instanceName: name,
      alias: newBackupAlias.value.trim() || undefined,
      description: newBackupDescription.value.trim() || undefined,
      isFull: true
    })
    showMessage(`Backup created${data.label ? `: ${data.label}` : ''}`, 'success')
    newBackupAlias.value = ''
    newBackupDescription.value = ''
    if (backupInstanceName.value === name) await openBackups(name)
  } catch (e: any) {
    // 409 means another run still holds the instance: keep the button disabled
    // until the server reports the instance free again.
    showMessage(
      e?.response?.data?.error ||
        (e?.response?.status === 409
          ? 'A backup or restore of this instance is already running.'
          : 'Failed to create backup'),
      'error'
    )
    if (e?.response?.status !== 409) store.clearBackupRunning(name)
  } finally {
    backingUp.value = null
  }
  await store.refresh()
}

/**
 * Reload the open panel once a run finishes, so the backup it produced shows up.
 *
 * The store polls while anything is busy and then stops; this turns the last
 * transition (busy → free) into a refresh of the panel the user is looking at.
 */
watch(
  () => (backupInstanceName.value ? store.isBackupRunning(backupInstanceName.value) : false),
  (busy, wasBusy) => {
    if (wasBusy && !busy && backupInstanceName.value) void openBackups(backupInstanceName.value)
  }
)

async function openBackups(name: string) {
  backupInstanceName.value = name
  loadingBackups.value = true
  try {
    const { data } = await instanceApi.backups(name)
    // Expired backups cannot be restored; the daemon would refuse them anyway.
    backups.value = (data.backups || []).filter((b) => !b.isExpired)
    // This response is authoritative for the instance being looked at: fold it
    // into the shared busy state so every button agrees, and keep polling while a
    // run is in flight (started here or from another tab).
    if (data.busy) {
      store.markBackupRunning(name)
      store.watchBusyInstances()
    } else {
      store.clearBackupRunning(name)
    }
  } catch (e: any) {
    backups.value = []
    showMessage(e?.response?.data?.error || 'Failed to load backups', 'error')
  } finally {
    loadingBackups.value = false
  }
}

function closeBackups() {
  backupInstanceName.value = null
  backups.value = []
  newBackupAlias.value = ''
  newBackupDescription.value = ''
}

function askRestore(backup: BackupSummary) {
  if (!backupInstanceName.value) return
  pendingRestore.value = { instance: backupInstanceName.value, backup }
  restoreConfirmText.value = ''
  restoreError.value = ''
}

async function doRestore() {
  if (!pendingRestore.value) return
  restoring.value = true
  restoreError.value = ''
  const { instance, backup } = pendingRestore.value
  try {
    await instanceApi.restore(instance, backup.label, true)
    showMessage(`Instance "${instance}" restored to ${backup.label}`, 'success')
    pendingRestore.value = null
    await store.refresh()
    if (backupInstanceName.value) await openBackups(backupInstanceName.value)
  } catch (e: any) {
    restoreError.value = e?.response?.data?.error || 'Failed to restore backup'
  } finally {
    restoring.value = false
  }
}

async function deleteInstance(name: string) {
  if (!confirm(`Delete instance "${name}"?`)) return
  try {
    await instanceApi.delete(name)
    const wasSelected = store.selected === name
    store.forget(name)
    showMessage(`Instance "${name}" deleted`, 'success')
    if (wasSelected) {
      router.push('/select-instance')
    } else {
      await store.refresh()
    }
  } catch (e: any) {
    showMessage(e?.response?.data?.error || 'Failed to delete instance', 'error')
  }
}
</script>

<style scoped>
.instances {
  padding: 4px;
}

.actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.input-group {
  display: flex;
  gap: 8px;
}

.input-group input {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  min-width: 220px;
}

.input-group button,
.btn-secondary {
  padding: 8px 16px;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-secondary {
  background: #f5f5f5;
  color: #333;
}
.input-group button:disabled { opacity: 0.6; cursor: not-allowed; }

.loading, .empty {
  padding: 24px;
  color: #777;
  text-align: center;
}

.table-wrapper { overflow-x: auto; }
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.table th, .table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid #eee;
}
.table th { color: #666; font-weight: 500; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }

.status {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  margin-right: 6px;
  background: #eee;
  color: #666;
}
.status.active { background: #e8f5e9; color: #2e7d32; }
.status.muted { background: #f5f5f5; color: #888; }

.btn-action {
  padding: 5px 10px;
  margin-right: 6px;
  font-size: 12px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 5px;
  cursor: pointer;
}
.btn-action:hover { background: #fafafa; }
.btn-action.danger { color: #d32f2f; border-color: #f0c0c0; }

.message {
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
}
.message.success { background: #e8f5e9; color: #2e7d32; }
.message.error { background: #fdecea; color: #c62828; }

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
  width: 460px;
  max-width: 92vw;
  max-height: 86vh;
  overflow-y: auto;
}
.modal-content.wide { width: 860px; }
.modal-content h2 { margin: 0 0 10px; font-size: 18px; }
.danger-title { color: #c62828; }
.modal-hint { font-size: 13px; color: #666; margin: 0 0 16px; line-height: 1.5; }

.form-group { margin-bottom: 14px; }
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

.backup-create {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.backup-create input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.btn-danger {
  padding: 10px 18px;
  background: #c62828;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

.error { color: #d32f2f; font-size: 13px; margin-top: 8px; }
</style>
