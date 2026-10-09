/** Steamfoot SINGLE snapshots are totals; only a fallback unit price is multiplied. */
export function resolveSingleBookingTotal(input: {
  expectedAmount?: number | null;
  unitPrice?: number | null;
  people?: number | null;
}): number {
  if (input.expectedAmount != null) return input.expectedAmount;
  return (input.unitPrice ?? 799) * Math.max(1, Math.floor(input.people || 1));
}
