import { expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { courseReminderAlreadySent } from "@/server/services/course-reminder-merge-dedupe";

it("keeps the original successful event as the dedupe source after a merge", async () => {
  const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ status: "SENT" });
  const raw = vi.fn().mockResolvedValue([{ id: "original" }]);
  const tx = { messageLog: { findUnique }, $queryRaw: raw } as unknown as Prisma.TransactionClient;
  expect(await courseReminderAlreadySent(tx, "store", "merged", id => `event-${id}`)).toBe(true);
  expect(findUnique).toHaveBeenLastCalledWith({ where: { id: "event-original" } });
  expect(raw.mock.calls[0].slice(1)).toEqual(["store", "merged"]);
});
it("does not claim skipped or failed reminders were delivered", async () => {
  const tx = { messageLog: { findUnique: vi.fn().mockResolvedValue({ status: "SKIPPED" }) }, $queryRaw: vi.fn().mockResolvedValue([{ id: "original" }]) } as unknown as Prisma.TransactionClient;
  expect(await courseReminderAlreadySent(tx, "store", "merged", id => `event-${id}`)).toBe(false);
});
