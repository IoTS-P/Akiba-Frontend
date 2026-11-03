<template>
  <div v-if="request" class="confirm-overlay" @click.self>
    <div class="confirm-modal">
      <div class="confirm-header">
        <span class="confirm-icon">❓</span>
        <span class="confirm-title">Agent Asks for Your Choice</span>
      </div>
      <div class="confirm-body">
        <p v-if="agentName" class="confirm-tool">
          <span class="confirm-label">Agent:</span>
          <code>{{ agentName }}</code>
        </p>
        <p class="confirm-label-text">{{ request.question }}</p>
        <div class="choice-options">
          <label
            v-for="(opt, idx) in request.options"
            :key="idx"
            class="choice-option"
            :class="{ selected: selected === opt }"
          >
            <input type="radio" name="ask-user-choice" :value="opt" v-model="selected" />
            <span class="choice-option-text">{{ opt }}</span>
          </label>
          <label
            v-if="request.allowCustomInput"
            class="choice-option"
            :class="{ selected: selected === CUSTOM_CHOICE_VALUE }"
          >
            <input type="radio" name="ask-user-choice" :value="CUSTOM_CHOICE_VALUE" v-model="selected" />
            <span class="choice-option-text">Custom answer…</span>
          </label>
        </div>
        <textarea
          v-if="request.allowCustomInput && selected === CUSTOM_CHOICE_VALUE"
          v-model="customText"
          class="choice-custom-input"
          rows="3"
          placeholder="Type your own answer…"
        ></textarea>

        <!-- Follow-up questions: ask the side assistant before deciding. -->
        <div class="choice-btw">
          <div class="choice-btw-header">
            <span class="choice-btw-title">Need more info? Ask a follow-up first</span>
            <span class="choice-countdown" title="The request auto-cancels after inactivity">
              auto-cancel in {{ countdown }}
            </span>
          </div>
          <div v-if="btwThread.length" class="choice-btw-thread">
            <div v-for="(qa, i) in btwThread" :key="i" class="choice-btw-item">
              <p class="choice-btw-q"><span class="choice-btw-tag">Q</span>{{ qa.question }}</p>
              <p v-if="qa.answer" class="choice-btw-a"><span class="choice-btw-tag">A</span>{{ qa.answer }}</p>
              <p v-else class="choice-btw-a choice-btw-pending"><span class="choice-btw-tag">A</span>Thinking…</p>
            </div>
          </div>
          <div class="choice-btw-input-row">
            <input
              v-model="btwInput"
              class="choice-btw-input"
              type="text"
              placeholder="e.g. Why these options? What did you find so far?"
              :disabled="btwBusy"
              @keyup.enter="askBtw"
            />
            <button class="btn-secondary" @click="askBtw" :disabled="btwBusy || !btwInput.trim()">
              {{ btwBusy ? '…' : 'Ask' }}
            </button>
          </div>
        </div>
      </div>
      <div class="confirm-actions">
        <button class="btn-secondary" @click="emit('cancel')" :disabled="busy">
          Cancel
        </button>
        <button class="btn-primary confirm-approve" @click="submit" :disabled="busy || !canSubmit">
          {{ busy ? '…' : 'Submit' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { agentApi } from '@/services/api'
import type { BtwQA, PendingUserChoice } from '@/types'

const props = defineProps<{
  request: (PendingUserChoice & { sessionId: string }) | null
  busy: boolean
  agentName?: string | null
}>()

const emit = defineEmits<{ submit: [answer: string]; cancel: [] }>()

/** Sentinel v-model value for the "Custom answer…" radio option. */
const CUSTOM_CHOICE_VALUE = '__custom__'

/** Inactivity timeout mirrored from the backend (10 minutes). */
const CHOICE_TIMEOUT_MS = 600_000

const selected = ref('')
const customText = ref('')
const btwInput = ref('')
const btwBusy = ref(false)
const btwThread = ref<BtwQA[]>([])
const nowTick = ref(Date.now())
let tickInterval: number | null = null

const canSubmit = computed(() => {
  if (!props.request) return false
  if (selected.value === CUSTOM_CHOICE_VALUE) return customText.value.trim().length > 0
  return selected.value.length > 0
})

const countdown = computed(() => {
  const cs = props.request
  if (!cs) return ''
  const base = cs.lastActivityAt ?? cs.createdAt
  const remaining = Math.max(0, CHOICE_TIMEOUT_MS - (nowTick.value - base))
  const m = Math.floor(remaining / 60000)
  const s = Math.floor((remaining % 60000) / 1000)
  return `${m}:${s.toString().padStart(2, '0')}`
})

// A new request resets the local answers and seeds the follow-up thread
// from the history the backend keeps.
watch(
  () => props.request,
  (v) => {
    if (!v) {
      stopTicker()
      return
    }
    selected.value = ''
    customText.value = ''
    btwInput.value = ''
    btwThread.value = (v.btwHistory || []).map((qa) => ({ ...qa }))
    startTicker()
  },
  { immediate: true }
)

function startTicker() {
  if (tickInterval != null) return
  nowTick.value = Date.now()
  tickInterval = window.setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
}

function stopTicker() {
  if (tickInterval != null) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}

async function askBtw() {
  const cs = props.request
  const q = btwInput.value.trim()
  if (!cs || !q || btwBusy.value) return
  btwBusy.value = true
  btwInput.value = ''
  const idx = btwThread.value.length
  btwThread.value.push({ question: q, answer: '', answeredAt: Date.now() })
  try {
    const { data } = await agentApi.askUserChoiceBtw(cs.sessionId, q)
    const answer = data.answered && data.answer != null
      ? data.answer
      : (data.error || '(no answer — the request may already be resolved)')
    btwThread.value[idx] = { question: q, answer, answeredAt: Date.now() }
  } catch {
    btwThread.value[idx] = {
      question: q,
      answer: '(failed to get an answer — network error)',
      answeredAt: Date.now()
    }
  } finally {
    btwBusy.value = false
  }
}

function submit() {
  if (!canSubmit.value) return
  emit('submit', selected.value === CUSTOM_CHOICE_VALUE ? customText.value.trim() : selected.value)
}

onUnmounted(stopTicker)
</script>

<style scoped>
/* Shared utilities, copied so the component does not depend on the view's scope. */
.btn-primary {
  padding: 10px 18px;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-secondary {
  padding: 10px 20px;
  background: #f5f5f5;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.muted {
  color: #999;
  text-align: center;
  padding: 14px;
}
.muted.small { font-size: 13px; }
/* ---- Tool confirmation modal ---- */
.confirm-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.confirm-modal {
  background: var(--bg-card, #1e1e2e);
  border: 1px solid var(--border-color, #333346);
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.confirm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #333346);
  font-size: 15px;
  font-weight: 600;
}

.confirm-icon { font-size: 18px; }
.confirm-title { color: var(--text-primary, #cdd6f4); }

.confirm-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirm-tool {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary, #a6adc8);
}
.confirm-tool code {
  background: var(--bg-accent, #313244);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--accent, #cba6f7);
}

.confirm-label { font-weight: 600; }
.confirm-label-text {
  font-size: 13px;
  color: var(--text-secondary, #a6adc8);
  margin: 0;
}

.confirm-command {
  background: var(--bg-accent, #181825);
  border: 1px solid var(--border-color, #313244);
  border-radius: 8px;
  padding: 12px 16px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  color: var(--text-primary, #cdd6f4);
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
}

.confirm-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary, #a6adc8);
}
.confirm-meta code {
  background: var(--bg-accent, #313244);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color, #333346);
}

.confirm-approve {
  background: var(--accent-green, #a6e3a1) !important;
  color: #1e1e2e !important;
}
.confirm-approve:hover:not(:disabled) {
  filter: brightness(1.1);
}
/* ---- User choice modal (ask_user_choice) ---- */
.choice-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  max-height: 300px;
  overflow-y: auto;
}

.choice-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #313244);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.choice-option:hover {
  border-color: var(--accent, #cba6f7);
}
.choice-option.selected {
  border-color: var(--accent, #cba6f7);
  background: var(--bg-accent, #181825);
}
.choice-option input[type="radio"] {
  margin-top: 2px;
  accent-color: var(--accent, #cba6f7);
}
.choice-option-text {
  font-size: 13px;
  color: var(--text-primary, #cdd6f4);
  word-break: break-word;
}

.choice-custom-input {
  width: 100%;
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--bg-accent, #181825);
  border: 1px solid var(--border-color, #313244);
  border-radius: 8px;
  color: var(--text-primary, #cdd6f4);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}
.choice-custom-input:focus {
  outline: none;
  border-color: var(--accent, #cba6f7);
}

/* ---- BTW follow-up area (inside choice modal) ---- */
.choice-btw {
  margin-top: 16px;
  border-top: 1px dashed var(--border-color, #313244);
  padding-top: 12px;
}

.choice-btw-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.choice-btw-title {
  font-size: 12px;
  color: var(--text-secondary, #a6adc8);
}
.choice-countdown {
  font-size: 11px;
  color: var(--text-secondary, #a6adc8);
  font-variant-numeric: tabular-nums;
}

.choice-btw-thread {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
  margin-bottom: 10px;
}
.choice-btw-item {
  background: var(--bg-accent, #181825);
  border: 1px solid var(--border-color, #313244);
  border-radius: 8px;
  padding: 8px 10px;
}
.choice-btw-q, .choice-btw-a {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12px;
  margin: 0;
  color: var(--text-primary, #cdd6f4);
  white-space: pre-wrap;
  word-break: break-word;
}
.choice-btw-a {
  margin-top: 6px;
  color: var(--text-secondary, #a6adc8);
}
.choice-btw-pending {
  font-style: italic;
}
.choice-btw-tag {
  flex-shrink: 0;
  font-weight: 700;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-card, #1e1e2e);
  border: 1px solid var(--border-color, #313244);
  color: var(--accent, #cba6f7);
}

.choice-btw-input-row {
  display: flex;
  gap: 8px;
}
.choice-btw-input {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-accent, #181825);
  border: 1px solid var(--border-color, #313244);
  border-radius: 8px;
  color: var(--text-primary, #cdd6f4);
  font-size: 13px;
  font-family: inherit;
}
.choice-btw-input:focus {
  outline: none;
  border-color: var(--accent, #cba6f7);
}
</style>
