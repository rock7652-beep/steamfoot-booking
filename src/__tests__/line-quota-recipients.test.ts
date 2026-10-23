import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ staff: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { staff: { findMany: m.staff } } }));
import { getLineQuotaOwnerRecipients, quotaRecipientEventKey } from "@/server/services/line-quota-recipients";
beforeEach(() => vi.clearAllMocks());

it("looks up active OWNER login accounts only within the requested store", async () => {
  m.staff.mockResolvedValue([{ user: { email: "first@example.com" } }, { user: { email: "second@example.com" } }]);
  const result = await getLineQuotaOwnerRecipients("store-a");
  expect(result.emails).toEqual(["first@example.com", "second@example.com"]);
  expect(m.staff).toHaveBeenCalledWith({
    where: { storeId: "store-a", status: "ACTIVE", user: { role: "OWNER", status: "ACTIVE" } },
    select: { user: { select: { email: true } } },
  });
});
it("deduplicates normalized addresses and reports owners without valid emails", async () => {
  m.staff.mockResolvedValue([
    { user: { email: " Owner@Example.COM " } }, { user: { email: "owner@example.com" } },
    { user: { email: null } }, { user: { email: "invalid" } },
  ]);
  expect(await getLineQuotaOwnerRecipients("store-a")).toEqual({ emails: ["owner@example.com"], missingEmailCount: 2, ownerCount: 4 });
});
it("returns no fallback to HQ, store settings, or hardcoded mailboxes", async () => {
  m.staff.mockResolvedValue([]);
  expect(await getLineQuotaOwnerRecipients("store-b")).toEqual({ emails: [], missingEmailCount: 0, ownerCount: 0 });
});
it("uses stable per-address keys so a retry does not resend to successful recipients", () => {
  const first = quotaRecipientEventKey("STORE:2026-10:95", "first@example.com");
  expect(first).toBe(quotaRecipientEventKey("STORE:2026-10:95", "first@example.com"));
  expect(first).not.toBe(quotaRecipientEventKey("STORE:2026-10:95", "second@example.com"));
  expect(first).not.toBe(quotaRecipientEventKey("STORE:2026-11:95", "first@example.com"));
});
