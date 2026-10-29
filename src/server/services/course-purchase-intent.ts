import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { coursePurchaseIntentHmac, sameCoursePurchaseIntentHmac, type CoursePurchaseIntentInput } from "./course-purchase-intent-input";

export type CoursePurchaseIntentStatus = "PREPARED" | "COMMITTED" | "CANCELLED";
export type CoursePurchaseIntentView = { status: CoursePurchaseIntentStatus; requestKey: string; purchaseId: string | null };
type Row = CoursePurchaseIntentView & { customerId: string; payloadHmac: string | null; acknowledgedAt: Date | null };
type Tx = Prisma.TransactionClient;
type Actor = { storeId: string; userId: string };

/** All mutations must already hold lockCourseStore for this store. */
async function find(tx: Tx, storeId: string, requestKey: string): Promise<Row | null> {
  const rows = await tx.$queryRaw<Row[]>`SELECT "customerId", "requestKey", status, "purchaseId", "payloadHmac", "acknowledgedAt" FROM "CoursePurchaseIntent" WHERE "storeId"=${storeId} AND "requestKey"=${requestKey}`;
  return rows[0] ?? null;
}
function view(row: Row): CoursePurchaseIntentView {
  return { status: row.status, requestKey: row.requestKey, purchaseId: row.purchaseId };
}
function ensureOwner(row: Row, customerId: string): void {
  if (row.customerId !== customerId) throw new AppError("FORBIDDEN", "無法核對此購買請求");
}

/** Caller performs customer/permission checks and holds the store lock. */
export async function prepareCourseIntent(tx: Tx, actor: Actor, input: CoursePurchaseIntentInput): Promise<CoursePurchaseIntentView> {
  const digest = coursePurchaseIntentHmac(input);
  const prior = await find(tx, actor.storeId, input.requestKey);
  if (prior) {
    ensureOwner(prior, input.customerId);
    if (prior.status === "CANCELLED") throw new AppError("CONFLICT", "此購買請求已取消，請重新建立購買");
    if (!sameCoursePurchaseIntentHmac(prior.payloadHmac, digest)) throw new AppError("CONFLICT", "購買資料與待核對請求不同，請先核對原請求");
    return view(prior);
  }
  // This protects old, already committed records created before the rollout.
  const used = await tx.coursePurchase.findUnique({ where: { storeId_requestKey: { storeId: actor.storeId, requestKey: input.requestKey } }, select: { id: true } });
  if (used) throw new AppError("CONFLICT", "此購買識別碼已有交易，請先核對交易紀錄");
  const pending = await tx.$queryRaw<Array<{requestKey:string}>>`SELECT "requestKey" FROM "CoursePurchaseIntent" WHERE "storeId"=${actor.storeId} AND "customerId"=${input.customerId} AND (status='PREPARED' OR (status='COMMITTED' AND "acknowledgedAt" IS NULL)) LIMIT 1`;
  if (pending.length) throw new AppError("CONFLICT", "此學員有待確認的購買，請先核對或安全取消");
  await tx.$executeRaw`INSERT INTO "CoursePurchaseIntent" ("storeId","customerId","requestKey",status,"payloadHmac","actorUserId","createdAt","updatedAt") VALUES (${actor.storeId},${input.customerId},${input.requestKey},'PREPARED',${digest},${actor.userId},NOW(),NOW())`;
  return { status: "PREPARED", requestKey: input.requestKey, purchaseId: null };
}

/** Inspect and prepare under the same store lock. If another device owns an
 * unresolved intent, install a cancellation barrier for this request's key
 * before returning it; a delayed retry can never start a second purchase. */
export async function prepareCourseIntentAtomic(tx: Tx, actor: Actor, input: CoursePurchaseIntentInput): Promise<{kind:"prepared"|"existing";intent:CoursePurchaseIntentView}> {
  const prior = await find(tx, actor.storeId, input.requestKey);
  if (prior) return {kind:"prepared",intent:await prepareCourseIntent(tx, actor, input)};
  const existing = await readPendingCourseIntent(tx, actor.storeId, input.customerId);
  if (existing) {
    const barrier = await cancelCourseIntent(tx, actor, input.customerId, input.requestKey);
    // A legacy purchase already using this key cannot be represented as a
    // cancelled request; retain it for manual reconciliation instead.
    if (barrier.status !== "CANCELLED") throw new AppError("CONFLICT", "此購買識別碼已有交易，請先核對交易紀錄");
    return {kind:"existing",intent:existing};
  }
  return {kind:"prepared",intent:await prepareCourseIntent(tx, actor, input)};
}

/** A missing key must become a tombstone, because the original prepare can arrive later. */
export async function cancelCourseIntent(tx: Tx, actor: Actor, customerId: string, requestKey: string): Promise<CoursePurchaseIntentView> {
  const prior = await find(tx, actor.storeId, requestKey);
  if (prior) {
    ensureOwner(prior, customerId);
    if (prior.status !== "PREPARED") return view(prior);
    await tx.$executeRaw`UPDATE "CoursePurchaseIntent" SET status='CANCELLED',"updatedAt"=NOW() WHERE "storeId"=${actor.storeId} AND "requestKey"=${requestKey} AND status='PREPARED'`;
  } else {
    const used = await tx.coursePurchase.findUnique({ where: { storeId_requestKey: { storeId: actor.storeId, requestKey } }, select: { id: true, customerId: true, status: true } });
    if (used) {
      if (used.customerId !== customerId) throw new AppError("FORBIDDEN", "無法核對此購買請求");
      if (used.status !== "CONFIRMED") throw new AppError("CONFLICT", "既有交易狀態需先核對，不能取消或再次收款");
      return { status: "COMMITTED", requestKey, purchaseId: used.id };
    }
    await tx.$executeRaw`INSERT INTO "CoursePurchaseIntent" ("storeId","customerId","requestKey",status,"payloadHmac","actorUserId","createdAt","updatedAt") VALUES (${actor.storeId},${customerId},${requestKey},'CANCELLED',NULL,${actor.userId},NOW(),NOW())`;
  }
  return { status: "CANCELLED", requestKey, purchaseId: null };
}

export async function readCourseIntent(tx: Tx, storeId: string, customerId: string, requestKey: string): Promise<CoursePurchaseIntentView | null> {
  const row = await find(tx, storeId, requestKey);
  if (!row) {
    const prior = await tx.coursePurchase.findUnique({where:{storeId_requestKey:{storeId,requestKey}},select:{id:true,customerId:true,status:true}});
    return prior?.customerId === customerId && prior.status === "CONFIRMED" ? {status:"COMMITTED",requestKey,purchaseId:prior.id} : null;
  }
  if (row.customerId !== customerId) return null;
  return view(row);
}
export async function readPendingCourseIntent(tx: Tx, storeId: string, customerId: string): Promise<CoursePurchaseIntentView | null> {
  const rows = await tx.$queryRaw<CoursePurchaseIntentView[]>`SELECT status,"requestKey","purchaseId" FROM "CoursePurchaseIntent" WHERE "storeId"=${storeId} AND "customerId"=${customerId} AND (status='PREPARED' OR (status='COMMITTED' AND "acknowledgedAt" IS NULL)) LIMIT 1`;
  return rows[0] ?? null;
}

/** Only an explicitly confirmed committed transaction can release the customer. */
export async function acknowledgeCourseIntent(tx: Tx, actor: Actor, customerId: string, requestKey: string): Promise<CoursePurchaseIntentView> {
  const row = await find(tx, actor.storeId, requestKey);
  if (!row) {
    const prior = await tx.coursePurchase.findUnique({where:{storeId_requestKey:{storeId:actor.storeId,requestKey}},select:{id:true,customerId:true,status:true}});
    if (prior?.customerId === customerId && prior.status === "CONFIRMED") return {status:"COMMITTED",requestKey,purchaseId:prior.id};
    throw new AppError("FORBIDDEN", "無法核對此購買請求");
  }
  if (row.customerId !== customerId) throw new AppError("FORBIDDEN", "無法核對此購買請求");
  if (row.status !== "COMMITTED" || !row.purchaseId) throw new AppError("CONFLICT", "購買尚未完成，無法確認");
  if (!row.acknowledgedAt) await tx.$executeRaw`UPDATE "CoursePurchaseIntent" SET "acknowledgedAt"=NOW(),"updatedAt"=NOW() WHERE "storeId"=${actor.storeId} AND "customerId"=${customerId} AND "requestKey"=${requestKey} AND status='COMMITTED' AND "acknowledgedAt" IS NULL`;
  return view(row);
}

/** Called inside the locked checkout transaction before any purchase or payment. */
export async function assertCourseIntentForCheckout(tx: Tx, storeId: string, input: CoursePurchaseIntentInput): Promise<void> {
  const row = await find(tx, storeId, input.requestKey);
  if (!row) throw new AppError("CONFLICT", "請更新頁面並先建立購買確認，原請求尚未送出");
  ensureOwner(row, input.customerId);
  if (row.status === "CANCELLED") throw new AppError("CONFLICT", "此購買請求已取消，不能收款");
  if (!sameCoursePurchaseIntentHmac(row.payloadHmac, coursePurchaseIntentHmac(input))) throw new AppError("CONFLICT", "購買資料與原請求不同，請先核對");
}
export async function commitCourseIntent(tx: Tx, storeId: string, input: CoursePurchaseIntentInput, purchaseId: string): Promise<void> {
  const changed = await tx.$executeRaw`UPDATE "CoursePurchaseIntent" SET status='COMMITTED',"purchaseId"=${purchaseId},"updatedAt"=NOW() WHERE "storeId"=${storeId} AND "customerId"=${input.customerId} AND "requestKey"=${input.requestKey} AND (status='PREPARED' OR (status='COMMITTED' AND "purchaseId"=${purchaseId}))`;
  if (changed !== 1) throw new AppError("CONFLICT", "購買狀態已變更，請先核對");
}
