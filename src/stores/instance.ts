import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { instanceApi } from '@/services/api'

const SELECTED_KEY = 'akibaSelectedInstance'
const KNOWN_KEY = 'akibaKnownInstances'

function loadKnown(): string[] {
  try {
    const raw = localStorage.getItem(KNOWN_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function saveKnown(names: string[]) {
  localStorage.setItem(KNOWN_KEY, JSON.stringify(names))
}

/**
 * Tracks the user's currently selected akiba_db_daemon instance.
 *
 * Because the daemon does not expose a "list all instances" endpoint,
 * the frontend remembers every name the user has either created or
 * successfully probed in `localStorage`, and confirms each entry is
 * still reachable via `GET /api/instances?probe=<name>`.
 *
 * The selection is persisted to localStorage so it survives reloads,
 * and it is attached to every API request via the X-Akiba-Instance
 * header (see services/api.ts).
 */
export const useInstanceStore = defineStore('instance', () => {
  const selected = ref<string | null>(localStorage.getItem(SELECTED_KEY))
  const available = ref<string[]>([])
  const known = ref<string[]>(loadKnown())
  const loading = ref(false)
  const lastError = ref<string | null>(null)

  const hasSelection = computed(() => !!selected.value)
  const hasAny = computed(() => available.value.length > 0)

  /**
   * Probe every name we know about and rebuild the `available` list with
   * the ones that still respond. Drops the current selection if it
   * disappeared.
   */
  async function refresh() {
    loading.value = true
    lastError.value = null
    const names = Array.from(new Set([
      ...known.value,
      ...(selected.value ? [selected.value] : [])
    ]))
    const reachable: string[] = []
    try {
      for (const name of names) {
        try {
          const { data } = await instanceApi.list(name)
          if (data.instances.includes(name)) reachable.push(name)
        } catch {
          /* ignore — the name is just not reachable right now */
        }
      }
      available.value = reachable
      // Keep the persisted "known" list in sync with what we just verified.
      known.value = reachable
      saveKnown(reachable)
      if (selected.value && !reachable.includes(selected.value)) {
        clear()
      }
    } catch (e: any) {
      lastError.value = e?.response?.data?.error || e?.message || 'Failed to load instances'
    } finally {
      loading.value = false
    }
  }

  /** Probe a single name supplied by the user; add to `known` on success. */
  async function probeAndAdd(name: string): Promise<boolean> {
    lastError.value = null
    try {
      const { data } = await instanceApi.list(name)
      if (data.instances.includes(name)) {
        if (!known.value.includes(name)) {
          known.value = [...known.value, name]
          saveKnown(known.value)
        }
        if (!available.value.includes(name)) {
          available.value = [...available.value, name]
        }
        return true
      }
      lastError.value = `Instance "${name}" was not reachable.`
      return false
    } catch (e: any) {
      lastError.value =
        e?.response?.data?.error || e?.message || 'Failed to probe instance'
      return false
    }
  }

  function select(name: string) {
    selected.value = name
    localStorage.setItem(SELECTED_KEY, name)
    if (!known.value.includes(name)) {
      known.value = [...known.value, name]
      saveKnown(known.value)
    }
    if (!available.value.includes(name)) {
      available.value = [...available.value, name]
    }
  }

  function clear() {
    selected.value = null
    localStorage.removeItem(SELECTED_KEY)
  }

  /** Forget an instance entirely (e.g. after deletion). */
  function forget(name: string) {
    if (selected.value === name) clear()
    known.value = known.value.filter((n) => n !== name)
    available.value = available.value.filter((n) => n !== name)
    saveKnown(known.value)
  }

  return {
    selected,
    available,
    known,
    loading,
    lastError,
    hasSelection,
    hasAny,
    refresh,
    probeAndAdd,
    select,
    clear,
    forget
  }
})
