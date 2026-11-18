import * as monaco from 'monaco-editor'

/**
 * One model per document, shared by whichever editor is showing it.
 *
 * A Monaco editor is heavy: its own DOM, layout observers, tokenizer state and language worker
 * session. A model is just text plus undo history. Tabs therefore swap models instead of
 * building a new editor each, which is what makes switching instant.
 */
const models = new Map<string, monaco.editor.ITextModel>()

export function modelFor(
  uri: string,
  language: string,
  initial: string,
): { model: monaco.editor.ITextModel; created: boolean } {
  const existing = models.get(uri)
  if (existing && !existing.isDisposed()) {
    monaco.editor.setModelLanguage(existing, language)
    return { model: existing, created: false }
  }
  const model = monaco.editor.createModel(initial, language, monaco.Uri.parse(uri))
  models.set(uri, model)
  return { model, created: true }
}

/** The text currently held for [uri], including changes not yet saved. */
export function textOf(uri: string): string | null {
  const model = models.get(uri)
  return model && !model.isDisposed() ? model.getValue() : null
}

/** Forget a document: the text is already saved or the tab is gone for good. */
export function disposeModel(uri: string) {
  const model = models.get(uri)
  if (model && !model.isDisposed()) model.dispose()
  models.delete(uri)
}
