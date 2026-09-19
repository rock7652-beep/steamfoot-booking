import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { customerIdentityLink: { findMany: m.find }, customer: { updateMany: m.update } } }));
import { handleConfiguredCourseLineFollow } from "@/server/services/course-line-follow";
import type { StoreLineConfig } from "@/lib/store-line-config";
const config = { storeId: "a", providerId: "901" } as StoreLineConfig;
beforeEach(() => { vi.resetAllMocks(); m.find.mockResolvedValue([{ customerId: "customer-a" }]); });
it("updates only a verified member in the signed channel namespace and ignores older deliveries", async () => {
  const timestamp = Date.now() - 1000;
  await handleConfiguredCourseLineFollow(config, { type: "unfollow", source: { userId: "subject" }, timestamp });
  expect(m.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "a", provider: "line-provider:901", providerAccountId: "subject" }) }));
  expect(m.update).toHaveBeenCalledWith({ where: { id: "customer-a", storeId: "a", OR: [{ lineLinkedAt: null }, { lineLinkedAt: { lt: new Date(timestamp) } }] }, data: { lineLinkStatus: "BLOCKED", lineLinkedAt: new Date(timestamp) } });
});
it("does not create or bind an unknown follower", async () => {
  m.find.mockResolvedValue([]);
  await handleConfiguredCourseLineFollow(config, { type: "follow", source: { userId: "new" }, timestamp: Date.now() });
  expect(m.update).not.toHaveBeenCalled();
});
it("does not dispatch course messages through legacy text actions", async () => {
  await handleConfiguredCourseLineFollow(config, { type: "message", source: { userId: "new" }, timestamp: Date.now() });
  expect(m.find).not.toHaveBeenCalled();
});
