/**
 * Put text on the clipboard.
 *
 * `navigator.clipboard` only exists in a secure context, and this app is usually opened over
 * plain HTTP on a LAN address — where the API is silently missing. The old textarea trick still
 * works there, so it is the fallback rather than a comment saying "HTTPS only".
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the older path
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
