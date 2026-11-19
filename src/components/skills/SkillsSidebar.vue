<template>
  <div class="sidebar-split">
    <div class="split-top">
      <div class="search-row">
        <input v-model="query" type="search" placeholder="Search skills…" aria-label="Search skills" />
      </div>
      <div class="list" @contextmenu.self.prevent="blankMenu($event)">
        <div v-if="!skills.length" class="hint">No skills installed.</div>
        <div
          v-for="s in visible"
          :key="s.id"
          class="row"
          :class="{ active: s.id === selected }"
          :title="s.description || s.id"
          @click="selected = s.id"
          @contextmenu.prevent="menu($event, s.id)"
        >
          <span class="name">{{ s.id }}</span>
        </div>
      </div>
    </div>

    <div
      v-if="ctx.show"
      class="ctx"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
      @click.self="ctx.show = false"
    >
      <template v-if="ctx.skill">
        <div class="ctx-item danger" @click="remove">Delete skill</div>
      </template>
      <template v-else>
        <div class="ctx-item" @click="install">Install skill from .zip…</div>
      </template>
    </div>

    <WorkspacePanel
      v-if="selected"
      :key="selected"
      class="split-bottom"
      :scope="{ kind: 'skill', name: selected }"
      @open-file="$emit('openFile', selected, $event)"
      @close="selected = ''"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import WorkspacePanel from '@/components/workspace/WorkspacePanel.vue'
import { skillApi, type SkillInfo } from '@/services/api'

defineEmits<{ openFile: [skill: string, path: string] }>()

const skills = ref<SkillInfo[]>([])
const ctx = reactive({ show: false, x: 0, y: 0, skill: '' })

function menu(ev: MouseEvent, id: string) {
  ctx.show = true
  ctx.x = ev.clientX
  ctx.y = ev.clientY
  ctx.skill = id
}

function blankMenu(ev: MouseEvent) {
  ctx.show = true
  ctx.x = ev.clientX
  ctx.y = ev.clientY
  ctx.skill = ''
}

function closeMenu() {
  ctx.show = false
}

async function reload() {
  const { data } = await skillApi.list()
  skills.value = data.skills ?? []
}

async function remove() {
  const id = ctx.skill
  ctx.show = false
  if (!window.confirm(`Delete skill ${id}? Its files are deleted with it.`)) return
  try {
    await skillApi.delete(id)
    if (selected.value === id) selected.value = ''
    await reload()
  } catch {
    // Leave the list as it is when the delete did not happen.
  }
}

function install() {
  ctx.show = false
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.zip'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append('file', file, file.name)
    try {
      await skillApi.upload(form)
      await reload()
    } catch {
      // Nothing changed if the upload was refused.
    }
  }
  input.click()
}
const query = ref('')
const selected = ref('')

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? skills.value.filter((s: SkillInfo) => s.id.toLowerCase().includes(q)) : skills.value
})

onMounted(async () => {
  try {
    await reload()
  } catch {
    skills.value = []
  }
  window.addEventListener('click', closeMenu)
})
onUnmounted(() => window.removeEventListener('click', closeMenu))
</script>

<style scoped>
.sidebar-split {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.split-top {
  flex: 1 1 45%;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.split-bottom {
  flex: 1 1 55%;
  min-height: 140px;
}

.search-row {
  padding: 0 10px 8px;
}

.search-row input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  font-size: 12px;
}

.list {
  flex: 1;
  overflow: auto;
}

.row {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--akiba-chat-text-muted);
  cursor: pointer;
}

.row:hover {
  background: var(--akiba-chat-hover);
  color: var(--vscode-editor-foreground);
}

.row.active {
  background: color-mix(in srgb, var(--vscode-focusBorder) 18%, transparent);
  color: var(--vscode-editor-foreground);
}

.name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctx {
  position: fixed;
  z-index: 60;
  padding: 4px 0;
  min-width: 190px;
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: var(--akiba-radius-sm);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  font-size: 12px;
  color: var(--vscode-editor-foreground);
}

.ctx-item {
  padding: 5px 12px;
  cursor: pointer;
}

.ctx-item:hover {
  background: var(--vscode-focusBorder);
  color: #fff;
}

.ctx-item.danger:hover {
  background: var(--akiba-danger);
}

.hint {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--akiba-chat-text-faint);
}
</style>
