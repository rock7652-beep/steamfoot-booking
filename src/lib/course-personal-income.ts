import type { SettlementLine } from "./course-monthly-settlement";

type Revision = { revision: number; createdAt: Date; snapshot: SettlementLine[] };

/** Whitelist output: never return personnel IDs, payment notes or other people's rows. */
export function personalIncomeView(staffId: string, live: SettlementLine[], last?: Revision) {
  if (!last) return { confirmed: false as const, pending: false, revision: null, confirmedAt: null, lines: [] };
  const own = (lines: SettlementLine[]) => lines.filter(line => line.staffId === staffId);
  const obligations = (lines: SettlementLine[]) => JSON.stringify(own(lines)
    .map(({kind,id,label,date,amount,issue}) => ({kind,id,label,date,amount,issue}))
    .sort((a,b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)));
  const current = new Map(own(live).map(line => [`${line.kind}:${line.id}`,line]));
  return {
    confirmed: true as const,
    pending: obligations(last.snapshot) !== obligations(live),
    revision: last.revision,
    confirmedAt: last.createdAt.toISOString(),
    lines: own(last.snapshot).map(line => {
      const now = current.get(`${line.kind}:${line.id}`);
      return {
        kind: line.kind, label: line.label, date: line.date, amount: line.amount,
        // Missing/reassigned live rows must not expose another person's payments.
        paid: now ? now.paid : null,
        payments: (now?.payments ?? []).map(({amount,date,voided}) => ({amount,date,voided})),
      };
    }),
  };
}
