import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("settings store-scope source contracts", () => {
  it("uses the write resolver for every business-hours mutation", () => {
    const source = read("src/server/actions/business-hours.ts");
    expect(source).not.toContain("const storeId = user.storeId!");
    expect(source.match(/resolveWriteStoreId\(user\)/g)?.length).toBe(9);
    expect(source).toContain("const sourceStoreId = hq.id");
    expect(source).toContain("const destinationStoreId = await resolveWriteStoreId(user)");
  });

  it("does not expose business-hours reads that trust a client storeId", () => {
    const source = read("src/server/actions/business-hours.ts");
    expect(source).toContain("getDayStatus(date: Date)");
    expect(source).toContain("getDaySlotOverrides(dateStr: string)");
    expect(source).not.toContain("getDayStatus(storeId: string");
    expect(source).not.toContain("getDaySlotOverrides(storeId: string");
  });

  it("scopes payment and trial writes through the shared resolver", () => {
    const source = read("src/server/actions/shop.ts");
    const payment = source.slice(source.indexOf("export async function updateShopBankInfo"));
    const trial = source.slice(source.indexOf("export async function updateTrialSettings"));
    expect(payment).toContain("await resolveWriteStoreId(user)");
    expect(trial).toContain("await resolveWriteStoreId(user)");
    expect(source).not.toContain("const storeId = user.storeId");
  });

  it("remounts store-scoped setting forms when the active store changes", () => {
    const paymentPage = read("src/app/(dashboard)/dashboard/settings/payment/page.tsx");
    const trialPage = read("src/app/(dashboard)/dashboard/settings/trial/page.tsx");
    const referralPage = read("src/app/(dashboard)/dashboard/settings/referral-share/page.tsx");
    const hoursPage = read("src/app/(dashboard)/dashboard/settings/hours/page.tsx");
    const dutyPage = read("src/app/(dashboard)/dashboard/settings/duty/page.tsx");
    const remindersPage = read("src/app/(dashboard)/dashboard/reminders/page.tsx");

    expect(paymentPage).toContain("key={storeId}");
    expect(paymentPage).toContain("storeId={storeId}");
    expect(trialPage).toContain("key={storeId}");
    expect(trialPage).toContain("storeId={storeId}");
    expect(referralPage).toContain("key={storeId}");
    expect(hoursPage).toContain('key={`bookable-until-${effectiveStoreId}`}');
    expect(hoursPage).toContain('key={`schedule-${effectiveStoreId}`}');
    expect(dutyPage).toContain("key={storeId}");
    expect(remindersPage.match(/key=\{activeStoreId\}/g)?.length).toBe(3);
  });

  it("keeps reminder reads and final updates store-scoped", () => {
    const queries = read("src/server/queries/reminder.ts");
    const actions = read("src/server/actions/reminder.ts");
    expect(queries).not.toContain("storeId: user.storeId!");
    expect(actions).toContain("where: { id: ruleId, storeId }");
    expect(actions).toContain("where: { id: templateId, storeId }");
  });
});
