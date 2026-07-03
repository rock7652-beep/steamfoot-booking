/**
 * merge-hsinchu-duplicate-customers.ts — one-off guarded merge script
 *
 * Purpose:
 *   Merge exactly one of the known Hsinchu duplicate-customer pairs after
 *   production preflight review. This script does not batch both pairs.
 *
 * Safety:
 *   - DRY RUN by default.
 *   - Writes require BOTH `DRY_RUN=0` and `CONFIRM_WRITE=1`.
 *   - `MERGE_CASE` is required and must be exactly `tang` or `jian`.
 *   - Customer IDs are hard-coded constants. TODO placeholders abort before
 *     any query that could mutate data.
 *   - Preflight guards run before dry-run reporting and again inside the
 *     production merge service transaction.
 *
 * Usage:
 *   # Dry-run one case
 *   MERGE_CASE=tang npx tsx scripts/merge-hsinchu-duplicate-customers.ts
 *
 *   # Apply one case only after review/sign-off
 *   MERGE_CASE=tang DRY_RUN=0 CONFIRM_WRITE=1 \
 *     OPERATOR_USER_ID="<User.id>" \
 *     npx tsx scripts/merge-hsinchu-duplicate-customers.ts
 *
 * This PR only adds the script. It does not execute production writes.
 */
import { PrismaClient } from "@prisma/client";
import { mergeCustomerIntoCustomer } from "../src/server/services/customer-merge";

const prisma = new PrismaClient();

type MergeCaseKey = "tang" | "jian";

type MergeCase = {
  key: MergeCaseKey;
  label: string;
  targetCustomerId: string;
  targetPhone: string;
  sourceCustomerId: string;
  sourcePhone: string;
};

const CASES: Record<MergeCaseKey, MergeCase> = {
  tang: {
    key: "tang",
    label: "唐春燕",
    targetCustomerId: "cmr4wqi0q0001l804x3g3f8zx",
    targetPhone: "0939668262",
    sourceCustomerId: "cmr4ulu180001lb042xt8mlrh",
    sourcePhone: "0939608262",
  },
  jian: {
    key: "jian",
    label: "簡貴",
    targetCustomerId: "cmr4pfds80002js042bf51uc0",
    targetPhone: "0902399233",
    sourceCustomerId: "cmr4jypzp0007ju04qruz758p",
    sourcePhone: "0933333333",
  },
};

const ALLOWED_STORE_SLUGS = new Set(["hsinchu", "zhubei"]);

const FORBIDDEN_FLAG_TOKENS = [
  "--force",
  "--skip-guards",
  "--skip-preflight",
  "--quick",
  "--batch",
  "--all",
  "--from-file",
  "--customer-id",
] as const;

const DRY_RUN = process.env.DRY_RUN !== "0";
const CONFIRM_WRITE = process.env.CONFIRM_WRITE === "1";
const OPERATOR_USER_ID = process.env.OPERATOR_USER_ID ?? "";
const MERGE_CASE = process.env.MERGE_CASE as MergeCaseKey | undefined;

function rejectForbiddenFlags(argv: readonly string[]) {
  for (const arg of argv) {
    for (const forbidden of FORBIDDEN_FLAG_TOKENS) {
      if (arg === forbidden || arg.startsWith(`${forbidden}=`)) {
        throw new Error(`Forbidden flag rejected: ${arg}`);
      }
    }
  }
}

function assertNoTodoIds(c: MergeCase) {
  const ids = [c.targetCustomerId, c.sourceCustomerId];
  for (const id of ids) {
    if (id.startsWith("TODO_")) {
      throw new Error(
        `Customer IDs are not filled for MERGE_CASE=${c.key}. Replace TODO constants before running.`,
      );
    }
  }
}

function dbHostFromUrl(raw: string | undefined): string {
  if (!raw) return "(DATABASE_URL not set)";
  try {
    const u = new URL(raw);
    return `${u.hostname}:${u.port || "(default)"} db=${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function maskId(id: string | null | undefined): string {
  if (!id) return "(none)";
  if (id.length <= 8) return `${id.slice(0, 4)}...`;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function countSummaryToString(counts: Record<string, number>) {
  return Object.entries(counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

async function countCustomerRelations(customerId: string) {
  const [
    bookings,
    transactions,
    customerPlanWallets,
    walletSessions,
    makeupCredits,
    bookingMakeupCredits,
    pointRecords,
    messageLogs,
    checkinPosts,
    talentStageLogs,
    referralEventsAsCustomer,
    referralEventsAsReferrer,
    customerFollowUps,
    customerIdentityLinks,
    referralsAsReferrer,
    referralsAsConverted,
    sponsoredCustomers,
  ] = await Promise.all([
    prisma.booking.count({ where: { customerId } }),
    prisma.transaction.count({ where: { customerId } }),
    prisma.customerPlanWallet.count({ where: { customerId } }),
    prisma.walletSession.count({ where: { wallet: { customerId } } }),
    prisma.makeupCredit.count({ where: { customerId } }),
    prisma.bookingMakeupCredit.count({ where: { customerId } }),
    prisma.pointRecord.count({ where: { customerId } }),
    prisma.messageLog.count({ where: { customerId } }),
    prisma.checkinPost.count({ where: { customerId } }),
    prisma.talentStageLog.count({ where: { customerId } }),
    prisma.referralEvent.count({ where: { customerId } }),
    prisma.referralEvent.count({ where: { referrerId: customerId } }),
    prisma.customerFollowUp.count({ where: { customerId } }),
    prisma.customerIdentityLink.count({ where: { customerId } }),
    prisma.referral.count({ where: { referrerId: customerId } }),
    prisma.referral.count({ where: { convertedCustomerId: customerId } }),
    prisma.customer.count({ where: { sponsorId: customerId } }),
  ]);

  return {
    bookings,
    transactions,
    customerPlanWallets,
    walletSessions,
    makeupCredits,
    bookingMakeupCredits,
    pointRecords,
    messageLogs,
    checkinPosts,
    talentStageLogs,
    referralEventsAsCustomer,
    referralEventsAsReferrer,
    customerFollowUps,
    customerIdentityLinks,
    referralsAsReferrer,
    referralsAsConverted,
    sponsoredCustomers,
  };
}

type CustomerPreflight = NonNullable<Awaited<ReturnType<typeof loadCustomer>>>;

async function loadCustomer(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phone: true,
      storeId: true,
      userId: true,
      lineUserId: true,
      lineLinkStatus: true,
      healthProfileId: true,
      healthLinkStatus: true,
      mergedIntoCustomerId: true,
      mergedAt: true,
      selfBookingEnabled: true,
      createdAt: true,
      updatedAt: true,
      store: { select: { id: true, slug: true, name: true } },
    },
  });
}

async function findPointRecordConflicts(sourceId: string, targetId: string) {
  const [sourceRecords, targetRecords] = await Promise.all([
    prisma.pointRecord.findMany({
      where: {
        customerId: sourceId,
        sourceType: { not: null },
        sourceKey: { not: null },
      },
      select: { id: true, sourceType: true, sourceKey: true },
    }),
    prisma.pointRecord.findMany({
      where: {
        customerId: targetId,
        sourceType: { not: null },
        sourceKey: { not: null },
      },
      select: { id: true, sourceType: true, sourceKey: true },
    }),
  ]);

  const targetByKey = new Map<string, string>();
  for (const record of targetRecords) {
    targetByKey.set(`${record.sourceType}\u0000${record.sourceKey}`, record.id);
  }

  return sourceRecords
    .map((source) => ({
      sourcePointRecordId: source.id,
      targetPointRecordId: targetByKey.get(`${source.sourceType}\u0000${source.sourceKey}`),
      sourceType: source.sourceType,
      sourceKey: source.sourceKey,
    }))
    .filter((row) => row.targetPointRecordId != null);
}

function plannedIdentityFields(source: CustomerPreflight, target: CustomerPreflight) {
  const fields: string[] = [];
  if (target.userId == null && source.userId != null) fields.push("userId");
  if (target.lineUserId == null && source.lineUserId != null) fields.push("lineUserId");
  if (target.healthProfileId == null && source.healthProfileId != null) fields.push("healthProfileId");
  if (target.healthLinkStatus === "unlinked" && source.healthLinkStatus !== "unlinked") {
    fields.push("healthLinkStatus");
  }
  return fields;
}

async function runPreflight(c: MergeCase) {
  const [target, source] = await Promise.all([
    loadCustomer(c.targetCustomerId),
    loadCustomer(c.sourceCustomerId),
  ]);

  if (!target) throw new Error(`Target customer not found: ${c.targetCustomerId}`);
  if (!source) throw new Error(`Source customer not found: ${c.sourceCustomerId}`);

  const failures: string[] = [];
  if (target.phone !== c.targetPhone) failures.push(`target phone mismatch: ${target.phone}`);
  if (source.phone !== c.sourcePhone) failures.push(`source phone mismatch: ${source.phone}`);
  if (target.storeId !== source.storeId) failures.push(`store mismatch: ${target.storeId} vs ${source.storeId}`);
  if (!ALLOWED_STORE_SLUGS.has(target.store.slug)) failures.push(`unexpected store slug: ${target.store.slug}`);
  if (target.mergedIntoCustomerId != null) failures.push(`target already merged into ${target.mergedIntoCustomerId}`);
  if (source.mergedIntoCustomerId != null) failures.push(`source already merged into ${source.mergedIntoCustomerId}`);
  if (target.lineUserId != null && source.lineUserId != null && target.lineUserId !== source.lineUserId) {
    failures.push("target/source have different lineUserId");
  }
  if (target.userId != null && source.userId != null && target.userId !== source.userId) {
    failures.push("target/source have different userId");
  }

  const [targetIdentityLinks, sourceIdentityLinks, pointConflicts, targetCounts, sourceCounts] =
    await Promise.all([
      prisma.customerIdentityLink.count({ where: { customerId: target.id } }),
      prisma.customerIdentityLink.count({ where: { customerId: source.id } }),
      findPointRecordConflicts(source.id, target.id),
      countCustomerRelations(target.id),
      countCustomerRelations(source.id),
    ]);

  if (targetIdentityLinks > 0 && sourceIdentityLinks > 0) {
    failures.push("target/source both have CustomerIdentityLink");
  }
  if (targetIdentityLinks > 1 || sourceIdentityLinks > 1) {
    failures.push("CustomerIdentityLink count anomaly");
  }
  if (pointConflicts.length > 0) {
    failures.push(`PointRecord unique conflicts: ${pointConflicts.length}`);
  }

  return {
    target,
    source,
    targetCounts,
    sourceCounts,
    targetIdentityLinks,
    sourceIdentityLinks,
    pointConflicts,
    plannedIdentityFields: plannedIdentityFields(source, target),
    failures,
  };
}

function printCustomer(label: string, c: CustomerPreflight) {
  console.log(
    `  ${label}: id=${maskId(c.id)} name=${c.name} phone=${c.phone} ` +
      `store=${c.store.slug}/${c.store.name} user=${maskId(c.userId)} ` +
      `line=${c.lineLinkStatus}/${maskId(c.lineUserId)} ` +
      `health=${c.healthLinkStatus}/${maskId(c.healthProfileId)} ` +
      `mergedInto=${maskId(c.mergedIntoCustomerId)}`,
  );
}

async function main() {
  rejectForbiddenFlags(process.argv.slice(2));

  if (!MERGE_CASE || !(MERGE_CASE in CASES)) {
    throw new Error("Set MERGE_CASE=tang or MERGE_CASE=jian. This script never runs both cases together.");
  }

  const c = CASES[MERGE_CASE];
  assertNoTodoIds(c);

  if (!DRY_RUN && !CONFIRM_WRITE) {
    throw new Error("Write refused: set CONFIRM_WRITE=1 together with DRY_RUN=0 after review/sign-off.");
  }
  if (!DRY_RUN && !OPERATOR_USER_ID) {
    throw new Error("Write refused: OPERATOR_USER_ID is required for merge audit context.");
  }

  console.log(`===== Hsinchu duplicate customer merge (${c.label}) =====`);
  console.log(`mode=${DRY_RUN ? "DRY_RUN" : "APPLY"} case=${c.key}`);
  console.log(`DATABASE_URL: ${dbHostFromUrl(process.env.DATABASE_URL)}`);
  console.log(`DIRECT_URL:   ${dbHostFromUrl(process.env.DIRECT_URL)}\n`);

  const preflight = await runPreflight(c);

  console.log("Preflight customers:");
  printCustomer("target", preflight.target);
  printCustomer("source", preflight.source);
  console.log();

  console.log("Preflight relation counts:");
  console.log(`  target: ${countSummaryToString(preflight.targetCounts)}`);
  console.log(`  source: ${countSummaryToString(preflight.sourceCounts)}`);
  console.log();

  console.log("Preflight collision checks:");
  console.log(`  target CustomerIdentityLink count: ${preflight.targetIdentityLinks}`);
  console.log(`  source CustomerIdentityLink count: ${preflight.sourceIdentityLinks}`);
  console.log(`  PointRecord unique conflicts: ${preflight.pointConflicts.length}`);
  for (const conflict of preflight.pointConflicts) {
    console.log(
      `    - source=${maskId(conflict.sourcePointRecordId)} target=${maskId(conflict.targetPointRecordId)} ` +
        `sourceType=${conflict.sourceType} sourceKey=${conflict.sourceKey}`,
    );
  }
  console.log();

  console.log("Planned merge report:");
  console.log(`  source -> target: ${maskId(preflight.source.id)} -> ${maskId(preflight.target.id)}`);
  console.log(`  planned movedCounts: ${countSummaryToString(preflight.sourceCounts)}`);
  console.log(
    `  planned mergedIdentityFields: ${
      preflight.plannedIdentityFields.length > 0 ? preflight.plannedIdentityFields.join(", ") : "(none)"
    }`,
  );
  console.log();

  if (preflight.failures.length > 0) {
    console.log("Preflight failures:");
    for (const failure of preflight.failures) console.log(`  - ${failure}`);
    throw new Error("Preflight failed; no merge was executed.");
  }

  if (DRY_RUN) {
    console.log("DRY RUN complete — no writes executed.");
    console.log("To apply after review: MERGE_CASE=<case> DRY_RUN=0 CONFIRM_WRITE=1 OPERATOR_USER_ID=<User.id> npx tsx scripts/merge-hsinchu-duplicate-customers.ts");
    return;
  }

  console.log("Applying merge via mergeCustomerIntoCustomer()...");
  const outcome = await mergeCustomerIntoCustomer({
    sourceCustomerId: preflight.source.id,
    targetCustomerId: preflight.target.id,
    performedByUserId: OPERATOR_USER_ID,
  });

  const sourceAfter = await loadCustomer(preflight.source.id);
  if (!sourceAfter) {
    throw new Error("Unexpected: source customer missing after merge.");
  }

  console.log("Merge outcome:");
  console.log(`  targetId: ${maskId(outcome.targetId)}`);
  console.log(`  sourceId: ${maskId(outcome.sourceId)}`);
  console.log(`  movedCounts: ${countSummaryToString(outcome.movedCounts)}`);
  console.log(
    `  mergedIdentityFields: ${
      outcome.mergedIdentityFields.length > 0 ? outcome.mergedIdentityFields.join(", ") : "(none)"
    }`,
  );
  console.log(`  mergedAt: ${outcome.mergedAt.toISOString()}`);
  console.log("Source archive status:");
  console.log(`  mergedIntoCustomerId: ${maskId(sourceAfter.mergedIntoCustomerId)}`);
  console.log(`  mergedAt: ${sourceAfter.mergedAt?.toISOString() ?? "(none)"}`);
  console.log(`  selfBookingEnabled: ${sourceAfter.selfBookingEnabled}`);
  console.log(`  lineLinkStatus: ${sourceAfter.lineLinkStatus}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
