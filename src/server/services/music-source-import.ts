import "server-only";
import { requireMusicHistoryIntegration } from "./music-history-integration";
import { AppError } from "@/lib/errors";
import { parseMusicSourceImport, planMusicSourceImport, sourceImportHash, sourceBatchId, sourceCustomerId, sourceStudentMarker, type MusicSourceImport, type SourceCustomer } from "@/lib/music-source-import";
import { assertMusicOpeningPreviewEnvironment, MUSIC_OPENING_STORE } from "../../../scripts/music-opening-preview-scope.mjs";
import type { Prisma } from "@prisma/client";

type Actor = { storeId: string; userId: string; name: string; role: string };
function assertScope(actor: Actor) {
  if (process.env.VERCEL !== "1") throw new AppError("FORBIDDEN", "僅開放隔離預覽環境");
  assertMusicOpeningPreviewEnvironment(process.env);
  if (actor.storeId !== MUSIC_OPENING_STORE || !["OWNER", "MANAGER", "ADMIN"].includes(actor.role)) throw new AppError("FORBIDDEN", "匯入範圍不符");
}
export async function authorizeMusicSourceImport() {
  requireMusicHistoryIntegration();
  if (process.env.VERCEL !== "1") throw new AppError("FORBIDDEN", "僅開放隔離預覽環境");
  assertMusicOpeningPreviewEnvironment(process.env);
  const { courseManager } = await import("./course-access");
  const access = await courseManager("wallet.create"), bookings = await courseManager("booking.update");
  if (bookings.storeId !== access.storeId || bookings.user.id !== access.user.id) throw new AppError("FORBIDDEN", "操作範圍不一致");
  for (const permission of ["customer.read", "customer.create"] as const) {
    const customers = await courseManager(permission);
    if (customers.storeId !== access.storeId || customers.user.id !== access.user.id) throw new AppError("FORBIDDEN", "學生權限範圍不一致");
  }
  const actor = { storeId: access.storeId, userId: access.user.id, name: access.user.name ?? "", role: access.user.role };
  assertScope(actor);
  return actor;
}
async function sourceCustomers(tx: Prisma.TransactionClient, actor: Actor, data: MusicSourceImport): Promise<SourceCustomer[]> {
  return tx.customer.findMany({ where: { storeId: actor.storeId, OR: [
    { id: { in: data.students.map(s => sourceCustomerId(s.sourceStudentId)) } },
    { serviceNote: { in: data.students.map(s => sourceStudentMarker(s.sourceStudentId)) } },
    { phone: { in: data.students.map(s => s.phone.trim()).filter(Boolean) } },
  ] }, select: { id: true, name: true, phone: true, serviceNote: true, mergedIntoCustomerId: true } });
}
export async function previewMusicSourceImport(raw: unknown) {
  const actor = await authorizeMusicSourceImport(), data = parseMusicSourceImport(raw);
  const { prisma } = await import("@/lib/db");
  const preview = await prisma.$transaction(async tx => planMusicSourceImport(data, await sourceCustomers(tx, actor, data)), { isolationLevel: "RepeatableRead" });
  return { preview, contentHash: sourceImportHash(data), planHash: sourceImportHash(preview) };
}

/** Single transaction: structured source archive and unambiguous profiles only.
 * Historical events never become native purchases, attendance, reservations,
 * cards, payroll or LINE identities. No notification kick runs after commit. */
export async function commitMusicSourceImportInTransaction(tx: Prisma.TransactionClient, actor: Actor, raw: unknown, expectedPlanHash: string) {
  assertScope(actor);
  // User-approved test import is available at any hour. assertScope still
  // requires the exact isolated Preview branch, connections, store and role.
  const data = parseMusicSourceImport(raw), hash = sourceImportHash(data);
  await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${actor.storeId} FOR UPDATE`;
  const stored = await tx.$queryRaw<Array<{ id: string; payload: unknown; result: unknown }>>`
    SELECT id, payload, result FROM "MusicSourceImportBatch" WHERE "storeId"=${actor.storeId} AND "contentHash"=${hash}`;
  if (stored.length) {
    if (sourceImportHash(stored[0].payload) !== hash) throw new AppError("CONFLICT", "來源批次內容不一致");
    return { batchId: stored[0].id, duplicate: true, result: stored[0].result };
  }
  const preview = planMusicSourceImport(data, await sourceCustomers(tx, actor, data));
  if (sourceImportHash(preview) !== expectedPlanHash) throw new AppError("CONFLICT", "學生資料已變動，請重新預覽");
  const created: string[] = [];
  for (const row of preview.rows.filter(r => r.disposition === "CREATE")) {
    const customer = await tx.customer.create({ data: { id: sourceCustomerId(row.sourceStudentId), storeId: actor.storeId,
      name: row.name, phone: row.phone.trim(), serviceNote: sourceStudentMarker(row.sourceStudentId), selfBookingEnabled: false,
    }, select: { id: true } });
    created.push(customer.id);
  }
  const batchId = sourceBatchId(hash);
  const result = { counts: preview.counts, created, existing: preview.existing, review: preview.review,
    rows: preview.rows.map(r => ({ sourceStudentId: r.sourceStudentId, disposition: r.disposition, reason: r.reason })) };
  await tx.$executeRaw`INSERT INTO "MusicSourceImportBatch" (id,"storeId","contentHash","actorUserId",payload,result)
    VALUES (${batchId},${actor.storeId},${hash},${actor.userId},${JSON.stringify(data)}::jsonb,${JSON.stringify(result)}::jsonb)`;
  await tx.auditLog.create({ data: { actorUserId: actor.userId, actorNameSnapshot: actor.name, actorRoleSnapshot: actor.role,
    storeId: actor.storeId, module: "MUSIC", targetType: "MusicSourceImportBatch", targetId: batchId,
    action: "SOURCE_ARCHIVE_IMPORT", summary: "音教雲來源資料封存與學生基本資料匯入",
    afterJson: { contentHash: hash, counts: preview.counts, created: created.length, review: preview.review },
  } });
  const readback = await tx.$queryRaw<Array<{ payload: unknown; result: unknown }>>`SELECT payload,result FROM "MusicSourceImportBatch" WHERE id=${batchId} AND "storeId"=${actor.storeId}`;
  if (readback.length !== 1 || sourceImportHash(readback[0].payload) !== hash || sourceImportHash(readback[0].result) !== sourceImportHash(result)) throw new AppError("CONFLICT", "批次讀回核對未通過");
  const customers = await sourceCustomers(tx, actor, data);
  for (const row of preview.rows.filter(r => r.disposition === "CREATE")) {
    const saved = customers.find(c => c.id === sourceCustomerId(row.sourceStudentId));
    if (!saved || saved.name !== row.name || saved.phone !== row.phone.trim() || saved.serviceNote !== sourceStudentMarker(row.sourceStudentId)) throw new AppError("CONFLICT", "學生讀回核對未通過");
  }
  return { batchId, duplicate: false, result };
}
export async function commitMusicSourceImport(raw: unknown, expectedPlanHash: string) {
  const actor = await authorizeMusicSourceImport();
  const { prisma } = await import("@/lib/db");
  return prisma.$transaction(tx => commitMusicSourceImportInTransaction(tx, actor, raw, expectedPlanHash), { isolationLevel: "Serializable", timeout: 30_000 });
}
export async function readMusicSourceBatch(batchId: string) {
  const actor = await authorizeMusicSourceImport();
  if (!/^[a-f0-9-]{36}$/.test(batchId)) throw new AppError("VALIDATION", "批次編號不符");
  const { prisma } = await import("@/lib/db");
  const rows = await prisma.$queryRaw<Array<{ payload: unknown; result: unknown; contentHash: string }>>`
    SELECT payload,result,"contentHash" FROM "MusicSourceImportBatch" WHERE id=${batchId} AND "storeId"=${actor.storeId}`;
  if (rows.length !== 1 || sourceImportHash(rows[0].payload) !== rows[0].contentHash) throw new AppError("CONFLICT", "找不到可核對的批次");
  return rows[0];
}
