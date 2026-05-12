import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

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
      path: '/',
      component: () => import('@/components/Layout.vue'),
      meta: { requiresAuth: true },
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
        }
      ]
    }
  ]
})

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const isGuest = to.matched.some((record) => record.meta.guest)

  if (requiresAuth && !authStore.isAuthenticated) {
    await authStore.checkAuth()
  }

  if (isGuest && authStore.isAuthenticated) {
    next({ name: 'dashboard' })
  } else if (requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'login' })
  } else {
    next()
  }
})

export default router