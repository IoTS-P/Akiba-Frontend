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
import { modelFor } from '@/editor/monacoModels'

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

const props = defineProps<{
  modelValue: string
  language: string
  /** Stable identity of the document; two tabs with the same uri share one model. */
  uri: string
  readOnly?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [string]; save: [] }>()

const host = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let currentUri = ''

onMounted(() => {
  if (!host.value) return
  editor = monaco.editor.create(host.value, {
    value: '',
    theme: 'vs-dark',
    readOnly: props.readOnly ?? false,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    scrollBeyondLastLine: false,
  })
  // Ctrl/Cmd+S belongs to the document, not the browser.
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit('save'))
  bind(props.uri, props.language, props.modelValue)

  editor.onDidChangeModelContent(() => {
    if (editor?.getModel()?.uri.toString() === currentUri) {
      emit('update:modelValue', editor.getValue())
    }
  })
})

/** Point the one editor at the requested document. */
function bind(uri: string, language: string, initial: string) {
  if (!editor || !uri) return
  currentUri = uri
  const model = modelFor(uri, language, initial)
  if (editor.getModel() !== model) editor.setModel(model)
  if (model.getValue() !== initial) model.setValue(initial)
}

watch(() => props.uri, uri => bind(uri, props.language, props.modelValue))

// Only push text the editor did not produce itself, or the cursor jumps on every keystroke.
watch(() => props.modelValue, value => {
  const model = editor?.getModel()
  if (model && model.uri.toString() === currentUri && model.getValue() !== value) {
    model.setValue(value)
  }
})

watch(() => props.language, language => {
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
