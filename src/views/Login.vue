<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="title">Akiba</h1>
      <p class="subtitle">Framework Dashboard</p>
      <form @submit.prevent="handleSubmit" class="form">
        <div class="form-group">
          <label>Username</label>
          <input v-model="username" type="text" placeholder="Enter username" required />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input v-model="password" type="password" placeholder="Enter password" required />
        </div>
        <div v-if="error" class="error">{{ error }}</div>
        <button type="submit" class="btn" :disabled="loading">
          {{ isRegister ? 'Register' : 'Login' }}
        </button>
      </form>
      <p class="toggle">
        {{ isRegister ? 'Already have an account?' : "Don't have an account?" }}
        <a @click="toggleMode" href="#">{{ isRegister ? 'Login' : 'Register' }}</a>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const isRegister = ref(false)
const loading = ref(false)
const error = ref('')

async function handleSubmit() {
  loading.value = true
  error.value = ''
  try {
    if (isRegister.value) {
      await authStore.register(username.value, password.value)
    } else {
      await authStore.login(username.value, password.value)
    }
    router.push('/')
  } catch (e: any) {
    error.value = e.response?.data?.message || 'Authentication failed'
  } finally {
    loading.value = false
  }
}

function toggleMode() {
  isRegister.value = !isRegister.value
  error.value = ''
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

.toggle {
  text-align: center;
  margin-top: 20px;
  font-size: 14px;
  color: #666;
}

.toggle a {
  color: #e94560;
  cursor: pointer;
  text-decoration: none;
}

.toggle a:hover {
  text-decoration: underline;
}
</style>