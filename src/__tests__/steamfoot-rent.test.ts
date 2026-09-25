import { describe, it, expect } from "vitest";
import { rentInput, rentPeriod, nextRentStart, validateRentChange, type RentTerm } from "@/lib/steamfoot-rent";
const term: RentTerm = { id: "a", staffId: "p", startMonth: "2026-07", endMonth: null, cycleMonths: 6, monthlyAmount: 5000, enabled: true };
describe("Steamfoot contractual rent periods", () => {
  it("shows the same six-month agreement in each covered month, without another charge", () => {
    const periods = ["2026-07","2026-08","2026-09","2026-10","2026-11","2026-12"].map(m => rentPeriod(term,m));
    expect(new Set(periods.map(p => p?.key)).size).toBe(1);
    expect(periods[2]).toMatchObject({startMonth:"2026-07",endMonth:"2026-12",total:30000,monthlyAmount:5000});
    expect(rentPeriod(term,"2027-01")).toMatchObject({startMonth:"2027-01",endMonth:"2027-06",total:30000});
  });
  it.each([1,3,6,12])("handles %i-month cycles across years", cycleMonths => {
    const t = {...term,startMonth:"2026-11",cycleMonths};
    const p = rentPeriod(t,"2027-01")!;
    expect(p.total).toBe(5000*cycleMonths);
    expect(p.startMonth <= "2027-01" && p.endMonth >= "2027-01").toBe(true);
  });
  it("does not invent rent before setup, after termination, or when disabled", () => {
    expect(rentPeriod(term,"2026-06")).toBeNull();
    expect(rentPeriod({...term,endMonth:"2026-12"},"2027-01")).toBeNull();
    expect(rentPeriod({...term,enabled:false},"2026-09")).toBeNull();
  });
  it("preserves past periods when a new rate starts", () => {
    const old = {...term,endMonth:"2026-12"};
    const next = {...term,id:"b",startMonth:"2027-01",monthlyAmount:6000};
    expect(rentPeriod(old,"2026-09")?.total).toBe(30000);
    expect(rentPeriod(next,"2026-09")).toBeNull();
    expect(rentPeriod(next,"2027-01")?.total).toBe(36000);
    expect(nextRentStart(term,"2026-09")).toBe("2027-01");
  });
  it("rejects stale, retrospective, and partial-period changes", () => {
    const input = {staffId:"p",startMonth:"2027-01",cycleMonths:6 as const,monthlyAmount:6000,enabled:true,expectedTermId:"a"};
    expect(validateRentChange(term,input,"2026-09")).toBeNull();
    expect(validateRentChange(term,{...input,expectedTermId:null},"2026-09")).toBeTruthy();
    expect(validateRentChange(term,{...input,startMonth:"2026-09"},"2026-09")).toBeTruthy();
    expect(validateRentChange(term,{...input,startMonth:"2027-02"},"2026-09")).toBeTruthy();
  });
  it("rejects invalid periods and negative amounts", () => {
    expect(rentInput.safeParse({staffId:"p",startMonth:"2026-13",cycleMonths:2,monthlyAmount:-1,enabled:true,expectedTermId:null}).success).toBe(false);
  });
});
