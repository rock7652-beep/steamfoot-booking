import { dayRange, toLocalDateStr } from "./date-utils";
import { fixedCourseFee } from "./course-fee-payment";
import type { CourseAnalysisRange } from "./course-analytics";
export type BusinessScope = { view: "store" | "manager" | "coach"; person: string };
export type BusinessPerson = { id: string; name: string; managerId: string | null };
export type BusinessPurchase = { id: string; customerId: string; confirmedAt: Date; price: number; revenueStaffId: string | null; developerProfitSnapshot: number | null; refunds: { amount: number; createdAt: Date }[] };
export type BusinessSession = { id: string; coachId: string; startsAt: Date; endsAt: Date; bookings: { customerId: string; customerName: string; bookingKind: string; status: string }[] };
export function resolveBusinessScope(params: { perspective?: string; person?: string }, all: boolean, staffId?: string | null): BusinessScope {
  if (params.perspective && !["store", "manager", "coach"].includes(params.perspective)) throw new Error("分析對象不正確");
  const view = (params.perspective ?? (all ? "store" : "manager")) as BusinessScope["view"];
  if (!all && (!staffId || view === "store" || (params.person && params.person !== staffId))) throw new Error("無權查看此分析對象");
  return { view, person: view === "store" ? "all" : params.person || (all ? "all" : staffId!) };
}
export function summarizeCourseBusiness(input: { customers: BusinessPerson[]; sessions: BusinessSession[]; purchases: BusinessPurchase[]; fees: { sessionId: string; staffId: string; rule: unknown }[]; range: CourseAnalysisRange; scope: BusinessScope; now?: Date }) {
  const { customers, sessions, purchases, fees, range, scope } = input;
  const now = input.now ?? new Date();
  const start = dayRange(range.startDate).start, end = new Date(Math.min(dayRange(range.endDate).end.getTime(), now.getTime()));
  const inRange = (d: Date) => d >= start && d <= end;
  const people = new Map(customers.map(c => [c.id, c]));
  const matches = (id: string | null) => scope.person === "all" || (id ?? "unassigned") === scope.person;
  const customerMatches = (id: string) => scope.view !== "manager" || matches(people.get(id)?.managerId ?? null);
  const relevantSessions = sessions.filter(s => scope.view !== "coach" || matches(s.coachId));
  const attended = relevantSessions.flatMap(s => s.bookings.filter(b => b.status === "ATTENDED" && customerMatches(b.customerId)).map(b => ({ ...b, date: s.startsAt, coachId: s.coachId, sessionId: s.id })));
  const allTrials = sessions.flatMap(s => s.bookings.filter(b => b.status === "ATTENDED" && b.bookingKind === "TRIAL").map(b => ({ ...b, date: s.startsAt, coachId: s.coachId, sessionId: s.id }))).filter(t => t.date <= end);
  // An original paid purchase remains first even if refunded later; fully refunded by cutoff does not count as a sale.
  const ordered = purchases.filter(p => p.price > 0 && p.confirmedAt <= end).sort((a,b) => +a.confirmedAt - +b.confirmedAt || a.id.localeCompare(b.id));
  const first = new Map<string, BusinessPurchase>();
  for (const p of ordered) if (!first.has(p.customerId)) first.set(p.customerId, p);
  const net = (p: BusinessPurchase) => p.price - p.refunds.filter(r => r.createdAt <= end).reduce((sum,r) => sum + r.amount,0);
  const creditedTrial = (p: BusinessPurchase) => allTrials.filter(t => t.customerId === p.customerId && t.date <= p.confirmedAt).sort((a,b) => +b.date - +a.date || a.sessionId.localeCompare(b.sessionId))[0];
  const purchaseMatches = (p: BusinessPurchase) => scope.view === "store" || (scope.view === "manager" ? matches(p.revenueStaffId) : !!creditedTrial(p) && matches(creditedTrial(p)!.coachId));
  const sales = ordered.filter(p => inRange(p.confirmedAt) && net(p) > 0 && purchaseMatches(p));
  const newSales = sales.filter(p => first.get(p.customerId)?.id === p.id);
  const renewalSales = sales.filter(p => first.get(p.customerId)?.id !== p.id);
  // Conversion denominator contains only attended trial customers with no paid plan before this trial.
  const periodTrials = attended.filter(t => t.bookingKind === "TRIAL" && inRange(t.date));
  const eligibleTrials = periodTrials.filter(t => !first.has(t.customerId) || first.get(t.customerId)!.confirmedAt >= t.date);
  const trialIds = [...new Set(eligibleTrials.map(t => t.customerId))];
  const converted = trialIds.filter(id => { const p = first.get(id); return p && net(p) > 0 && inRange(p.confirmedAt) && (scope.view !== "coach" || matches(creditedTrial(p)?.coachId ?? null)); });
  const tracked = newSales.filter(p => {const t = creditedTrial(p); return t && t.date < start;});
  const visitors = [...new Set(attended.filter(t => inRange(t.date)).map(t => t.customerId))];
  const classes = relevantSessions.filter(s => inRange(s.startsAt) && s.endsAt <= now && s.bookings.some(b => b.status === "ATTENDED" && customerMatches(b.customerId)));
  const feeMap = new Map(fees.map(f => [f.sessionId, f]));
  const feeValues = classes.map(s => {const f = feeMap.get(s.id); return f && f.staffId === s.coachId ? fixedCourseFee(f.rule) : null;});
  const names = new Map([...people.values()].map(c => [c.id,c.name]));
  for (const t of attended) if (!names.has(t.customerId)) names.set(t.customerId,t.customerName);
  const list = (ids: string[]) => [...new Set(ids)].map(id => ({id,name:names.get(id) ?? "歷史顧客"}));
  const trend = [...new Set([...periodTrials.map(t => toLocalDateStr(t.date)), ...sales.map(p => toLocalDateStr(p.confirmedAt))])].sort().map(date => ({ date, trial: new Set(periodTrials.filter(t => toLocalDateStr(t.date) === date).map(t => t.customerId)).size, newCard: newSales.filter(p => toLocalDateStr(p.confirmedAt) === date).length, renewal: renewalSales.filter(p => toLocalDateStr(p.confirmedAt) === date).length }));
  return { trial: list(attended.filter(t => t.bookingKind === "TRIAL" && inRange(t.date)).map(t => t.customerId)), eligibleTrials: trialIds.length, newCard: list(newSales.map(p => p.customerId)), renewal: list(renewalSales.map(p => p.customerId)), converted: list(converted), unconverted: list(trialIds.filter(id => !converted.includes(id))), tracked: list(tracked.map(p => p.customerId)), visitors: list(visitors), conversionRate: trialIds.length ? converted.length / trialIds.length * 100 : null, sessions: classes.length, hours: classes.reduce((n,s) => n + (+s.endsAt - +s.startsAt) / 3600000,0), attendance: attended.filter(t => inRange(t.date)).length, fee: feeValues.reduce<number>((n,v) => n + (v ?? 0),0), missingFees: feeValues.filter(v => v === null).length, profit: sales.filter(p => p.developerProfitSnapshot !== null && net(p) === p.price).reduce((n,p) => n + p.developerProfitSnapshot!,0), missingProfit: sales.filter(p => p.developerProfitSnapshot === null || net(p) !== p.price).length, trend };
}
