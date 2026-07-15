<!--
  SessionTreeItem — recursive list item for the left-side session list.

  Renders one session row plus, when expanded, a nested `<ul>` of its
  direct sub-agents (which themselves recurse via the same component).
  This replaces the previous single-level list and gives the user
  quick access to the agent hierarchy without opening the dedicated
  Tree modal.

  Visual design (v4):

  * The row is intentionally **minimal** at rest — just a small
    expand button, the session name, and a thin coloured left border
    that encodes the lifecycle state.  Most of the legacy second
    sub-line (status pill + timestamp + module badge + sub-agent
    badge) is hidden by default because the 244px-wide content
    column is too narrow to display all of it without truncation.

  * Detail view on hover: a sticky "hover card" is rendered at the
    BOTTOM of the parent `.session-list-content` panel (owned by
    `Agent.vue`).  Each row emits `hover` / `leave` events; the
    parent tracks the most recently hovered session and shows its
    card.  This avoids the v3 problem of absolutely-positioned
    sub-popups being clipped by the panel's `overflow-y: auto`
    scroll container, and it keeps the card width aligned with the
    panel's inner padding.

  * Lifecycle state is encoded as a colour on the row's left border,
    so even at a glance the user can scan the whole tree and spot
    which agents are running / done / errored.

  * The expand button is **always clickable** and never greyed out.
    The legacy `·` placeholder for "no sub-agents" has been removed:
    the button always shows `▸` (or `▾` when expanded), with the
    count badge attached only when children are known.  Sessions
    that haven't been expanded yet (children not fetched) look
    visually identical to those that have been expanded and found
    empty, so the UI never has to "recover" from a placeholder when
    a child later spawns.

  Design notes:

  * The expand button (`▸` / `▾`) is always rendered; the user can
    click it to fetch children on demand. After the fetch, the
    button either flips to `▾` (children found) or stays `▸` with
    no count badge (no children), so the indentation stays
    consistent across siblings.

  * A small child-count badge (`▸ 3`) is shown on the collapsed
    button so the user knows how much content is hiding without
    having to expand first.

  * All state about which sessions are expanded and what their
    children are is owned by the parent (`Agent.vue`) and passed in
    as props. This keeps the component stateless and avoids
    per-instance caches that would diverge across the tree.
-->
<template>
  <li
    :class="[
      'session-tree-item',
      { 'session-tree-item-active': isActive },
      `status-${statusKey}`,
    ]"
  >
    <div
      class="session-row"
      :style="{ paddingLeft: rowPaddingLeft }"
      @mouseenter="onHover"
      @mouseleave="onLeave"
    >
      <!--
        Status-change flash overlay.  Rendered as a separate
        absolutely-positioned layer so it can animate without
        interfering with the row's text / buttons.

        `:key="flashNonce"` is the crux: every time the parent
        detects a status change for this session it bumps the
        nonce, Vue sees a changed key, destroys the old overlay
        node, and mounts a fresh one — which restarts the CSS
        `flashStatus` animation from 0%.  Without the key change
        the class would already be present and the browser would
        NOT replay the animation on rapid successive updates.

        `v-if="flashNonce > 0"` keeps the overlay out of the DOM
        entirely on the first render (no status change yet), so
        there is no initial flash when the list first loads.
        Once a session has flashed at least once the overlay
        stays in the DOM at opacity:0 (the animation's end
        state), which is cheap and avoids mount/unmount churn.

        The `flash-${statusKey}` class picks the colour that
        matches the session's NEW status (the `session` prop is
        already updated by the time the nonce bumps), so the
        user sees the row tint in the colour it just became.
      -->
      <div
        v-if="flashNonce > 0"
        :key="flashNonce"
        class="session-flash-overlay"
        :class="`flash-${statusKey}`"
        aria-hidden="true"
      ></div>

      <!--
        Expand / collapse button.  Visual states:
          ⏳        — loading
          ▾ / ▸    — expanded / collapsed, clickable, never greyed
          ▸ N      — collapsed and known to have N children (count badge)
        The button is never `disabled` so the user can always click
        (re-clicking an empty parent re-fetches, which is useful if
        a sub-agent is in the process of spawning).
      -->
      <button
        class="session-expand-btn"
        :class="{ 'session-expand-btn-loading': loading }"
        :title="expandTitle"
        @click.stop="onToggle"
      >
        <span v-if="loading" class="session-expand-icon-loading">⏳</span>
        <template v-else>
          <span class="session-expand-icon">{{ expanded ? '▾' : '▸' }}</span>
          <span
            v-if="!expanded && childrenCount > 0"
            class="session-expand-count"
          >{{ childrenCount }}</span>
        </template>
      </button>

      <!--
        Session info (click to select, right-click for context menu).
        The `title` attribute is the always-on tooltip (status + time)
        so the user can peek at state even before they hover into
        the parent's hover card; the hover card itself is owned by
        `Agent.vue` and is rendered at the bottom of the panel.
      -->
      <div
        class="session-row-content"
        :title="rowTooltip"
        @click="onSelect"
        @contextmenu.prevent="onContext"
      >
        <div class="title">
          <span class="title-text">{{ session.sessionName || 'Untitled' }}</span>
        </div>
      </div>

      <button
        v-if="showDelete && !session.parentSessionId"
        class="del"
        title="Delete"
        @click.stop="onDelete"
      >×</button>
    </div>

    <!--
      Recursive children.  Only render the inner `<ul>` when this
      session is expanded AND we know it has at least one child.

      Children are split into two groups:
        1. "active" children (non-terminal status) — always visible
           when the parent is expanded.
        2. "closed" children (terminal status) — collapsed by default
           behind a summary row like "▾ 3 closed agents".  Clicking
           the summary toggles their visibility.

      This prevents a parent that spawned many short-lived sub-agents
      from flooding the list with dozens of closed rows.
    -->
    <ul
      v-if="expanded && childrenList.length > 0"
      class="session-children"
    >
      <SessionTreeItem
        v-for="child in activeChildren"
        :key="child.sessionId"
        :session="child"
        :depth="depth + 1"
        :active-session-id="activeSessionId"
        :expanded-ids="expandedIds"
        :children-map="childrenMap"
        :loading-ids="loadingIds"
        :flash-nonces="flashNonces"
        :show-delete="showDelete"
        @select="(id) => $emit('select', id)"
        @delete="(id) => $emit('delete', id)"
        @toggle="(id) => $emit('toggle', id)"
        @hover="(s) => $emit('hover', s)"
        @leave="(s) => $emit('leave', s)"
        @context="(e, id, name) => $emit('context', e, id, name)"
      />

      <!--
        Collapsed closed-children summary row.
        Only shown when there are closed children AND they are not
        expanded.  Clicking toggles `showClosedChildren`.
      -->
      <li
        v-if="closedChildren.length > 0 && !showClosedChildren"
        class="session-tree-item session-closed-summary"
      >
        <div
          class="session-row"
          :style="{ paddingLeft: `${(depth + 1) * 14 + 4}px` }"
          @click="showClosedChildren = true"
        >
          <span class="session-expand-icon">▸</span>
          <span class="closed-summary-text">
            {{ closedChildren.length }} closed agent{{ closedChildren.length > 1 ? 's' : '' }}
          </span>
        </div>
      </li>

      <!--
        Expanded closed children.  Includes a header row to collapse
        them back.
      -->
      <template v-if="closedChildren.length > 0 && showClosedChildren">
        <li class="session-tree-item session-closed-header">
          <div
            class="session-row"
            :style="{ paddingLeft: `${(depth + 1) * 14 + 4}px` }"
            @click="showClosedChildren = false"
          >
            <span class="session-expand-icon">▾</span>
            <span class="closed-summary-text">
              {{ closedChildren.length }} closed agent{{ closedChildren.length > 1 ? 's' : '' }}
            </span>
          </div>
        </li>
        <SessionTreeItem
          v-for="child in closedChildren"
          :key="child.sessionId"
          :session="child"
          :depth="depth + 1"
          :active-session-id="activeSessionId"
          :expanded-ids="expandedIds"
          :children-map="childrenMap"
          :loading-ids="loadingIds"
          :flash-nonces="flashNonces"
          :show-delete="showDelete"
          @select="(id) => $emit('select', id)"
          @delete="(id) => $emit('delete', id)"
          @toggle="(id) => $emit('toggle', id)"
          @hover="(s) => $emit('hover', s)"
          @leave="(s) => $emit('leave', s)"
          @context="(e, id, name) => $emit('context', e, id, name)"
        />
      </template>
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AgentSession } from '@/types'

const props = withDefaults(defineProps<{
  session: AgentSession
  /** Depth of this item in the tree (0 for top-level).  Drives indentation. */
  depth: number
  /** Currently-active session id — used for highlight + "active" styling. */
  activeSessionId: string | null
  /** Session IDs whose children should be rendered.  Owned by the parent. */
  expandedIds: Set<string>
  /** Cache: parent session id → its direct sub-agent list.  Owned by the parent. */
  childrenMap: Record<string, AgentSession[]>
  /** Session IDs whose children are currently being fetched.  Owned by the parent. */
  loadingIds: Set<string>
  /**
   * Per-session "flash nonce" map — bumped by the parent every
   * time a status change is detected.  The row binds this value
   * (looked up by `session.sessionId`) as `:key` on the flash
   * overlay element so each bump recreates the node and restarts
   * the CSS colour-flash animation.  See `markSessionStatusChanged`
   * in `Agent.vue`.
   */
  flashNonces: Record<string, number>
  /** Whether to show the per-row delete button.  Default true. */
  showDelete?: boolean
}>(), {
  showDelete: true,
})

const emit = defineEmits<{
  (e: 'select', sessionId: string): void
  (e: 'delete', sessionId: string): void
  (e: 'toggle', sessionId: string): void
  (e: 'context', event: MouseEvent, sessionId: string, name: string): void
  /**
   * Emitted when the pointer enters the row.  `Agent.vue` uses
   * this to populate the bottom-of-panel hover card.  The
   * emitted value is the full `AgentSession` row so the parent
   * does not have to look it up.
   */
  (e: 'hover', session: AgentSession): void
  /**
   * Emitted when the pointer leaves the row.  The parent clears
   * the hover card if the leaving session is still the most
   * recently hovered one (so the card doesn't flicker as the
   * user moves between rows).
   */
  (e: 'leave', session: AgentSession): void
}>()

// ---- Derived state ------------------------------------------------------

const isActive = computed(() => props.session.sessionId === props.activeSessionId)
const expanded = computed(() => props.expandedIds.has(props.session.sessionId))
const loading = computed(() => props.loadingIds.has(props.session.sessionId))
const childrenList = computed<AgentSession[]>(
  () => props.childrenMap[props.session.sessionId] || [],
)
const childrenCount = computed(() => childrenList.value.length)

/**
 * Split children into "active" (non-terminal) and "closed" (terminal)
 * groups.  Active children are always shown when the parent is expanded;
 * closed children are collapsed behind a summary row by default so a
 * parent that spawned many short-lived sub-agents doesn't flood the list.
 *
 * The split is purely visual — both groups come from the same cached
 * children list and no data is lost.
 */
function isTerminalStatus(s: string | null | undefined): boolean {
  if (s == null) return false
  return s === 'closed' || s === 'error' ||
      s === 'completed' || s === 'cancelled' || s === 'failed'
}

const activeChildren = computed(() =>
  childrenList.value.filter(c => !isTerminalStatus(c.status))
)
const closedChildren = computed(() =>
  childrenList.value.filter(c => isTerminalStatus(c.status))
)

/** Toggle for the collapsed closed-children section.  Local per-item
 *  state — resets when the component is destroyed (e.g. parent
 *  collapsed and re-expanded). */
const showClosedChildren = ref(false)

const expandTitle = computed(() => {
  if (loading.value) return 'Loading sub-agents…'
  if (expanded.value) return 'Collapse sub-agents'
  return 'Expand sub-agents'
})

/** Per-depth padding for the row.  4px base + 14px per level keeps
 *  the tree visually compact while still showing the hierarchy. */
const rowPaddingLeft = computed(() => `${props.depth * 14 + 4}px`)

// ---- Status helpers (local copies; same semantics as Agent.vue) -------

/**
 * Lowercased status key used as a CSS class (`.status-running`,
 * `.status-completed`, etc.).  Collapses the legacy aliases
 * (`active`/`suspended` → their canonical counterparts) so the CSS
 * colour palette stays small and intentional.
 */
const statusKey = computed(() => {
  const s = (props.session.status ?? '').toLowerCase()
  switch (s) {
    case 'active':      return 'running'
    case 'suspended':   return 'standby'
    default:            return s || 'unknown'
  }
})

/**
 * This session's current flash nonce (0 when it has never
 * changed).  Used both as the overlay's `v-if` gate and as its
 * `:key` — see the overlay comment in the template above.
 */
const flashNonce = computed(() => props.flashNonces[props.session.sessionId] || 0)

function statusLabelFor(status: string | null | undefined): string {
  if (!status) return 'Unknown'
  const s = status.toLowerCase()
  switch (s) {
    case 'running': return 'Running'
    case 'standby': return 'Standby'
    case 'msghandle': return 'Handling mail'
    case 'paused': return 'Paused'
    case 'cancelling': return 'Cancelling…'
    case 'active': return 'Active'
    case 'suspended': return 'Standby'
    case 'closed': return 'Closed'
    case 'completed': return 'Completed'
    case 'cancelled': return 'Cancelled'
    case 'failed': return 'Failed'
    case 'error': return 'Error'
    default: return s.charAt(0).toUpperCase() + s.slice(1)
  }
}

function formatDate(date: string | null | undefined) {
  if (!date) return ''
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

/**
 * Native tooltip shown on the name itself.  Always-on, lightweight,
 * and gives the user the most useful pieces of information at a glance
 * (status, when it last moved, and the full agent UUID so the user can
 * copy it for support / scripting) even when the panel hover card is
 * not in play (e.g. on touch / keyboard focus).
 */
const rowTooltip = computed(() => {
  const parts: string[] = []
  parts.push(`Status: ${statusLabelFor(props.session.status)}`)
  const ts = formatDate(props.session.updatedAt || props.session.createdAt)
  if (ts) parts.push(`Last update: ${ts}`)
  parts.push(`UUID: ${props.session.sessionId}`)
  if (props.session.parentSessionId) parts.push('Sub-agent')
  if (props.session.moduleName && props.session.moduleName !== 'chat') {
    parts.push(`Module: ${props.session.moduleName}`)
  }
  return parts.join('\n')
})

// ---- Event forwarding --------------------------------------------------

function onSelect() {
  emit('select', props.session.sessionId)
}

function onDelete() {
  emit('delete', props.session.sessionId)
}

/**
 * Click on the expand button.
 *
 *  * Collapsed + children not yet cached → emit `toggle` (parent
 *    will lazy-fetch and then expand).
 *  * Collapsed + children already cached → emit `toggle` (parent
 *    just flips expanded state; even an empty cached list expands
 *    to "no children", which is a no-op visually but still lets
 *    the user click without surprise).
 *  * Expanded → emit `toggle` (parent collapses).
 *
 *  The button is *always* clickable (never `disabled`) so the user
 *  can re-click an empty parent to retry the fetch, which is
 *  useful while a sub-agent is spawning.
 */
function onToggle() {
  if (loading.value) return
  emit('toggle', props.session.sessionId)
}

function onContext(e: MouseEvent) {
  emit('context', e, props.session.sessionId, props.session.sessionName || '')
}

function onHover() {
  emit('hover', props.session)
}

function onLeave() {
  emit('leave', props.session)
}
</script>

<style scoped>
.session-tree-item {
  list-style: none;
  margin: 0;
  padding: 0;
}

/*
  Row is a horizontal flex of: [expand] [content] [delete?].
  `min-height` keeps the row from collapsing too much.
*/
.session-row {
  display: flex;
  align-items: center;
  position: relative;
  /* padding-left is set inline per depth */
  padding-top: 5px;
  padding-bottom: 5px;
  padding-right: 8px;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 1px;
  /* 3px solid transparent reserve space for the state rail, so the
     row width does NOT shift when the rail becomes visible. */
  border-left: 3px solid transparent;
  min-height: 26px;
  transition: background 0.1s;
}
.session-row:hover {
  background: #fafafa;
}
.session-tree-item-active > .session-row {
  background: #fff5f7;
}

/*
  State rail — the left border colour encodes the lifecycle.
  The class list is `status-{key}` where `key` is one of
  `running | standby | msghandle | cancelling | closed |
  completed | cancelled | failed | error | unknown`.
  The palette is chosen to be:
    * running / msghandle: blue / purple → "doing work"
    * standby:             gray          → "parked"
    * cancelling:          orange        → "in-progress cancel"
    * closed / completed:  green         → "happy ending"
    * cancelled:           yellow        → "user-cancelled, not an error"
    * failed / error:      red           → "broken"
*/
.status-running > .session-row    { border-left-color: #1976d2; }
.status-msghandle > .session-row  { border-left-color: #7b1fa2; }
.status-paused > .session-row     { border-left-color: #ff9800; }
.status-standby > .session-row    { border-left-color: #9e9e9e; }
.status-cancelling > .session-row { border-left-color: #ff9800; }
.status-closed > .session-row     { border-left-color: #4caf50; }
.status-completed > .session-row  { border-left-color: #4caf50; }
.status-cancelled > .session-row  { border-left-color: #fbc02d; }
.status-failed > .session-row     { border-left-color: #f44336; }
.status-error > .session-row      { border-left-color: #f44336; }
.status-unknown > .session-row    { border-left-color: #d0d0d0; }

/*
  Status-change flash overlay.

  When the parent bumps this session's flash nonce (because
  `mergeSession` detected a status change), Vue recreates the
  overlay node (its `:key` changed) and the animation below
  runs once from 0% to 100%:

    0%   — the row background is tinted at ~45% opacity in the
           session's NEW status colour (so a transition into
           "error" flashes red, into "closed" flashes green,
           etc.).  The user instantly sees "something changed
           here" and in which direction.
    100% — the tint has faded back to fully transparent,
           revealing the row's normal background (white / hover
           grey / active pink) underneath.

  `pointer-events: none` keeps the overlay from swallowing
  clicks — the row's buttons and selection handler stay fully
  interactive even mid-flash.

  The palette mirrors the left-border state rail above so the
  flash colour is consistent with the persistent indicator.
*/
.session-flash-overlay {
  position: absolute;
  inset: 0;
  border-radius: 4px;
  pointer-events: none;
  z-index: 0;
  animation: flashStatus 1.4s ease-out forwards;
}

/*
  Lift all non-overlay row children above the flash layer so the
  tint never obscures the expand button, the session name, or the
  delete button.  A single `:not()` selector keeps this resilient
  to future additions without touching each child's own rule.
*/
.session-row > :not(.session-flash-overlay) {
  position: relative;
  z-index: 1;
}
@keyframes flashStatus {
  0%   { opacity: 0.45; }
  35%  { opacity: 0.30; }
  100% { opacity: 0; }
}
.flash-running    { background: #1976d2; }
.flash-msghandle  { background: #7b1fa2; }
.flash-paused     { background: #ff9800; }
.flash-standby    { background: #9e9e9e; }
.flash-cancelling { background: #ff9800; }
.flash-closed     { background: #4caf50; }
.flash-completed  { background: #4caf50; }
.flash-cancelled  { background: #fbc02d; }
.flash-failed     { background: #f44336; }
.flash-error      { background: #f44336; }
.flash-unknown    { background: #d0d0d0; }

/*
  Expand / collapse button.
  Width is fixed so the row content aligns across siblings
  regardless of expand state.  The button is never disabled and
  never greyed out: this is intentional so the affordance stays
  consistent across rows with and without sub-agents.
*/
.session-expand-btn {
  flex-shrink: 0;
  width: 26px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: none;
  border: none;
  cursor: pointer;
  color: #888;
  font-size: 11px;
  padding: 0;
  margin-right: 2px;
  border-radius: 3px;
  transition: background 0.1s, color 0.1s;
}
.session-expand-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #222;
}
.session-expand-btn-loading {
  cursor: wait;
}
.session-expand-icon {
  font-size: 11px;
  line-height: 1;
}
.session-expand-icon-loading {
  font-size: 10px;
  display: inline-block;
  animation: sessionExpandSpin 1s linear infinite;
}
@keyframes sessionExpandSpin {
  to { transform: rotate(360deg); }
}
.session-expand-count {
  display: inline-block;
  font-size: 9px;
  font-weight: 600;
  color: #1976d2;
  background: #e3f2fd;
  border-radius: 7px;
  padding: 0 4px;
  min-width: 12px;
  text-align: center;
  line-height: 1.4;
}

/*
  Content area: takes the remaining width.  `min-width: 0` lets
  the inner `title-text` ellipsise inside the flex parent.  We also
  shift the right padding to 18px so the absolute delete button has
  room without overlapping the name.
*/
.session-row-content {
  flex: 1;
  min-width: 0;
  position: relative;
  padding-right: 18px;
}

.title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}
.title-text {
  /* truncate inline */
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex-shrink: 1;
}

.del {
  position: absolute;
  top: 4px;
  right: 4px;
  background: transparent;
  border: none;
  color: #aaa;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s, background 0.1s;
}
.session-row:hover .del,
.session-tree-item-active > .session-row .del {
  opacity: 1;
}
.del:hover { color: #fff; background: #e94560; }

/* Recursive children container.  No additional padding-left — the
   child's own inline padding-left accounts for its depth.  We do
   add a small top margin for spacing between parent and children. */
.session-children {
  list-style: none;
  margin: 1px 0 2px 0;
  padding: 0;
}

/* Collapsed closed-children summary / header rows.  These look like
   thin, muted rows that invite a click to expand/collapse the group
   of finished sub-agents. */
.session-closed-summary,
.session-closed-header {
  list-style: none;
  margin: 0;
  padding: 0;
}
.session-closed-summary > .session-row,
.session-closed-header > .session-row {
  cursor: pointer;
  min-height: 22px;
  padding-top: 2px;
  padding-bottom: 2px;
}
.session-closed-summary > .session-row:hover,
.session-closed-header > .session-row:hover {
  background: #f5f5f5;
}
.closed-summary-text {
  font-size: 11px;
  color: #999;
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.session-closed-summary .session-expand-icon,
.session-closed-header .session-expand-icon {
  font-size: 10px;
  color: #aaa;
  margin-right: 4px;
  width: 14px;
  display: inline-block;
  text-align: center;
  flex-shrink: 0;
}
</style>
