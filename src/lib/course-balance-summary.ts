export type CourseBalanceTotal = { unit: string; count: number; remaining: number; held: number; available: number };

/** Shared cards are one balance, regardless of the number of members. */
export function courseBalanceTotals(cards: Array<{ id: string; unit: string; remaining: number; held: number; available: number; expired: boolean; closed: boolean }>): CourseBalanceTotal[] {
  const seen = new Set<string>();
  const totals = new Map<string, CourseBalanceTotal>();
  for (const card of cards) {
    if (card.expired || card.closed || seen.has(card.id)) continue;
    seen.add(card.id);
    const total = totals.get(card.unit) ?? { unit: card.unit, count: 0, remaining: 0, held: 0, available: 0 };
    total.count++; total.remaining += card.remaining; total.held += card.held; total.available += card.available;
    totals.set(card.unit, total);
  }
  return [...totals.values()];
}

export function courseBalanceText(totals: CourseBalanceTotal[]): string {
  return totals.map(total => `總剩餘 ${total.remaining} ${total.unit === "SESSION" ? "堂" : "點"} · 已預約 ${total.held} · 可用 ${total.available}`).join("；") || "目前沒有有效方案";
}
