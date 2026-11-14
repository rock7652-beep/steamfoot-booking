import { checkedPlanProgress, unavailablePlanProgress, type PlanUsageDate } from './plan-usage-progress';
type Session = { id: string; status: string; completedAt: Date | null; voidedAt: Date | null; booking: { bookingDate: Date; bookingStatus?: string } | null };
/** Steam's per-session ledger is authoritative, including manual backfills and voids. */
export function walletPlanProgress(wallet: { totalSessions: number; remainingSessions: number; sessions: Session[] }) {
  if (wallet.sessions.length !== wallet.totalSessions) return unavailablePlanProgress();
  const completed: PlanUsageDate[] = [], voided: PlanUsageDate[] = [];
  for (const row of wallet.sessions) {
    const used = row.status === 'COMPLETED' || row.status === 'BACKFILLED';
    const date = row.status === 'VOIDED' ? row.voidedAt : row.status === 'BACKFILLED' ? row.completedAt : row.booking?.bookingDate ?? row.completedAt;
    if ((used || row.status === 'VOIDED') && (!date || !Number.isFinite(date.getTime()))) return unavailablePlanProgress();
    if (used || row.status === 'VOIDED') (used ? completed : voided).push({ id: row.id, date: date!.toISOString(), ...(used&&row.status==='COMPLETED'&&row.booking?.bookingStatus==='NO_SHOW'?{usageKind:'NO_SHOW' as const}:{}) });
    else if (row.status !== 'AVAILABLE' && row.status !== 'RESERVED') return unavailablePlanProgress();
  }
  return checkedPlanProgress(wallet.totalSessions, wallet.remainingSessions, completed, voided);
}
