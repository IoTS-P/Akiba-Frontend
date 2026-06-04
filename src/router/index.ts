import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useInstanceStore } from '@/stores/instance'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
      meta: { guest: true }
    },
    {
      path: '/select-instance',
      name: 'select-instance',
      component: () => import('@/views/SelectInstance.vue'),
      meta: { requiresAuth: true, skipInstanceCheck: true }
    },
    {
      path: '/',
      component: () => import('@/components/Layout.vue'),
      meta: { requiresAuth: true, requiresInstance: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/Dashboard.vue')
        },
        {
          path: 'instances',
          name: 'instances',
          component: () => import('@/views/Instances.vue')
        },
        {
          path: 'scripts',
          name: 'scripts',
          component: () => import('@/views/Scripts.vue')
        },
        {
          path: 'agent',
          name: 'agent',
          component: () => import('@/views/Agent.vue')
        },
        {
          path: 'workflows',
          name: 'workflows',
          component: () => import('@/views/Workflows.vue')
        },
        {
          path: 'files',
          name: 'files',
          component: () => import('@/views/Files.vue')
        },
        {
          path: 'query',
          name: 'query',
          component: () => import('@/views/Query.vue')
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/Settings.vue')
        }
      ]
    }
  ]
})

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()
  const instanceStore = useInstanceStore()
  const requiresAuth = to.matched.some((r) => r.meta.requiresAuth)
  const isGuest = to.matched.some((r) => r.meta.guest)
  const requiresInstance = to.matched.some((r) => r.meta.requiresInstance)

  if (requiresAuth && !authStore.isAuthenticated) {
    await authStore.checkAuth()
  }

  if (isGuest && authStore.isAuthenticated) {
    return next({ name: 'dashboard' })
  }
  if (requiresAuth && !authStore.isAuthenticated) {
    return next({ name: 'login' })
  }
  // After auth: if the page expects an active instance and none is set,
  // route the user through the selection page first.
  if (requiresInstance && !instanceStore.hasSelection) {
    return next({ name: 'select-instance' })
  }
  next()
})

export default router
