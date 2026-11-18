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

/**
 * One editor, one document at a time, text swapped in place.
 *
 * There is deliberately no model registry. Sharing models between views caused two bugs that
 * looked unrelated — a document showing another's text, and Monaco throwing `Canceled` while a
 * model was disposed under a switching editor — and both vanish when the editor owns exactly one
 * model for its whole life. The cost is the undo history across a tab switch, which is a fair
 * trade for not losing text.
 */
const props = withDefaults(defineProps<{
  modelValue?: string
  language: string
  /** Identity of the document; switching it replaces the text. */
  uri: string
  readOnly?: boolean
}>(), { modelValue: '', readOnly: false })

const emit = defineEmits<{ 'update:modelValue': [string]; save: [] }>()

const host = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let suppress = false
let pendingText: string | null = null

onMounted(() => {
  if (!host.value) return
  editor = monaco.editor.create(host.value, {
    value: props.modelValue || '',
    language: props.language,
    theme: 'vs-dark',
    readOnly: props.readOnly,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    scrollBeyondLastLine: false,
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit('save'))
  editor.onDidChangeModelContent(() => {
    if (suppress) return
    emit('update:modelValue', editor?.getValue() ?? '')
  })
  if (pendingText !== null) {
    writeText(pendingText)
    pendingText = null
  }
})

/** Put text on screen without reporting it as an edit. */
function writeText(text: string) {
  const model = editor?.getModel()
  if (!model) {
    pendingText = text
    return
  }
  if (model.getValue() === text) return
  suppress = true
  model.setValue(text)
  suppress = false
}

/** Called by the owner once a document's text has been fetched. */
function setText(text: string) {
  writeText(text)
}

defineExpose({ setText })

watch(() => props.uri, () => writeText(props.modelValue))

// External writes only apply when they differ; the editor is the source of truth while focused.
watch(() => props.modelValue, value => {
  if (!editor || editor.getValue() === value) return
  writeText(value)
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
