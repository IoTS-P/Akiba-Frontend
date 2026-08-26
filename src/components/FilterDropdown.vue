<template>
  <div ref="rootEl" class="filter-dropdown" :class="{ disabled }">
    <button
      type="button"
      class="filter-dropdown-btn"
      :disabled="disabled"
      :title="buttonLabel"
      @click="toggle"
    >
      <span v-if="buttonHasRunning" class="running-dot" aria-label="running"></span>
      <span class="filter-dropdown-btn-label">{{ buttonLabel }}</span>
      <span class="filter-dropdown-caret">{{ open ? '▴' : '▾' }}</span>
    </button>
    <ul v-if="open" class="filter-dropdown-list">
      <li
        v-if="allLabel"
        class="filter-dropdown-item"
        :class="{ selected: modelValue === null }"
        @click="choose(null)"
      >
        <span class="running-dot-slot"></span>
        <span class="filter-dropdown-item-label">{{ allLabel }}</span>
      </li>
      <li
        v-for="opt in options"
        :key="opt.value"
        class="filter-dropdown-item"
        :class="{ selected: opt.value === modelValue }"
        :title="opt.label"
        @click="choose(opt.value)"
      >
        <span class="running-dot-slot">
          <span v-if="opt.running" class="running-dot" aria-label="running"></span>
        </span>
        <span class="filter-dropdown-item-label">{{ opt.label }}</span>
        <span v-if="opt.count != null" class="filter-dropdown-item-count">{{ opt.count }}</span>
      </li>
      <li v-if="options.length === 0" class="filter-dropdown-empty">{{ emptyText }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'

/**
 * A styleable replacement for native <select> used by the Agent view's
 * session filter bar.  Native <option> elements are rendered by the
 * browser chrome and cannot carry animated icons or custom selected
 * styling, which this component provides:
 *  - a pulsing dot on options that own RUNNING sessions;
 *  - the selected option is highlighted with a soft shadow tint
 *    (instead of a check-mark).
 */
interface FilterDropdownOption {
  value: string
  label: string
  count?: number
  running?: boolean
}

const props = withDefaults(defineProps<{
  modelValue: string | null
  options: FilterDropdownOption[]
  /** Text shown on the button when nothing is selected and no allLabel is set. */
  placeholder: string
  /** When set, an extra first item with value null is rendered (e.g. "All workflows"). */
  allLabel?: string
  disabled?: boolean
  emptyText?: string
}>(), {
  allLabel: undefined,
  disabled: false,
  emptyText: 'No options'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
  (e: 'change', value: string | null): void
}>()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)

const buttonLabel = computed(() => {
  if (props.modelValue === null) return props.allLabel ?? props.placeholder
  return props.options.find(o => o.value === props.modelValue)?.label ?? props.placeholder
})

const buttonHasRunning = computed(() => {
  if (props.modelValue === null) {
    // "All …" view: light up when anything inside runs.
    return props.allLabel != null && props.options.some(o => o.running)
  }
  return props.options.find(o => o.value === props.modelValue)?.running === true
})

function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) attachOutsideListeners()
}

function choose(value: string | null) {
  close()
  if (value !== props.modelValue) {
    emit('update:modelValue', value)
    emit('change', value)
  }
}

function close() {
  open.value = false
  detachOutsideListeners()
}

function onDocClick(ev: MouseEvent) {
  if (rootEl.value && !rootEl.value.contains(ev.target as Node)) close()
}
function onDocKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') close()
}
function attachOutsideListeners() {
  document.addEventListener('mousedown', onDocClick)
  document.addEventListener('keydown', onDocKeydown)
}
function detachOutsideListeners() {
  document.removeEventListener('mousedown', onDocClick)
  document.removeEventListener('keydown', onDocKeydown)
}
onBeforeUnmount(detachOutsideListeners)
</script>

<style scoped>
.filter-dropdown {
  position: relative;
  width: 100%;
}
.filter-dropdown-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 5px;
  background: #fff;
  color: var(--text, #374151);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.filter-dropdown-btn:hover:not(:disabled) {
  border-color: var(--primary, #4f46e5);
}
.filter-dropdown-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.filter-dropdown-btn-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filter-dropdown-caret {
  flex-shrink: 0;
  color: var(--text-secondary, #6b7280);
  font-size: 10px;
}

.filter-dropdown-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 60;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: #fff;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  max-height: 260px;
  overflow-y: auto;
}
.filter-dropdown-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text, #374151);
}
.filter-dropdown-item:hover {
  background: var(--bg-secondary, #f3f4f6);
}
/* Selected marker: soft tinted shadow instead of a check-mark. */
.filter-dropdown-item.selected {
  background: #eef2ff;
  box-shadow: inset 0 0 0 1px #c7d2fe, 0 1px 3px rgba(79, 70, 229, 0.15);
  color: var(--primary, #4f46e5);
  font-weight: 500;
}
.filter-dropdown-item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filter-dropdown-item-count {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-secondary, #6b7280);
  background: var(--bg-secondary, #f3f4f6);
  border-radius: 8px;
  padding: 1px 7px;
}
.filter-dropdown-item.selected .filter-dropdown-item-count {
  background: #e0e7ff;
  color: var(--primary, #4f46e5);
}
.filter-dropdown-empty {
  padding: 10px 8px;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  text-align: center;
}

/* Pulsing "running" indicator. */
.running-dot-slot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
}
.running-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55);
  animation: running-pulse 1.6s ease-out infinite;
}
@keyframes running-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55); }
  70%  { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
  100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}
</style>
