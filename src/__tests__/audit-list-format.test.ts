import { describe, expect, it } from "vitest";
import { auditReturnQuery, auditTimeLabel } from "@/app/(dashboard)/dashboard/operation-audits/audit-list-format";

describe("audit list navigation and time", () => {
  it("keeps the Taiwan day visible at UTC midnight boundaries", () => {
    const earlier = new Date("2026-10-06T15:59:00Z");
    const later = new Date("2026-10-06T16:01:00Z");
    expect(auditTimeLabel(later, earlier)).toBe("10/07 00:01");
    expect(auditTimeLabel(later, new Date("2026-10-06T16:00:00Z"))).toBe("00:01");
    expect(auditTimeLabel(earlier)).toBe("10/06 23:59");
  });
  it("restores filters and pagination only within the audit center", () => {
    expect(auditReturnQuery("module=SPA&q=%E5%8F%96%E6%B6%88&page=2&actor=person&login=session&redirect=https%3A%2F%2Fevil.invalid"))
      .toBe("/dashboard/operation-audits?module=SPA&q=%E5%8F%96%E6%B6%88&page=2&actor=person&login=session");
    expect(auditReturnQuery()).toBeNull();
    expect(auditReturnQuery("x".repeat(2001))).toBeNull();
  });
});
