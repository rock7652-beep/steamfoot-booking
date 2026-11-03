/** Removed Beauty features stay off even when legacy settings or snapshots are true.
 * Keep stored values and historical ledger entries for audit; do not bulk rewrite them.
 */
export const beautyRetiredSettings = Object.freeze({
  cancelDeduct: false,
  noShowDeduct: false,
});
