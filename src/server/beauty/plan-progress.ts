import 'server-only';
import type { Tx } from './booking';
import type {SessionAdjustmentRecord} from '@/lib/plan-session-adjustment';
export type BeautyProgressUsage={visits:Array<{id:string;status:string;startsAt:Date;customerId:string|null;personName:string;serviceName:string}>;adjustments:SessionAdjustmentRecord[];closes:Array<{id:string;delta:number;createdAt:Date}>};
import { beautySessionAdjustmentRecords } from './session-adjustment';
import { activeSessionAdjustments } from '@/lib/plan-session-adjustment';
import { parseTaipeiDateTime } from '@/lib/date-utils';
import { checkedPlanProgress, unavailablePlanProgress, type PlanUsageDate } from '@/lib/plan-usage-progress';

/** Caller authorizes the store, card membership and booking read permission.
 * Read in the caller's repeatable-read transaction so dates and balance agree. */
export async function beautyPlanProgress(tx: Tx, storeId: string, card: { id: string; sessions: number; remaining: number; memberIds: string[] }, visibleIds?: string[], usage?:BeautyProgressUsage) {
  if (!Number.isSafeInteger(card.sessions) || card.sessions < 1 || card.sessions > 2000) return unavailablePlanProgress();
  if (visibleIds && card.memberIds.some(id => !visibleIds.includes(id))) return unavailablePlanProgress();
  const [visits, adjustments, closes] = usage ? [usage.visits,usage.adjustments,usage.closes] : await Promise.all([
    tx.beautyAppointment.findMany({ where: { storeId, cardId: card.id, debit: true }, select: { id: true, status: true, startsAt: true, customerId: true, personName: true, serviceName: true }, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }], take: 2001 }),
    beautySessionAdjustmentRecords(tx, storeId, [card.id]),
    tx.beautyLedger.findMany({ where: { storeId, cardId: card.id, kind: 'CLOSE' }, select: { id: true, delta: true, createdAt: true } }),
  ]);
  const active = activeSessionAdjustments(adjustments);
  if (visits.length > 2000 || (visibleIds && (visits.some(r => !r.customerId || !visibleIds.includes(r.customerId)) || active.some(r => !visibleIds.includes(r.customerId)))) || active.some(r => !Number.isSafeInteger(r.quantity) || r.quantity < 1 || r.quantity > 2000) || closes.some(r => !Number.isSafeInteger(r.delta) || r.delta > 0 || r.delta < -2000)) return unavailablePlanProgress();
  if (visits.length + active.reduce((sum,r) => sum+r.quantity,0) + closes.reduce((sum,r) => sum-r.delta,0) > 2000) return unavailablePlanProgress();
  const completed: PlanUsageDate[] = visits.map(r => ({ id: r.id, date: r.startsAt.toISOString(), customerName: r.personName, courseName: r.serviceName, ...(r.status==='NO_SHOW'?{usageKind:'NO_SHOW' as const}:{}) }));
  const voided: PlanUsageDate[] = [];
  for (const row of active) {
    const date = row.operation === 'BACKFILL' ? row.occurredOn && parseTaipeiDateTime(row.occurredOn, '00:00')?.toISOString() : row.recordedAt;
    if (!date) return unavailablePlanProgress();
    for (let i = 0; i < row.quantity; i++) (row.operation === 'BACKFILL' ? completed : voided).push({ id: `${row.id}:${i}`, date, customerName: row.customerName });
  }
  for (const row of closes) for (let i = 0; i < -row.delta; i++) voided.push({ id: `${row.id}:${i}`, date: row.createdAt.toISOString() });
  return checkedPlanProgress(card.sessions, card.remaining, completed, voided);
}
