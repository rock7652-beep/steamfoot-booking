import { sumItemBalances } from "./item-entitlement";

/** Display projection only. Each module verifies membership, item and expiry first.
 * Balances stay on their original cards; this summary never authorizes a debit.
 */
export type BalanceUnit = "SESSION" | "POINT" | "USE";
export type ApplicableBalanceCard = {
  id: string;
  name: string;
  unit: BalanceUnit;
  remaining: number;
  held: number;
  expiresAt: string | null;
  expiryLabel?: string;
  shared: boolean;
};
export type ApplicableBalance = {
  groups: { unit: BalanceUnit; remaining: number; held: number; available: number }[];
  cards: (ApplicableBalanceCard & { available: number })[];
  pending?: boolean;
};

export function summarizeApplicableBalance(cards: ApplicableBalanceCard[]): ApplicableBalance {
  const unique = [...new Map(cards.map(card => [card.id, card])).values()];
  const rows = unique.map(card => ({
    ...card,
    remaining: Math.max(0, card.remaining),
    held: Math.max(0, card.held),
    available: Math.max(0, card.remaining - Math.max(0, card.held)),
  })).sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999") || a.id.localeCompare(b.id));
  const groups: ApplicableBalance["groups"] = sumItemBalances(rows.map(card => ({
    id:card.id,unit:card.unit,remaining:card.remaining,available:card.available,cost:1,planName:card.name,
  }))).map(group => ({unit:group.unit as BalanceUnit,remaining:group.remaining,available:group.available,
    held:rows.filter(card=>card.unit===group.unit).reduce((sum,card)=>sum+card.held,0)}));
  return { groups, cards: rows };
}
