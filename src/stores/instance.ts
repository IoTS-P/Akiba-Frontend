import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { instanceApi } from '@/services/api'
import type { InstanceSummary } from '@/types'

const SELECTED_KEY = 'akibaSelectedInstance'

/**
 * Tracks the user's currently selected akiba_db_daemon instance.
 *
 * The list comes from the server (`GET /api/instances`), which asks the daemon
 * for the instances **owned by the signed-in user**. It used to be impossible to
 * enumerate instances — the daemon had no listing endpoint — so this store kept
 * names in `localStorage` and probed them one by one, which meant a fresh
 * browser saw "no instances" even when instances existed. The server is now the
 * source of truth; only the *selection* stays in `localStorage` (it is a UI
 * preference) and it is attached to every API request through the
 * `X-Akiba-Instance` header (see services/api.ts).
 */
export const useInstanceStore = defineStore('instance', () => {
  const selected = ref<string | null>(localStorage.getItem(SELECTED_KEY))
  const available = ref<InstanceSummary[]>([])
  const loading = ref(false)
  /** True once a refresh has completed, so "no instances" can be stated confidently. */
  const loaded = ref(false)
  const lastError = ref<string | null>(null)
  /**
   * Instances with a backup or restore running on the daemon right now.
   *
   * Also covers runs this browser did not start (another tab, the CLI, the
   * automatic snapshot after a write), because the server asks the daemon rather
   * than tracking clicks. The UI greys out "Back up" while a name is in here.
   */
  const busyInstances = ref<string[]>([])

  const hasSelection = computed(() => !!selected.value)
  const hasAny = computed(() => available.value.length > 0)

  /** Reload the user's instances and drop a selection that is no longer theirs. */
  async function refresh() {
    loading.value = true
    lastError.value = null
    try {
      const { data } = await instanceApi.list()
      available.value = data.instances ?? []
      busyInstances.value = data.backupInProgress ?? []
      if (selected.value && !available.value.some((i) => i.name === selected.value)) {
        clear()
      }
      loaded.value = true
      // Nothing else would tell the page that a run finished.
      if (busyInstances.value.length > 0) watchBusyInstances()
    } catch (e: any) {
      lastError.value =
        e?.response?.data?.error || e?.message || 'Failed to load instances'
    } finally {
      loading.value = false
    }
  }

  /** Whether a backup or restore of [name] is running. */
  function isBackupRunning(name: string) {
    return busyInstances.value.includes(name)
  }

  /**
   * Treat [name] as busy before the server confirms it.
   *
   * Covers the gap between the click and the daemon taking its lock, so a second
   * click cannot slip through.
   */
  function markBackupRunning(name: string) {
    if (!busyInstances.value.includes(name)) {
      busyInstances.value = [...busyInstances.value, name]
    }
  }

  /** Stop treating [name] as busy (the request was refused, or it finished). */
  function clearBackupRunning(name: string) {
    busyInstances.value = busyInstances.value.filter((n) => n !== name)
  }

  let busyTimer: number | null = null

  /**
   * Poll while something is busy, then stop.
   *
   * The first full backup of an instance can take a minute; without this the
   * button would stay disabled for good, because nothing would report the end of
   * the run back to the page.
   */
  function watchBusyInstances() {
    if (busyTimer !== null) return
    busyTimer = window.setInterval(async () => {
      await refresh()
      if (busyInstances.value.length === 0 && busyTimer !== null) {
        window.clearInterval(busyTimer)
        busyTimer = null
      }
    }, 5000)
  }

  function select(name: string) {
    selected.value = name
    localStorage.setItem(SELECTED_KEY, name)
    if (!available.value.some((i) => i.name === name)) {
      available.value = [...available.value, { name }]
    }
  }

  function clear() {
    selected.value = null
    localStorage.removeItem(SELECTED_KEY)
  }

  /** Forget an instance entirely (e.g. after deletion). */
  function forget(name: string) {
    if (selected.value === name) clear()
    available.value = available.value.filter((i) => i.name !== name)
  }

  return {
    selected,
    available,
    loading,
    loaded,
    lastError,
    busyInstances,
    hasSelection,
    hasAny,
    isBackupRunning,
    markBackupRunning,
    clearBackupRunning,
    watchBusyInstances,
    refresh,
    select,
    clear,
    forget
  }
})
