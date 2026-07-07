/**
 * Render a subset of Markdown to safe HTML.
 *
 * Covers the most common patterns in LLM responses:
 * headings, bold, italic, code (inline & block), links, lists, line breaks.
 *
 * Handles LLM peculiarities:
 * - LLMs sometimes emit HTML entities like &quot; instead of raw quotes.
 *   We unescape them first so the renderer sees plain characters.
 * - Code blocks (tool call JSON, shell commands, etc.) are extracted before
 *   HTML escaping so only & < > are escaped inside them, while quotes
 *   and other characters remain readable.
 *
 * This is intentionally **not** a full CommonMark parser — for that you
 * would want a library like `marked` + `DOMPurify`. The implementation
 * here is sufficient for agent chat output and avoids adding a heavy
 * dependency.
 */

export function renderMarkdown(text: string | null | undefined): string {
  if (!text) return ''

  // ── Step 0: unescape HTML entities that LLMs sometimes emit ─────────
  let raw = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x60;/g, '`')

  // ── Step 1: extract code blocks & inline code into placeholders ────
  const blocks: Array<{ lang: string; code: string }> = []
  const inlines: string[] = []
  let idx = 0

  // Code blocks: ```lang ... ```
  raw = raw.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const key = `\x00CB${idx}\x00`
    blocks.push({ lang, code: code.trim() })
    idx++
    return key
  })

  // Inline code: `...`  (skip placeholders that start with \x00)
  raw = raw.replace(/`([^`]+)`/g, (_m, code) => {
    if (code.startsWith('\x00')) return _m // already a placeholder
    const key = `\x00IC${inlines.length}\x00`
    inlines.push(code)
    return key
  })

  // ── Step 2: HTML-escape everything (placeholders are \x00 so safe) ─
  let html = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  // ── Step 3: Markdown block / inline elements ───────────────────────
  // Keep code placeholders in place while applying markdown syntax so
  // markers inside `inline code` or fenced code blocks remain literal.

  html = html.replace(/^### (.+)$/gm, '<h4 class="md-h4">$1</h4>')
  html = html.replace(/^## (.+)$/gm, '<h3 class="md-h3">$1</h3>')
  html = html.replace(/^# (.+)$/gm, '<h2 class="md-h2">$1</h2>')

  // Bold & italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Links: [text](url)
  html = html.replace(
    /\[([^\]]+)]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  )

  // Unordered lists: - item
  html = html.replace(/^(\s*)[-*]\s+(.+)$/gm, '$1<li class="md-li">$2</li>')
  // Ordered lists: 1. item
  html = html.replace(/^(\s*)\d+\.\s+(.+)$/gm, '$1<li class="md-li">$2</li>')
  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, '<ul class="md-ul">$1</ul>')
  // Remove whitespace between list item tags before converting newlines to
  // <br>; otherwise every source newline between items becomes a visual blank
  // line inside the list.
  html = html
    .replace(/<ul class="md-ul">\s+/g, '<ul class="md-ul">')
    .replace(/<\/li>\s+<li/g, '</li><li')
    .replace(/\s+<\/ul>/g, '</ul>')

  // Horizontal rules
  html = html.replace(/^---+\s*$/gm, '<hr class="md-hr" />')

  // ── Step 4: restore inline code before line-break handling ─────────
  for (let i = 0; i < inlines.length; i++) {
    const encoded = inlines[i]
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    html = html.replace(`\x00IC${i}\x00`, `<code class="md-code-inline">${encoded}</code>`)
  }

  // ── Step 5: line breaks ──────────────────────────────────────────
  html = html.replace(/\n{2,}/g, '</p><p class="md-p">')
  html = html.replace(/\n/g, '<br />')

  // ── Step 6: restore code blocks after line-break handling ─────────
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const encoded = b.code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    html = html.replace(`\x00CB${i}\x00`,
      `<pre class="md-code-block"><code${b.lang ? ` class="lang-${b.lang}"` : ''}>${encoded}</code></pre>`)
  }

  // Wrap in <p> (skip for block-level elements already wrapped)
  if (!html.startsWith('<h') && !html.startsWith('<pre') && !html.startsWith('<ul') && !html.startsWith('<hr')) {
    html = '<p class="md-p">' + html + '</p>'
  }

  return html
}

/**
 * Replace literal `\n` characters (backslash + n) in a string with actual
 * newlines. This is needed because JSON serialization often double-escapes
 * newlines in text output fields.
 */
export function fixLiteralNewlines(text: string | null | undefined): string {
  if (!text) return ''
  return text.replace(/\\n/g, '\n')
}
