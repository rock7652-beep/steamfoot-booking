/** Incident stop: no system-authored LINE delivery until owner approval is implemented.
 * This is deliberately not controlled by environment variables or existing toggles.
 * Resuming requires a reviewed change with owner-approved content and timing, and
 * quarantine of queued messages created before/during this pause.
 */
export function isSystemLineDeliveryPaused(): boolean {
  return true;
}
