import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ rows: vi.fn(), rebind: vi.fn(), capture: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findMany: h.rows } } }));
vi.mock("@/server/services/line-rebind", () => ({ sha256: vi.fn() }));
vi.mock("@/server/services/liff-login-rebind", () => ({
  LIFF_LOGIN_FIRST_CAPTURE_REASON: "LIFF_LOGIN_FIRST_CAPTURE_V1",
  tryExecuteAuthorizedLiffLoginRebind: h.rebind,
  tryExecuteAuthorizedLiffLoginFirstCapture: h.capture,
}));
import { completeAuthorizedFirstStoreLogin } from "@/server/services/store-member-connection";
const input = { storeId: "isolated-store", phone: "0912345678", candidateLineUserId: "verified-subject" };
beforeEach(() => {
  vi.resetAllMocks();
  h.rows.mockResolvedValue([{ id: "isolated-member" }]);
  h.rebind.mockResolvedValue({ status: "not_authorized" });
  h.capture.mockResolvedValue({ status: "not_authorized" });
});
describe("approved existing-member Login recovery from onboarding", () => {
  it("uses the exact existing migration before first-capture checks", async () => {
    h.rebind.mockResolvedValue({ status: "executed", requestId: "approved" });
    expect(await completeAuthorizedFirstStoreLogin(input)).toBe(true);
    expect(h.rebind).toHaveBeenCalledWith({ ...input, customerId: "isolated-member" });
    expect(h.capture).not.toHaveBeenCalled();
  });
  it("preserves existing authorized first capture when no migration exists", async () => {
    h.capture.mockResolvedValue({ status: "executed", requestId: "first" });
    expect(await completeAuthorizedFirstStoreLogin(input)).toBe(true);
  });
  it("does not fall through after migration rejects a conflict", async () => {
    h.rebind.mockResolvedValue({ status: "rejected", code: "LOGIN_IDENTITY_CONFLICT" });
    h.capture.mockResolvedValue({ status: "executed" });
    expect(await completeAuthorizedFirstStoreLogin(input)).toBe(false);
    expect(h.capture).not.toHaveBeenCalled();
  });
  it("never authorizes access from phone alone", async () => {
    expect(await completeAuthorizedFirstStoreLogin(input)).toBe(false);
  });
  it.each([{ rows: [] }, { rows: [{ id: "one" }, { id: "two" }] }])("rejects missing or ambiguous store members", async ({ rows }) => {
    h.rows.mockResolvedValue(rows);
    expect(await completeAuthorizedFirstStoreLogin(input)).toBe(false);
    expect(h.rebind).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
  });
});
