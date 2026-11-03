import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const h = vi.hoisted(() => ({ transaction: vi.fn(), links: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: h.transaction } }));
import { consumeCustomerLineBindingCode } from "@/server/services/customer-line-binding-code";
const input = { customerId: "a", storeId: "store-a", code: "CODEAA", lineUserId: "Ucandidate" };
beforeEach(() => {
  vi.resetAllMocks(); h.links.mockResolvedValue([]); h.update.mockResolvedValue({ count: 1 });
  h.transaction.mockImplementation(callback => callback({ customerIdentityLink: { findMany: h.links }, customer: { updateMany: h.update } }));
});
it("consumes a code once and never writes a synthetic Login link", async () => {
  expect(await consumeCustomerLineBindingCode(input)).toBe(true);
  expect(h.update).toHaveBeenCalledWith({ where: expect.objectContaining({
    id: "a", storeId: "store-a", mergedIntoCustomerId: null, lineUserId: null, lineLinkStatus: "UNLINKED", lineBindingCode: "CODEAA",
    lineBindingCodeCreatedAt: { gt: expect.any(Date) },
  }), data: expect.objectContaining({ lineUserId: "Ucandidate", lineBindingCode: null, lineBindingCodeCreatedAt: null }) });
  expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
});
it("rejects replayed, expired and concurrently changed codes when compare-and-set fails", async () => {
  h.update.mockResolvedValue({ count: 0 });
  expect(await consumeCustomerLineBindingCode(input)).toBe(false);
});
it("does not overwrite a Login identity or steal another customer's LINE", async () => {
  h.links.mockResolvedValue([{ id: "existing-identity" }]);
  expect(await consumeCustomerLineBindingCode(input)).toBe(false);
  expect(h.update).not.toHaveBeenCalled();
});
it.each(["P2002", "P2034"])("fails closed on %s without reporting success", async code => {
  h.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("conflict", { code, clientVersion: "6" }));
  expect(await consumeCustomerLineBindingCode(input)).toBe(false);
});
