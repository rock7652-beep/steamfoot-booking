import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { courseBookingWindowSaveInput, bookingWindowRevision, type SavedBookingWindow } from "@/lib/course-booking-window-save";
import { AppError } from "@/lib/errors";
import { parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";

type WindowTx = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
type ConfigRow = { bookableUntilDate: Date | null; bookingWindowDays: number; bookingOpensAt: Date | null; updatedAt: Date };
export type WindowInput = ReturnType<typeof courseBookingWindowSaveInput.parse>;
export function parseWindowInput(input: unknown, storeId: string) {
  const data = courseBookingWindowSaveInput.parse(input);
  if (data.expectedStoreId !== storeId) throw new AppError("CONFLICT", "門市已切換，請重新開啟設定");
  if (data.values.mode === "fixed" && (!parseTaipeiDateTime(data.values.date, "00:00") || data.values.date < toLocalDateStr()))
    throw new AppError("VALIDATION", "請選擇今天或之後的有效日期");
  return data;
}
function normalize(row?: ConfigRow): SavedBookingWindow {
  return { date: row?.bookableUntilDate?.toISOString().slice(0, 10) ?? null, days: row?.bookingWindowDays ?? 14, opensAt: row?.bookingOpensAt?.toISOString() ?? null };
}
/** Shared configuration SQL only. The caller supplies its module-specific booking guard. */
export async function confirmBookingWindow(tx: WindowTx, storeId: string, input: WindowInput, guard: (closesAt: Date) => Promise<void>) {
  const rows = await tx.$queryRaw<ConfigRow[]>`SELECT "bookableUntilDate", "bookingWindowDays", "bookingOpensAt", "updatedAt" FROM "ShopConfig" WHERE "storeId"=${storeId} FOR UPDATE`;
  const current = normalize(rows[0]), value = input.values;
  const desired = { date: value.mode === "fixed" ? value.date : null, days: value.mode === "rolling" ? value.days : current.days, opensAt: null };
  if (bookingWindowRevision(current) === bookingWindowRevision(desired)) return current;
  if (bookingWindowRevision(current) !== input.expectedRevision) throw new AppError("CONFLICT", "預約期限已被修改，請重新開啟後再編輯");
  const cutoff = desired.date ? parseTaipeiDateTime(desired.date, "23:59")! : new Date(Date.now() + desired.days * 86_400_000);
  await guard(desired.date ? new Date(cutoff.getTime() + 59_999) : cutoff);
  const date = desired.date ? new Date(`${desired.date}T00:00:00Z`) : null;
  const changed = rows.length
    ? await tx.$executeRaw`UPDATE "ShopConfig" SET "bookableUntilDate"=${date}, "bookingWindowDays"=${desired.days}, "bookingOpensAt"=NULL, "updatedAt"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE "storeId"=${storeId} AND "updatedAt"=${rows[0].updatedAt}`
    : await tx.$executeRaw`INSERT INTO "ShopConfig" (id,"storeId","bookableUntilDate","bookingWindowDays","bookingOpensAt","updatedAt") VALUES (${randomUUID()},${storeId},${date},${desired.days},NULL,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) ON CONFLICT ("storeId") DO NOTHING`;
  if (changed !== 1) throw new AppError("CONFLICT", "預約期限已被修改，請重新開啟後再編輯");
  const saved = await tx.$queryRaw<ConfigRow[]>`SELECT "bookableUntilDate", "bookingWindowDays", "bookingOpensAt", "updatedAt" FROM "ShopConfig" WHERE "storeId"=${storeId}`;
  if (!saved[0]) throw new Error("Saved booking window not found");
  return normalize(saved[0]);
}
