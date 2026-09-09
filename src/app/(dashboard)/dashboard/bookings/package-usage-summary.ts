/** Display-only summary. Mirrors completion's legacy/makeup split, never changes settlement. */
export function packageUsageSummary(booking: {
  people: number;
  isMakeup: boolean;
  customerPlanWallet: unknown;
  makeupCreditLinks: { makeupCreditId: string }[];
  walletSessions: { status: string }[];
}): string {
  const people = booking.people;
  const linkedMakeups = booking.makeupCreditLinks.length;
  if (!Number.isInteger(people) || people < 1 || linkedMakeups > people) {
    return "資料不一致，請先核對";
  }
  const makeupCount = booking.isMakeup && linkedMakeups === 0 && !booking.customerPlanWallet
    ? people : linkedMakeups;
  const walletCount = people - makeupCount;
  const reservedCount = booking.walletSessions.filter((s) => s.status === "RESERVED").length;
  if ((walletCount > 0 && !booking.customerPlanWallet) ||
      (reservedCount > 0 && reservedCount !== walletCount)) {
    return "方案或保留堂數不一致，請先核對";
  }
  return [
    walletCount > 0 ? `方案 ${walletCount} 堂` : "",
    makeupCount > 0 ? `補課資格 ${makeupCount} 次` : "",
  ].filter(Boolean).join("＋");
}
