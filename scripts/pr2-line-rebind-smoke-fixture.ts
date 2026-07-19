/**
 * Creates or removes one guarded, recoverable PR-2 dry-run smoke fixture.
 *
 * Default mode is read-only. Writes require both --execute and
 * --yes-i-checked-staging. This script never calls LINE APIs or a rebind path.
 *
 * Usage (Staging direct URLs only):
 *   npx tsx scripts/pr2-line-rebind-smoke-fixture.ts --yes-i-checked-staging
 *   npx tsx scripts/pr2-line-rebind-smoke-fixture.ts --yes-i-checked-staging --execute
 *   npx tsx scripts/pr2-line-rebind-smoke-fixture.ts --yes-i-checked-staging --cleanup
 *   npx tsx scripts/pr2-line-rebind-smoke-fixture.ts --yes-i-checked-staging --cleanup --execute
 */
import { createHash } from "node:crypto";
import { prisma } from "../src/lib/db";
import {
  captureLineRebindCandidate,
  createLineRebindRequest,
} from "../src/server/services/line-rebind";

const STAGING_REF = "ttworfzgwejdeolegkxl";
const STAGING_DIRECT_HOST = `db.${STAGING_REF}.supabase.co`;
const STAGING_STORE_ID = "staging-store";
const MARKER = "[PR2_DRY_RUN_SMOKE:steamfoot-preview:v1]";
const CUSTOMER_NAME = "PR2 Dry Run Smoke";
const CUSTOMER_EMAIL = "pr2-dry-run-smoke@invalid.example";
const CUSTOMER_PHONE = "0900000000";
const OLD_LINE_USER_ID = "Upr2smokeold000000000000000000001";
const CANDIDATE_LINE_USER_ID = "Upr2smokenew000000000000000000001";
const WEBHOOK_EVENT_KEY = "pr2-smoke-fixture-v1-candidate";

type Args = { execute: boolean; cleanup: boolean; acknowledged: boolean };

function parseArgs(argv: string[]): Args {
  return {
    execute: argv.includes("--execute"),
    cleanup: argv.includes("--cleanup"),
    acknowledged: argv.includes("--yes-i-checked-staging"),
  };
}

function databaseHost(name: "DATABASE_URL" | "DIRECT_URL"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_MISSING`);
  try {
    return new URL(value).hostname;
  } catch {
    throw new Error(`${name}_INVALID`);
  }
}

function assertStagingOnly() {
  const databaseHostName = databaseHost("DATABASE_URL");
  const directHostName = databaseHost("DIRECT_URL");
  if (databaseHostName !== STAGING_DIRECT_HOST || directHostName !== STAGING_DIRECT_HOST) {
    throw new Error(`STAGING_ONLY_ABORT: expected ${STAGING_DIRECT_HOST}; got DATABASE_URL=${databaseHostName}, DIRECT_URL=${directHostName}`);
  }
  const key = process.env.LINE_REBIND_ENCRYPTION_KEY;
  if (!key || Buffer.from(key, "base64url").length !== 32) {
    throw new Error("LINE_REBIND_ENCRYPTION_KEY_INVALID");
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function assertFixtureAbsent() {
  const count = await prisma.customer.count({
    where: { name: CUSTOMER_NAME, email: CUSTOMER_EMAIL, notes: MARKER, storeId: STAGING_STORE_ID },
  });
  if (count !== 0) throw new Error(`FIXTURE_ALREADY_EXISTS_OR_INCONSISTENT: found ${count} customer(s); run cleanup dry-run first`);
}

async function assertStagingStore() {
  const store = await prisma.store.findUnique({
    where: { id: STAGING_STORE_ID }, select: { id: true, name: true, slug: true, isDemo: true },
  });
  if (!store || !store.isDemo || store.slug !== "staging") throw new Error("STAGING_STORE_GUARD_FAILED");
  return store;
}

async function fixtureGraph() {
  const customers = await prisma.customer.findMany({
    where: { name: CUSTOMER_NAME, email: CUSTOMER_EMAIL, notes: MARKER, storeId: STAGING_STORE_ID },
    select: {
      id: true, userId: true, storeId: true, lineUserId: true, lineLinkStatus: true,
      identityLinks: { select: { id: true, provider: true, providerAccountId: true, lineUserId: true } },
      lineRebindRequests: { select: { id: true, reason: true, status: true, expiresAt: true, candidate: { select: { id: true, webhookEventKey: true } } } },
      _count: { select: { bookings: true, transactions: true, planWallets: true, messageLogs: true } },
    },
  });
  if (customers.length > 1) throw new Error("FIXTURE_CLEANUP_REFUSED_MULTIPLE_CUSTOMERS");
  return customers[0] ?? null;
}

async function dryRunCreate() {
  const store = await assertStagingStore();
  await assertFixtureAbsent();
  console.log("mode=DRY_RUN (no writes)");
  console.log(`project_ref=${STAGING_REF}`);
  console.log(`store=${store.name} (${store.id})`);
  console.log("would create: User, Customer, CustomerIdentityLink, LineRebindRequest, LineRebindCandidate, AuditLog");
  console.log(`customer=${CUSTOMER_NAME}; marker=${MARKER}`);
  console.log("request status=CANDIDATE_CAPTURED; expiry=15 minutes after execution");
  console.log("no LINE API call; no Customer/IdentityLink/Account/Booking/Transaction/ReminderLog update");
}

async function createFixture() {
  await assertStagingStore();
  await assertFixtureAbsent();
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name: CUSTOMER_NAME, email: CUSTOMER_EMAIL, role: "CUSTOMER" }, select: { id: true } });
    const customer = await tx.customer.create({
      data: {
        userId: user.id, storeId: STAGING_STORE_ID, name: CUSTOMER_NAME, phone: CUSTOMER_PHONE,
        email: CUSTOMER_EMAIL, authSource: "LINE", lineName: CUSTOMER_NAME, lineUserId: OLD_LINE_USER_ID,
        lineLinkedAt: new Date(), lineLinkStatus: "LINKED", notes: MARKER,
      }, select: { id: true },
    });
    await tx.customerIdentityLink.create({
      data: { userId: user.id, storeId: STAGING_STORE_ID, customerId: customer.id, provider: "line", providerAccountId: OLD_LINE_USER_ID, lineUserId: OLD_LINE_USER_ID },
    });
    return { userId: user.id, customerId: customer.id };
  });

  try {
    const request = await createLineRebindRequest({
      storeId: STAGING_STORE_ID, customerId: created.customerId, createdByUserId: created.userId,
      reason: `${MARKER} browser smoke fixture`, normalizedPhone: CUSTOMER_PHONE, oldLineUserId: OLD_LINE_USER_ID,
    });
    if (request.status !== "created") throw new Error("FIXTURE_REQUEST_NOT_CREATED");
    const captured = await captureLineRebindCandidate({
      storeId: STAGING_STORE_ID, customerId: created.customerId, normalizedPhone: CUSTOMER_PHONE,
      lineUserId: CANDIDATE_LINE_USER_ID, webhookEventKey: WEBHOOK_EVENT_KEY,
    });
    if (captured.status !== "captured") throw new Error(`FIXTURE_CAPTURE_FAILED:${captured.status}`);
    const graph = await fixtureGraph();
    if (!graph || graph.lineUserId !== OLD_LINE_USER_ID || graph.lineLinkStatus !== "LINKED" || graph.identityLinks.length !== 1 || graph.lineRebindRequests.length !== 1 || graph.lineRebindRequests[0]?.status !== "CANDIDATE_CAPTURED" || !graph.lineRebindRequests[0]?.candidate || graph.lineRebindRequests[0].expiresAt <= new Date()) {
      throw new Error("FIXTURE_POSTCONDITION_FAILED");
    }
    console.log(JSON.stringify({ customerId: graph.id, requestId: graph.lineRebindRequests[0].id, status: graph.lineRebindRequests[0].status, expiresAt: graph.lineRebindRequests[0].expiresAt.toISOString(), oldUserIdHashMatches: sha256(OLD_LINE_USER_ID) === (await prisma.lineRebindRequest.findUniqueOrThrow({ where: { id: graph.lineRebindRequests[0].id }, select: { oldUserIdHash: true } })).oldUserIdHash }, null, 2));
  } catch (error) {
    await cleanupFixture();
    throw error;
  }
}

async function dryRunCleanup() {
  const graph = await fixtureGraph();
  if (!graph) { console.log("mode=DRY_RUN cleanup; no fixture found"); return; }
  validateGraphForCleanup(graph);
  console.log("mode=DRY_RUN cleanup (no writes)");
  console.log(JSON.stringify({ customerId: graph.id, identityLinkId: graph.identityLinks[0]?.id, requestId: graph.lineRebindRequests[0]?.id, candidateId: graph.lineRebindRequests[0]?.candidate?.id }, null, 2));
}

function validateGraphForCleanup(graph: NonNullable<Awaited<ReturnType<typeof fixtureGraph>>>) {
  const request = graph.lineRebindRequests[0];
  if (graph.identityLinks.length !== 1 || graph.identityLinks[0]?.provider !== "line" || graph.identityLinks[0]?.providerAccountId !== OLD_LINE_USER_ID || graph.lineRebindRequests.length !== 1 || request?.reason !== `${MARKER} browser smoke fixture` || !request.candidate || request.candidate.webhookEventKey !== WEBHOOK_EVENT_KEY || graph._count.bookings || graph._count.transactions || graph._count.planWallets || graph._count.messageLogs || !graph.userId) {
    throw new Error("FIXTURE_CLEANUP_REFUSED_INCONSISTENT_GRAPH");
  }
}

async function cleanupFixture() {
  const graph = await fixtureGraph();
  if (!graph) { console.log("No fixture found."); return; }
  validateGraphForCleanup(graph);
  const requestId = graph.lineRebindRequests[0]!.id;
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { targetType: "LineRebindRequest", targetId: requestId } });
    await tx.lineRebindCandidate.delete({ where: { requestId } });
    await tx.lineRebindRequest.delete({ where: { id: requestId } });
    await tx.customerIdentityLink.delete({ where: { id: graph.identityLinks[0]!.id } });
    await tx.customer.delete({ where: { id: graph.id } });
    await tx.user.delete({ where: { id: graph.userId! } });
  });
  console.log(`Deleted fixture customer=${graph.id} request=${requestId}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertStagingOnly();
  if (!args.acknowledged) throw new Error("CONFIRMATION_REQUIRED: pass --yes-i-checked-staging");
  if (args.cleanup) return args.execute ? cleanupFixture() : dryRunCleanup();
  return args.execute ? createFixture() : dryRunCreate();
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
