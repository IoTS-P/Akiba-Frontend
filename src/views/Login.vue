<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="title">Akiba</h1>
      <p class="subtitle">{{ isSetup ? 'Create the administrator account' : 'Framework Dashboard' }}</p>

      <p v-if="isSetup" class="setup-hint">
        This instance has no accounts yet. The account you create here is the
        administrator and is the only one that can add further users — no
        default credentials are shipped with Akiba.
      </p>

      <form @submit.prevent="handleSubmit" class="form">
        <div class="form-group">
          <label>Username</label>
          <input v-model="username" type="text" placeholder="Enter username" required />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input v-model="password" type="password" placeholder="Enter password" required />
        </div>
        <div v-if="isSetup" class="form-group">
          <label>Confirm password</label>
          <input v-model="confirm" type="password" placeholder="Repeat password" required />
        </div>
        <div v-if="error" class="error">{{ error }}</div>
        <button type="submit" class="btn" :disabled="loading">
          {{ loading ? 'Please wait…' : (isSetup ? 'Create administrator' : 'Login') }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const confirm = ref('')
const isSetup = ref(false)
const loading = ref(false)
const error = ref('')

onMounted(async () => {
  // Ask the server whether this deployment still needs its first account. There
  // is no self-registration any more: either you set up the first administrator
  // here, or an administrator creates your account in the admin page.
  isSetup.value = await authStore.checkSetupStatus()
})

async function handleSubmit() {
  loading.value = true
  error.value = ''
  try {
    if (isSetup.value) {
      if (password.value !== confirm.value) {
        error.value = 'Passwords do not match'
        return
      }
      if (password.value.length < 6) {
        error.value = 'Password must be at least 6 characters'
        return
      }
      await authStore.setup(username.value, password.value)
    } else {
      await authStore.login(username.value, password.value)
    }
    router.push('/')
  } catch (e: any) {
    error.value =
      e.response?.data?.message ||
      e.response?.data?.error ||
      (isSetup.value ? 'Setup failed' : 'Authentication failed')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.login-card {
  background: #fff;
  padding: 40px;
  border-radius: 12px;
  width: 400px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.title {
  font-size: 32px;
  color: #e94560;
  text-align: center;
  margin-bottom: 8px;
}

.subtitle {
  text-align: center;
  color: #666;
  margin-bottom: 30px;
}

.setup-hint {
  font-size: 13px;
  color: #555;
  background: #fff5f7;
  border-left: 3px solid #e94560;
  padding: 10px 12px;
  border-radius: 4px;
  margin: -18px 0 22px;
  line-height: 1.5;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.form-group input {
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: #e94560;
}

.error {
  color: #e94560;
  font-size: 14px;
  text-align: center;
}

.btn {
  padding: 14px;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn:hover:not(:disabled) {
  background: #d63850;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
