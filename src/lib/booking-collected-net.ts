/** Legacy refunds track refundAmount; v2 tracks linked negative receipts.
 * These can describe the same refund, so subtract the larger total once.
 */
export function bookingCollectedNet(amount: unknown, refundAmount?: unknown, refunds?: Array<{ amount: unknown }>) {
  const received = Number(amount) || 0;
  const legacyRefunded = Number(refundAmount) || 0;
  const linkedRefunded = (refunds ?? []).reduce((sum, refund) => sum + Math.max(0, -(Number(refund.amount) || 0)), 0);
  return Math.max(0, received - Math.max(legacyRefunded, linkedRefunded));
}
