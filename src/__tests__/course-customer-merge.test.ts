import { beforeEach, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { moveCourseCustomerRelations } from "@/server/services/course-customer-merge";

const tx = {
  $queryRaw: vi.fn(), $executeRaw: vi.fn(),
  lineRebindRequest: { count: vi.fn() }, centralMemberLinkReviewRequest: { count: vi.fn() },
  customerHealthRecord: { updateMany: vi.fn() }, customerHealthHistoryGrant: { updateMany: vi.fn() },
  messageLog: { count: vi.fn() },
};
const run = () => moveCourseCustomerRelations(tx as unknown as Prisma.TransactionClient, "own", "source", "target");
beforeEach(() => {
  vi.resetAllMocks(); tx.$queryRaw.mockResolvedValue([]); tx.$executeRaw.mockResolvedValue(1);
  tx.lineRebindRequest.count.mockResolvedValue(0); tx.centralMemberLinkReviewRequest.count.mockResolvedValue(0);
  tx.messageLog.count.mockResolvedValue(0);
  tx.customerHealthRecord.updateMany.mockResolvedValue({ count: 2 }); tx.customerHealthHistoryGrant.updateMany.mockResolvedValue({ count: 1 });
});
it("blocks duplicate non-cancelled class participation before any write", async () => {
  tx.$queryRaw.mockResolvedValue([{ name: "核心", startsAt: new Date() }]);
  await expect(run()).rejects.toThrow("都有未取消紀錄");
  expect(tx.$executeRaw).not.toHaveBeenCalled();
  expect(tx.customerHealthRecord.updateMany).not.toHaveBeenCalled();
});
it.each(["line", "review"])("blocks an unresolved %s identity request", async kind => {
  (kind === "line" ? tx.lineRebindRequest : tx.centralMemberLinkReviewRequest).count.mockResolvedValue(1);
  await expect(run()).rejects.toThrow("請先處理");
  expect(tx.$executeRaw).not.toHaveBeenCalled();
});
it("moves scoped relationships without changing financial rows, quota or name snapshots", async () => {
  expect(await run()).toMatchObject({ courseMembers: 1, sharedMemberships: 1, courseBookings: 1, courseOperators: 1, coursePurchases: 1, healthRecords: 2 });
  const sql = tx.$executeRaw.mock.calls.map(call => call[0].join("?"));
  expect(sql.join("\n")).not.toMatch(/UPDATE "(?:CoursePointCard|CoursePointEntry|CoursePurchaseRefund|CashbookEntry)"/);
  expect(sql.join("\n")).not.toContain('SET "customerName"');
  for (const call of tx.$executeRaw.mock.calls) expect(call.slice(1)).toContain("own");
  expect(tx.customerHealthRecord.updateMany).toHaveBeenCalledWith({ where: { storeId: "own", customerId: "source" }, data: { customerId: "target" } });
  expect(sql.at(-1)).toContain('COALESCE("CourseBalanceReminderPreference"."stoppedAt",EXCLUDED."stoppedAt")');
});
