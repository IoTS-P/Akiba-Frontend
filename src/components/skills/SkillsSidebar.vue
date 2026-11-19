<template>
  <div class="sidebar-split">
    <div class="split-top">
      <div class="search-row">
        <input v-model="query" type="search" placeholder="Search skills…" aria-label="Search skills" />
      </div>
      <div class="list">
        <div v-if="!skills.length" class="hint">No skills installed.</div>
        <div
          v-for="s in visible"
          :key="s.id"
          class="row"
          :class="{ active: s.id === selected }"
          :title="s.description || s.id"
          @click="selected = s.id"
        >
          <span class="name">{{ s.id }}</span>
        </div>
      </div>
    </div>

    <WorkspacePanel
      v-if="selected"
      class="split-bottom"
      :scope="{ kind: 'skill', name: selected }"
      @open-file="$emit('openFile', selected, $event)"
      @close="selected = ''"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import WorkspacePanel from '@/components/workspace/WorkspacePanel.vue'
import { skillApi, type SkillInfo } from '@/services/api'

defineEmits<{ openFile: [skill: string, path: string] }>()

const skills = ref<SkillInfo[]>([])
const query = ref('')
const selected = ref('')

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? skills.value.filter((s: SkillInfo) => s.id.toLowerCase().includes(q)) : skills.value
})

onMounted(async () => {
  try {
    const { data } = await skillApi.list()
    skills.value = data.skills ?? []
  } catch {
    skills.value = []
  }
})
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

.hint {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--akiba-chat-text-faint);
}
</style>
