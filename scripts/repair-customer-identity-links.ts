/**
 * Guarded CustomerIdentityLink reconciliation.
 *
 * Default mode is production read-only dry-run. Writes require every execute
 * guard shown in usage; the script never changes Customer, User, Account, or
 * HealthFlow data.
 *
 * Usage:
 *   IDENTITY_LINK_REPAIR_SNAPSHOT=/controlled/path/snapshot.json \
 *     npx tsx scripts/repair-customer-identity-links.ts \
 *     --target-ref=<approved-ref> --snapshot-sha256=<approved-sha256> \
 *     --snapshot-count=<approved-count> --max-writes=<approved-count>
 *
 *   IDENTITY_LINK_REPAIR_SNAPSHOT=/controlled/path/snapshot.json \
 *     npx tsx scripts/repair-customer-identity-links.ts \
 *     --execute \
 *     --target-ref=<approved-ref> --snapshot-sha256=<approved-sha256> \
 *     --snapshot-count=<approved-count> --max-writes=<approved-count>
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { upsertCustomerIdentityLink } from "../src/server/services/customer-identity-link";

const PRODUCTION_REF = "qijlnhtpbintanzpxkvf";

export type SnapshotCandidate = {
  customerId: string;
  storeId: string;
  userId: string;
  lineIdentitySha256: string;
};

type Snapshot = {
  version: number;
  generatedAt: string;
  sourceProjectRef: string;
  candidateCount: number;
  candidates: SnapshotCandidate[];
};

export type ResultStatus =
  | "created"
  | "already_exists"
  | "skipped"
  | "conflict"
  | "failed";

type Result = {
  customerId: string;
  status: ResultStatus;
  reason: string;
};

type LiveState = {
  customer: {
    id: string;
    storeId: string;
    userId: string | null;
    lineUserId: string | null;
    lineLinkStatus: string;
    mergedIntoCustomerId: string | null;
  } | null;
  account: { userId: string; providerAccountId: string } | null;
  linkByCustomer: {
    userId: string;
    storeId: string;
    customerId: string;
    provider: string;
    providerAccountId: string;
  } | null;
  linkByIdentity: {
    userId: string;
    storeId: string;
    customerId: string;
    provider: string;
    providerAccountId: string;
  } | null;
};

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function projectRefFromDatabaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const hostMatch = url.hostname.match(/(?:db\.)?([a-z0-9]{20})\.supabase\.com$/);
    if (hostMatch) return hostMatch[1];
    const userMatch = decodeURIComponent(url.username).match(/^postgres\.([a-z0-9]{20})$/);
    return userMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

export function classifyLiveState(
  expected: SnapshotCandidate,
  live: LiveState,
): { status: Exclude<ResultStatus, "created" | "failed"> | "ready"; reason: string } {
  const c = live.customer;
  if (!c) return { status: "skipped", reason: "customer_missing" };
  if (c.mergedIntoCustomerId) return { status: "skipped", reason: "customer_merged" };
  if (c.storeId !== expected.storeId) return { status: "skipped", reason: "store_changed" };
  if (c.userId !== expected.userId) return { status: "skipped", reason: "user_changed" };
  if (!c.lineUserId || c.lineLinkStatus !== "LINKED") {
    return { status: "skipped", reason: "line_state_changed" };
  }
  if (sha256(c.lineUserId) !== expected.lineIdentitySha256) {
    return { status: "skipped", reason: "line_identity_changed" };
  }
  if (!live.account) return { status: "conflict", reason: "line_account_missing" };
  if (live.account.userId !== expected.userId) {
    return { status: "conflict", reason: "line_account_owned_by_other_user" };
  }

  const exactLink = (link: NonNullable<LiveState["linkByCustomer"]>) =>
    link.provider === "line" &&
    link.customerId === expected.customerId &&
    link.storeId === expected.storeId &&
    link.userId === expected.userId &&
    sha256(link.providerAccountId) === expected.lineIdentitySha256;

  if (live.linkByCustomer) {
    return exactLink(live.linkByCustomer)
      ? { status: "already_exists", reason: "exact_link_present" }
      : { status: "conflict", reason: "customer_link_points_elsewhere" };
  }
  if (live.linkByIdentity) {
    return exactLink(live.linkByIdentity)
      ? { status: "already_exists", reason: "exact_link_present" }
      : { status: "conflict", reason: "line_identity_linked_elsewhere" };
  }
  return { status: "ready", reason: "all_guards_pass" };
}

async function loadState(db: Prisma.TransactionClient | PrismaClient, expected: SnapshotCandidate): Promise<LiveState> {
  const customer = await db.customer.findUnique({
    where: { id: expected.customerId },
    select: {
      id: true,
      storeId: true,
      userId: true,
      lineUserId: true,
      lineLinkStatus: true,
      mergedIntoCustomerId: true,
    },
  });
  const lineUserId = customer?.lineUserId ?? "__missing__";
  const [account, linkByCustomer, linkByIdentity] = await Promise.all([
    customer?.lineUserId
      ? db.account.findUnique({
          where: { provider_providerAccountId: { provider: "line", providerAccountId: lineUserId } },
          select: { userId: true, providerAccountId: true },
        })
      : null,
    db.customerIdentityLink.findUnique({
      where: { customerId: expected.customerId },
      select: { userId: true, storeId: true, customerId: true, provider: true, providerAccountId: true },
    }),
    customer?.lineUserId
      ? db.customerIdentityLink.findUnique({
          where: {
            uq_customer_identity_provider_store: {
              provider: "line",
              providerAccountId: lineUserId,
              storeId: expected.storeId,
            },
          },
          select: { userId: true, storeId: true, customerId: true, provider: true, providerAccountId: true },
        })
      : null,
  ]);
  return { customer, account, linkByCustomer, linkByIdentity };
}

function parsePositiveInt(flag: string): number | null {
  const arg = process.argv.find((value) => value.startsWith(`${flag}=`));
  if (!arg) return null;
  const value = Number(arg.slice(flag.length + 1));
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function parseRequiredFlag(flag: string): string | null {
  return process.argv.find((value) => value.startsWith(`${flag}=`))?.slice(flag.length + 1) ?? null;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const allowedFlags = new Set(["--execute"]);
  for (const arg of process.argv.slice(2)) {
    if (!allowedFlags.has(arg) && !arg.startsWith("--target-ref=") && !arg.startsWith("--max-writes=") && !arg.startsWith("--snapshot-count=") && !arg.startsWith("--snapshot-sha256=")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  const snapshotPath = process.env.IDENTITY_LINK_REPAIR_SNAPSHOT;
  if (!snapshotPath) throw new Error("IDENTITY_LINK_REPAIR_SNAPSHOT must point to the controlled local snapshot");
  const snapshotBytes = await readFile(snapshotPath);
  const approvedSnapshotSha256 = parseRequiredFlag("--snapshot-sha256");
  const actualSnapshotSha256 = createHash("sha256").update(snapshotBytes).digest("hex");
  if (!approvedSnapshotSha256 || actualSnapshotSha256 !== approvedSnapshotSha256) {
    throw new Error("Snapshot SHA-256 guard failed");
  }
  const snapshot = JSON.parse(snapshotBytes.toString("utf8")) as Snapshot;
  if (snapshot.version !== 1 || snapshot.candidateCount !== snapshot.candidates.length) {
    throw new Error("Snapshot metadata/count mismatch");
  }
  if (new Set(snapshot.candidates.map((c) => c.customerId)).size !== snapshot.candidateCount) {
    throw new Error("Snapshot contains duplicate customerId values");
  }

  const detectedRef = projectRefFromDatabaseUrl(process.env.DATABASE_URL);
  const targetRef = parseRequiredFlag("--target-ref");
  const maxWrites = parsePositiveInt("--max-writes");
  const snapshotCount = parsePositiveInt("--snapshot-count");
  if (
    detectedRef !== PRODUCTION_REF ||
    targetRef !== PRODUCTION_REF ||
    snapshot.sourceProjectRef !== PRODUCTION_REF
  ) {
    throw new Error(`Target guard failed: detected=${detectedRef ?? "unknown"}`);
  }
  if (maxWrites !== snapshot.candidateCount || snapshotCount !== snapshot.candidateCount) {
    throw new Error("Count guards failed: max writes and snapshot count must exactly match");
  }

  const prisma = new PrismaClient();
  const results: Result[] = [];
  let created = 0;
  try {
    for (const expected of snapshot.candidates) {
      try {
        if (!execute) {
          const check = classifyLiveState(expected, await loadState(prisma, expected));
          results.push({
            customerId: expected.customerId,
            status: check.status === "ready" ? "skipped" : check.status,
            reason: check.status === "ready" ? "dry_run_would_create" : check.reason,
          });
          continue;
        }

        const result = await prisma.$transaction(async (tx) => {
          const state = await loadState(tx, expected);
          const check = classifyLiveState(expected, state);
          if (check.status !== "ready") {
            const guardedResult: Pick<Result, "status" | "reason"> = {
              status: check.status,
              reason: check.reason,
            };
            return guardedResult;
          }
          const lineUserId = state.customer?.lineUserId;
          if (!lineUserId) return { status: "skipped" as const, reason: "line_state_changed" };
          const sync = await upsertCustomerIdentityLink({
            tx,
            userId: expected.userId,
            storeId: expected.storeId,
            customerId: expected.customerId,
            provider: "line",
            providerAccountId: lineUserId,
            lineUserId,
          });
          if (sync.status !== "upserted") throw new Error(`identity_link_service_${sync.status}`);
          return { status: "created" as const, reason: "created_in_serializable_transaction" };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        if (result.status === "created") created++;
        results.push({ customerId: expected.customerId, status: result.status, reason: result.reason });
      } catch (error) {
        results.push({
          customerId: expected.customerId,
          status: "failed",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  const summary = Object.fromEntries(
    (["created", "already_exists", "skipped", "conflict", "failed"] as ResultStatus[])
      .map((status) => [status, results.filter((r) => r.status === status).length]),
  );
  console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", targetRef: detectedRef, snapshotCount: snapshot.candidateCount, snapshotSha256: actualSnapshotSha256, maxWrites, created, summary, results }, null, 2));
  if (summary.conflict > 0 || summary.failed > 0) process.exitCode = 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
