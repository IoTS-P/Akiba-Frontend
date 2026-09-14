<template>
  <div class="admin-users">
    <h1 class="page-title">Users</h1>
    <p class="page-hint">
      Accounts are created here — Akiba ships no default user. An account also
      gets a matching credential in the database daemon, because every instance
      is owned by the user that created it.
    </p>

    <div class="actions">
      <div class="input-group">
        <input v-model="newUsername" placeholder="username" />
        <input v-model="newPassword" type="password" placeholder="password (min 6)" />
        <label class="checkbox">
          <input type="checkbox" v-model="newIsAdmin" />
          administrator
        </label>
        <button @click="createUser" :disabled="creating || !canCreate">
          {{ creating ? 'Creating…' : 'Create user' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="users.length === 0" class="empty">No users.</div>
    <table v-else class="table">
      <thead>
        <tr>
          <th>Username</th>
          <th>Role</th>
          <th>Sign-in status</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in users" :key="user.id">
          <td>{{ user.username }}</td>
          <td>
            <span class="role" :class="{ admin: user.isAdmin }">
              {{ user.isAdmin ? 'administrator' : 'user' }}
            </span>
          </td>
          <td>
            <span v-if="user.locked" class="locked" :title="user.lockedUntil || ''">
              locked until {{ formatLock(user.lockedUntil) }}
            </span>
            <span v-else-if="user.failedLoginAttempts" class="attempts">
              {{ user.failedLoginAttempts }} failed attempt(s)
            </span>
            <span v-else class="ok">ok</span>
          </td>
          <td class="mono">{{ user.createdAt || '—' }}</td>
          <td>
            <input
              class="inline-input"
              v-model="passwordResets[user.id]"
              type="password"
              placeholder="new password"
            />
            <button
              class="btn-action"
              :disabled="!passwordResets[user.id] || passwordResets[user.id].length < 6"
              @click="resetPassword(user)"
            >Reset password</button>
            <button
              v-if="user.locked || user.failedLoginAttempts"
              class="btn-action"
              :disabled="unlocking === user.id"
              @click="unlockUser(user)"
            >{{ unlocking === user.id ? 'Unlocking…' : 'Unlock' }}</button>
            <button
              class="btn-action danger"
              :disabled="user.username === authStore.user?.username"
              @click="deleteUser(user)"
            >Delete</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="message" :class="['message', messageType]">{{ message }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { adminApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import type { AdminUserEntry } from '@/types'

const authStore = useAuthStore()

const users = ref<AdminUserEntry[]>([])
const loading = ref(false)
const creating = ref(false)
const newUsername = ref('')
const newPassword = ref('')
const newIsAdmin = ref(false)
const passwordResets = reactive<Record<number, string>>({})
const message = ref('')
const messageType = ref<'success' | 'error'>('success')
/** Id of the account currently being unlocked (for the button label). */
const unlocking = ref<number | null>(null)

const canCreate = computed(
  () => newUsername.value.trim().length > 0 && newPassword.value.length >= 6
)

onMounted(load)

function showMessage(text: string, type: 'success' | 'error') {
  message.value = text
  messageType.value = type
}

async function load() {
  loading.value = true
  try {
    const { data } = await adminApi.listUsers()
    users.value = data.users || []
  } catch (e: any) {
    showMessage(e?.response?.data?.message || e?.response?.data?.error || 'Failed to load users', 'error')
  } finally {
    loading.value = false
  }
}

async function createUser() {
  creating.value = true
  try {
    await adminApi.createUser(newUsername.value.trim(), newPassword.value, newIsAdmin.value)
    showMessage(`User "${newUsername.value.trim()}" created`, 'success')
    newUsername.value = ''
    newPassword.value = ''
    newIsAdmin.value = false
    await load()
  } catch (e: any) {
    showMessage(e?.response?.data?.message || e?.response?.data?.error || 'Failed to create user', 'error')
  } finally {
    creating.value = false
  }
}

async function resetPassword(user: AdminUserEntry) {
  const password = passwordResets[user.id]
  if (!password) return
  try {
    await adminApi.resetPassword(user.id, password)
    passwordResets[user.id] = ''
    showMessage(`Password of "${user.username}" updated`, 'success')
  } catch (e: any) {
    showMessage(
      e?.response?.data?.message || e?.response?.data?.error || 'Failed to update password',
      'error'
    )
  }
}

async function deleteUser(user: AdminUserEntry) {
  if (!confirm(`Delete user "${user.username}"? Their instances stay in the database daemon.`)) return
  try {
    await adminApi.deleteUser(user.id)
    showMessage(`User "${user.username}" deleted`, 'success')
    await load()
  } catch (e: any) {
    showMessage(e?.response?.data?.message || e?.response?.data?.error || 'Failed to delete user', 'error')
  }
}

/**
 * Lift the brute-force lock of an account.
 *
 * An account locks itself for a day after five consecutive failed sign-ins; the
 * user is told at the login page to ask an administrator, which is this button.
 */
async function unlockUser(user: AdminUserEntry) {
  unlocking.value = user.id
  try {
    await adminApi.unlockUser(user.id)
    showMessage(`"${user.username}" unlocked`, 'success')
    await load()
  } catch (e: any) {
    showMessage(e?.response?.data?.message || e?.response?.data?.error || 'Failed to unlock user', 'error')
  } finally {
    unlocking.value = null
  }
}

/** Render the lock expiry (an ISO instant) in the browser's local time. */
function formatLock(lockedUntil?: string | null): string {
  if (!lockedUntil) return 'the lock expires'
  const at = new Date(lockedUntil)
  return Number.isNaN(at.getTime()) ? lockedUntil : at.toLocaleString()
}
</script>

<style scoped>
.admin-users { padding: 4px; }
.page-title { margin: 0 0 6px; font-size: 22px; }
.page-hint { color: #666; font-size: 13px; margin: 0 0 18px; line-height: 1.55; max-width: 820px; }

.actions { margin-bottom: 16px; }
.input-group { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.input-group input {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}
.checkbox { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #444; }
.input-group button {
  padding: 8px 16px;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.input-group button:disabled { opacity: 0.6; cursor: not-allowed; }

.loading, .empty { padding: 24px; color: #777; text-align: center; }

.table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th, .table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid #eee;
  vertical-align: middle;
}
.table th { color: #666; font-weight: 500; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }

.role {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #f5f5f5;
  color: #777;
}
.role.admin { background: #fff5f7; color: #e94560; }

.locked { font-size: 12px; color: #b3261e; }
.attempts { font-size: 12px; color: #a06a00; }
.ok { font-size: 12px; color: #777; }

.inline-input {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  margin-right: 6px;
}

.btn-action {
  padding: 5px 10px;
  margin-right: 6px;
  font-size: 12px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 5px;
  cursor: pointer;
}
.btn-action:hover:not(:disabled) { background: #fafafa; }
.btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-action.danger { color: #d32f2f; border-color: #f0c0c0; }

.message {
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
}
.message.success { background: #e8f5e9; color: #2e7d32; }
.message.error { background: #fdecea; color: #c62828; }
</style>
