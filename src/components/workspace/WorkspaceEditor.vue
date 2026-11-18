<template>
  <div ref="host" class="monaco-host"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Monaco loads its language services in workers; without this it silently degrades to plain text.
self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

const props = defineProps<{ modelValue: string; language: string; readOnly?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [string]; save: [] }>()

const host = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

onMounted(() => {
  if (!host.value) return
  editor = monaco.editor.create(host.value, {
    value: props.modelValue,
    language: props.language,
    theme: 'vs-dark',
    readOnly: props.readOnly ?? false,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    scrollBeyondLastLine: false,
  })
  editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor?.getValue() ?? '')
  })
  // Ctrl/Cmd+S belongs to the file, not the browser.
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit('save'))
})

// Only push changes the editor did not make itself, or the cursor jumps on every keystroke.
watch(() => props.modelValue, (value) => {
  if (editor && editor.getValue() !== value) editor.setValue(value)
})

watch(() => props.language, (language) => {
  const model = editor?.getModel()
  if (model) monaco.editor.setModelLanguage(model, language)
})

onBeforeUnmount(() => {
  editor?.dispose()
  editor = null
})
</script>

<style scoped>
.monaco-host {
  width: 100%;
  height: 100%;
  min-height: 200px;
}
</style>
