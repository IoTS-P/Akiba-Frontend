import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/services/api'
import type { AuthResponse } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const user = ref<{ username: string } | null>(
    JSON.parse(localStorage.getItem('user') || 'null')
  )

  const isAuthenticated = computed(() => !!token.value)

  /** True while the deployment has no account yet — the UI then shows setup. */
  const needsSetup = ref(false)
  /** Whether the first-run setup state has been resolved at least once. */
  const setupChecked = ref(false)

  async function checkSetupStatus(): Promise<boolean> {
    try {
      const { data } = await authApi.setupStatus()
      needsSetup.value = data.needsSetup
    } catch {
      // If the check fails we assume setup is done: showing a setup form that
      // the server would refuse is worse than showing a login form.
      needsSetup.value = false
    } finally {
      setupChecked.value = true
    }
    return needsSetup.value
  }

  async function setup(password: string) {
    const response = await authApi.setup(password)
    needsSetup.value = false
    setAuth(response.data)
  }

  async function login(password: string) {
    const response = await authApi.login(password)
    setAuth(response.data)
  }

  /** Replace the operator password; the session stays valid. */
  async function changePassword(currentPassword: string, newPassword: string) {
    await authApi.changePassword(currentPassword, newPassword)
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
      user.value = { username: response.data.username }
      localStorage.setItem('user', JSON.stringify(user.value))
    } catch {
      clearAuth()
    }
  }

  function setAuth(data: AuthResponse) {
    token.value = data.token
    user.value = { username: data.username }
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
    needsSetup,
    setupChecked,
    checkSetupStatus,
    setup,
    login,
    changePassword,
    logout,
    checkAuth
  }
})
