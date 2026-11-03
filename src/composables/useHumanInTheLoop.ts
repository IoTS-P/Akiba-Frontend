import { ref } from 'vue'
import { agentApi } from '@/services/api'
import type { PendingConfirmation, PendingUserChoice } from '@/types'

/** How often the global queue is polled (ms). */
export const GLOBAL_CONFIRMATION_POLL_MS = 3000

/**
 * Drains the backend's human-in-the-loop queues (tool confirmations and
 * ask_user_choice requests) for **all** sessions, not just the one on screen —
 * a sub-agent can be the one blocked. At most one prompt is shown at a time,
 * oldest first.
 */
export function useHumanInTheLoop() {
  const pendingConfirmation = ref<(PendingConfirmation & { sessionId: string }) | null>(null)
  const confirmationBusy = ref(false)
  const pendingChoice = ref<(PendingUserChoice & { sessionId: string }) | null>(null)
  const choiceBusy = ref(false)

  let pollInterval: number | null = null

  async function refresh() {
    try {
      const [confRes, choiceRes] = await Promise.all([
        agentApi.listPendingConfirmations(),
        agentApi.listPendingUserChoices()
      ])
      const pendingConfs = confRes.data.pending || {}
      const pendingChoices = choiceRes.data.pending || {}

      // Close prompts the backend no longer reports (answered elsewhere or
      // timed out); the per-session poll cannot see those.
      if (pendingConfirmation.value && !(pendingConfirmation.value.sessionId in pendingConfs)) {
        pendingConfirmation.value = null
      }
      if (pendingChoice.value && !(pendingChoice.value.sessionId in pendingChoices)) {
        pendingChoice.value = null
      }
      if (pendingConfirmation.value || pendingChoice.value) return

      const confEntries = Object.entries(pendingConfs)
      const choiceEntries = Object.entries(pendingChoices)
      let oldestConf: [string, PendingConfirmation] | null = null
      for (const entry of confEntries) {
        if (!oldestConf || entry[1].createdAt < oldestConf[1].createdAt) oldestConf = entry
      }
      let oldestChoice: [string, PendingUserChoice] | null = null
      for (const entry of choiceEntries) {
        if (!oldestChoice || entry[1].createdAt < oldestChoice[1].createdAt) oldestChoice = entry
      }
      if (oldestConf && (!oldestChoice || oldestConf[1].createdAt <= oldestChoice[1].createdAt)) {
        const [sessionId, pc] = oldestConf
        if (sessionId && pc) pendingConfirmation.value = { ...pc, sessionId }
      } else if (oldestChoice) {
        const [sessionId, puc] = oldestChoice
        if (sessionId && puc) pendingChoice.value = { ...puc, sessionId }
      }
    } catch {
      /* ignore — next tick retries */
    }
  }

  function start() {
    stop()
    void refresh()
    pollInterval = window.setInterval(refresh, GLOBAL_CONFIRMATION_POLL_MS)
  }

  function stop() {
    if (pollInterval != null) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }

  async function approve() {
    const cs = pendingConfirmation.value
    if (!cs || confirmationBusy.value) return
    confirmationBusy.value = true
    try {
      await agentApi.respondConfirmation(cs.sessionId, true)
    } catch {
      /* ignore — the next poll retries */
    } finally {
      confirmationBusy.value = false
    }
  }

  async function deny() {
    const cs = pendingConfirmation.value
    if (!cs || confirmationBusy.value) return
    confirmationBusy.value = true
    try {
      await agentApi.respondConfirmation(cs.sessionId, false)
    } catch {
      /* ignore */
    } finally {
      confirmationBusy.value = false
    }
  }

  async function respondChoice(answer: string | null, cancelled: boolean) {
    const cs = pendingChoice.value
    if (!cs || choiceBusy.value) return
    choiceBusy.value = true
    try {
      // The modal is not closed here: the next poll sees the request is gone.
      await agentApi.respondUserChoice(cs.sessionId, answer, cancelled)
    } catch {
      /* ignore — the next poll retries */
    } finally {
      choiceBusy.value = false
    }
  }

  return {
    pendingConfirmation,
    confirmationBusy,
    pendingChoice,
    choiceBusy,
    start,
    stop,
    approve,
    deny,
    respondChoice
  }
}
