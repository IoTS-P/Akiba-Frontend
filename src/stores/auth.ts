import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/services/api'
import type { AuthResponse } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const user = ref<{ userId: number; username: string } | null>(
    JSON.parse(localStorage.getItem('user') || 'null')
  )

  const isAuthenticated = computed(() => !!token.value)

  async function login(username: string, password: string) {
    const response = await authApi.login(username, password)
    setAuth(response.data)
  }

  async function register(username: string, password: string) {
    const response = await authApi.register(username, password)
    setAuth(response.data)
  }

  async function logout() {
    try {
      await authApi.logout()
    } finally {
      clearAuth()
    }
  }

  async function checkAuth() {
    if (!token.value) return
    try {
      const response = await authApi.me()
      user.value = { userId: response.data.userId, username: response.data.username }
    } catch {
      clearAuth()
    }
  }

  function setAuth(data: AuthResponse) {
    token.value = data.token
    user.value = { userId: data.userId, username: data.username }
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(user.value))
  }

  function clearAuth() {
    token.value = null
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  return {
    token,
    user,
    isAuthenticated,
    login,
    register,
    logout,
    checkAuth
  }
})