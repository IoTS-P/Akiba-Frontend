<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="logo">Akiba</div>
      <nav class="nav">
        <router-link to="/" class="nav-item">
          <span class="icon">📊</span>
          <span>Dashboard</span>
        </router-link>
        <router-link to="/instances" class="nav-item">
          <span class="icon">🗄️</span>
          <span>Instances</span>
        </router-link>
        <router-link to="/scripts" class="nav-item">
          <span class="icon">📜</span>
          <span>Scripts</span>
        </router-link>
        <router-link to="/workflows" class="nav-item">
          <span class="icon">⚙️</span>
          <span>Workflows</span>
        </router-link>
        <router-link to="/files" class="nav-item">
          <span class="icon">📁</span>
          <span>Files</span>
        </router-link>
        <router-link to="/query" class="nav-item">
          <span class="icon">🔍</span>
          <span>Query</span>
        </router-link>
      </nav>
      <div class="sidebar-footer">
        <div class="user-info">
          <span>{{ authStore.user?.username }}</span>
        </div>
        <button @click="handleLogout" class="logout-btn">Logout</button>
      </div>
    </aside>
    <main class="main-content">
      <header class="header">
        <h1>{{ currentRoute }}</h1>
      </header>
      <div class="content">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const currentRoute = computed(() => {
  const names: Record<string, string> = {
    dashboard: 'Dashboard',
    instances: 'Instances',
    scripts: 'Scripts',
    workflows: 'Workflows',
    files: 'Files',
    query: 'Query'
  }
  return names[route.name as string] || 'Akiba'
})

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
</script>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 220px;
  background: #1a1a2e;
  color: #fff;
  display: flex;
  flex-direction: column;
  padding: 20px 0;
}

.logo {
  font-size: 24px;
  font-weight: bold;
  padding: 0 20px 30px;
  color: #e94560;
}

.nav {
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  color: #a0a0a0;
  text-decoration: none;
  transition: all 0.2s;
}

.nav-item:hover,
.nav-item.router-link-active {
  background: #16213e;
  color: #e94560;
}

.icon {
  font-size: 18px;
}

.sidebar-footer {
  padding: 20px;
  border-top: 1px solid #333;
}

.user-info {
  font-size: 14px;
  margin-bottom: 10px;
  color: #a0a0a0;
}

.logout-btn {
  width: 100%;
  padding: 10px;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.logout-btn:hover {
  background: #d63850;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.header {
  background: #fff;
  padding: 20px 30px;
  border-bottom: 1px solid #e0e0e0;
}

.header h1 {
  font-size: 24px;
  font-weight: 600;
}

.content {
  flex: 1;
  padding: 30px;
  overflow-y: auto;
}
</style>