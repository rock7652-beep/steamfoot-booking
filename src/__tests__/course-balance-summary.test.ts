import { expect, it } from "vitest";
import { courseBalanceTotals, courseBalanceText } from "@/lib/course-balance-summary";

const card = (id: string, unit = "POINT") => ({ id, unit, remaining: 10, held: 2, available: 8, expired: false, closed: false });

it("totals all valid plans separately by unit, without duplicating shared cards or expired balances", () => {
  const cards = Array.from({length:21},(_,i)=>card(String(i)));
  const totals = courseBalanceTotals([...cards, cards[0], card("lessons","SESSION"), {...card("old"),expired:true}, {...card("closed"),closed:true}]);
  expect(totals).toEqual([{unit:"POINT",count:21,remaining:210,held:42,available:168},{unit:"SESSION",count:1,remaining:10,held:2,available:8}]);
  expect(courseBalanceText(totals)).toBe("總剩餘 210 點 · 已預約 42 · 可用 168；總剩餘 10 堂 · 已預約 2 · 可用 8");
});

it("retains fully reserved and used-up active plans and explains empty totals", () => {
  expect(courseBalanceTotals([{...card("full"),held:10,available:0},{...card("empty"),remaining:0,held:0,available:0}])).toEqual([{unit:"POINT",count:2,remaining:10,held:10,available:0}]);
  expect(courseBalanceText([])).toBe("目前沒有有效方案");
});
