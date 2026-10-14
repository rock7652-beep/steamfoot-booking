/** Automatic refreshes wait while a person is editing or a modal is open.
 * Explicit saves/retries still perform their authoritative reconciliation.
 */
export function backgroundRefreshAllowed() {
  if (document.visibilityState !== "visible" || !navigator.onLine) return false;
  if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return false;
  const focused = document.activeElement;
  return !(focused instanceof HTMLElement && focused.matches('input, select, textarea, [contenteditable="true"]'));
}
