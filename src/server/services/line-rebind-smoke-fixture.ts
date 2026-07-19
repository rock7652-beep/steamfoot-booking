import "server-only";

import { prisma } from "@/lib/db";
import { captureLineRebindCandidate, createLineRebindRequest } from "@/server/services/line-rebind";

export const PR2_SMOKE_MARKER = "[PR2_DRY_RUN_SMOKE:steamfoot-preview:v1]";
const STORE_ID = "staging-store";
const NAME = "PR2 Dry Run Smoke";
const EMAIL = "pr2-dry-run-smoke@invalid.example";
const PHONE = "0900000000";
const OLD_LINE_ID = "Upr2smokeold000000000000000000001";
const CANDIDATE_LINE_ID = "Upr2smokenew000000000000000000001";
const EVENT_KEY = "pr2-smoke-fixture-v1-candidate";

type Fixture = { customerId: string; requestId: string; expiresAt: string };

async function assertStore() {
  const store = await prisma.store.findUnique({ where: { id: STORE_ID }, select: { id: true, isDemo: true, slug: true } });
  if (!store || !store.isDemo || store.slug !== "staging") throw new Error("PR2_SMOKE_STAGING_STORE_REQUIRED");
}

async function graph() {
  const rows = await prisma.customer.findMany({
    where: { storeId: STORE_ID, name: NAME, email: EMAIL, notes: PR2_SMOKE_MARKER },
    select: { id: true, userId: true, identityLinks: { select: { id: true, provider: true, providerAccountId: true } }, lineRebindRequests: { select: { id: true, reason: true, candidate: { select: { id: true, webhookEventKey: true } } } }, _count: { select: { bookings: true, transactions: true, planWallets: true, messageLogs: true } } },
  });
  if (rows.length > 1) throw new Error("PR2_SMOKE_FIXTURE_MULTIPLE");
  return rows[0] ?? null;
}

function assertCleanable(value: NonNullable<Awaited<ReturnType<typeof graph>>>) {
  const request = value.lineRebindRequests[0];
  if (!value.userId || value.identityLinks.length !== 1 || value.identityLinks[0]?.provider !== "line" || value.identityLinks[0]?.providerAccountId !== OLD_LINE_ID || value.lineRebindRequests.length !== 1 || request?.reason !== `${PR2_SMOKE_MARKER} browser smoke fixture` || request.candidate?.webhookEventKey !== EVENT_KEY || value._count.bookings || value._count.transactions || value._count.planWallets || value._count.messageLogs) throw new Error("PR2_SMOKE_FIXTURE_INCONSISTENT");
}

export async function createPr2SmokeFixture(createdByUserId: string): Promise<Fixture> {
  await assertStore();
  if (await graph()) throw new Error("PR2_SMOKE_FIXTURE_ALREADY_EXISTS");
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name: NAME, email: EMAIL, role: "CUSTOMER" }, select: { id: true } });
    const customer = await tx.customer.create({ data: { userId: user.id, storeId: STORE_ID, name: NAME, phone: PHONE, email: EMAIL, authSource: "LINE", lineName: NAME, lineUserId: OLD_LINE_ID, lineLinkedAt: new Date(), lineLinkStatus: "LINKED", notes: PR2_SMOKE_MARKER }, select: { id: true } });
    await tx.customerIdentityLink.create({ data: { userId: user.id, storeId: STORE_ID, customerId: customer.id, provider: "line", providerAccountId: OLD_LINE_ID, lineUserId: OLD_LINE_ID } });
    return customer;
  });
  try {
    const request = await createLineRebindRequest({ storeId: STORE_ID, customerId: created.id, createdByUserId, reason: `${PR2_SMOKE_MARKER} browser smoke fixture`, normalizedPhone: PHONE, oldLineUserId: OLD_LINE_ID });
    if (request.status !== "created") throw new Error("PR2_SMOKE_REQUEST_NOT_CREATED");
    const capture = await captureLineRebindCandidate({ storeId: STORE_ID, customerId: created.id, normalizedPhone: PHONE, lineUserId: CANDIDATE_LINE_ID, webhookEventKey: EVENT_KEY });
    if (capture.status !== "captured") throw new Error("PR2_SMOKE_CAPTURE_FAILED");
    return { customerId: created.id, requestId: request.requestId, expiresAt: request.expiresAt.toISOString() };
  } catch (error) { await cleanupPr2SmokeFixture(); throw error; }
}

export async function cleanupPr2SmokeFixture() {
  const value = await graph();
  if (!value) return { removed: false };
  assertCleanable(value);
  const requestId = value.lineRebindRequests[0]!.id;
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { targetType: "LineRebindRequest", targetId: requestId } });
    await tx.lineRebindCandidate.delete({ where: { requestId } });
    await tx.lineRebindRequest.delete({ where: { id: requestId } });
    await tx.customerIdentityLink.delete({ where: { id: value.identityLinks[0]!.id } });
    await tx.customer.delete({ where: { id: value.id } });
    await tx.user.delete({ where: { id: value.userId! } });
  });
  return { removed: true };
}
