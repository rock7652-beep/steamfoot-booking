/**
 * scripts/repair-line-mismatch-pr-f2-2.ts — DRY RUN default, single-record only
 *
 * PR-F2.2: SECOND (and FINAL within current scope) per-record repair of a
 * `needs_customer_merge` LINE account-mismatch in store=zhubei. Strict
 * conformance to docs/pr-f2-line-mismatch-repair-plan.md (PR #221, merged).
 *
 * ## Target record
 *
 * Background: the original PR-F1.2 audit listed 3 account-mismatch records
 * in zhubei. After PR-F2.1 (#222) applied + verified the first
 * `needs_customer_merge` (cmojgm****), production read-only audit returns
 * only 2 records:
 *
 *   [1] cmojyo**** — needs_customer_merge   (THIS SCRIPT'S TARGET)
 *         C side: 13 bookings / 17 transactions / 5 wallets (4 active) /
 *                 48 wallet sessions — real customer footprint
 *         A side: placeholder shell (hasPwd=false, 0 footprint everywhere)
 *         PR-F1.2 classify() output:
 *           primary=customer / shell=account / canReassignSafely=true /
 *           account.customer=shell_merge_deactivate /
 *           recommendation=needs_customer_merge / cross-store distinct=1
 *
 *   [2] cmojv9**** — needs_manual_business_check   (OUT OF SCOPE)
 *         A side has password (live login), not a placeholder shell.
 *         Excluded from the entire PR-F2 repair series until store-owner +
 *         business sign-off per PR-F2.0 §5.
 *
 * This script targets the cmojyo**** record — the LARGER-footprint of the
 * two original `needs_customer_merge` candidates. PR-F2.1 deliberately took
 * the smaller (cmojgm****) first as a low-blast-radius dry-run of the
 * pattern; F2.2 now applies the SAME proven pattern with ZERO logic
 * changes, only different hard-coded constants. The script body below is
 * functionally identical to PR-F2.1's; the only differences vs F2.1 are:
 *   - the 8 constants in the hard-coded block (lines below)
 *   - the script filename / target-record docblock above
 *   - the regex in `runDirectly` at the very bottom
 *
 * ## Safety
 *
 *   - **DRY RUN is the default**. To apply, the operator must:
 *       1. set `OPERATOR_USER_ID` env var (the User.id of the human running
 *          the script; persisted into AuditLog.actorUserId per §6.1)
 *       2. explicitly pass `--apply` on argv
 *     Missing either → ABORT before any write.
 *
 *   - **19 pre-flight invariants** (I1-I13 + F1-F4 + X1 + A1) per
 *     PR-F2.0 §2; any failure → ABORT outside tx. Re-validated inside
 *     a Serializable transaction before any write (defence vs race
 *     between dry-run inspection and apply).
 *
 *   - **AuditLog append-only** (§2.4 / §6.1): on apply, writes 4 rows
 *     (L0 summary + L1/L2/L3 detail). Never deletes or mutates prior
 *     APPLY rows. Rollback script (separate PR) appends a fifth
 *     `LINE_MISMATCH_REPAIR_ROLLBACK` row pointing at L0.id; that future
 *     ROLLBACK row, once present, allows this script's A1 invariant to
 *     treat L0 as closed and re-pass pre-flight.
 *
 *   - **Forbidden flags** explicitly rejected (PR-F2.0 §3.1 / §4):
 *     --force, --skip-invariants, --quick, --batch, --all, --from-file,
 *     --customer-id, --all-needs-customer-merge. No loop, no batch, no
 *     dynamic-id override — the 6 ID constants are hard-coded.
 *
 *   - **Mask-only logging**: cuids via maskId(), phone via maskPhone(),
 *     LINE userId via maskLineUserId(). Constants block holds raw values
 *     for the I4/X1 invariants but they are never echoed to stdout.
 *
 * ## Usage
 *
 *   # DRY RUN (default) — read 19 invariants, print plan, exit 0
 *   DATABASE_URL="$DIRECT_URL?connection_limit=1" \
 *     npx tsx scripts/repair-line-mismatch-pr-f2-2.ts
 *
 *   # APPLY — must be done in a SEPARATE invocation after reviewer sign-off
 *   DATABASE_URL="$DIRECT_URL?connection_limit=1" \
 *     OPERATOR_USER_ID="<reviewer-User.id>" \
 *     npx tsx scripts/repair-line-mismatch-pr-f2-2.ts --apply
 *
 * This PR (PR-F2.2) only commits the script. It does NOT execute --apply
 * against production.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { maskId, maskLineUserId, maskPhone } from "../src/lib/line-bind-log";

// ── Hard-coded constants (PR-F2.0 §3.1, §4) ───────────────────────────
// Filled by the one-shot fill helper (clone of PR-F2.1's pattern, targeting
// cmojyo**** instead of cmojgm****); see commit message. Raw phone / raw
// lineUserId never echoed to stdout — printPlan uses masked helpers.
// Reviewer audit reads constants directly from PR diff.
const CANONICAL_CUSTOMER_ID   = "cmojyou870001l704jvfj672l";
const CANONICAL_USER_ID       = "cmny015v60000jp04or0t6bws";
const PLACEHOLDER_CUSTOMER_ID = "cmozpv9mv0002jr04drmw0s6d";
const PLACEHOLDER_USER_ID     = "cmozpv9lq0000jr04dqnm1nf0";
const LINE_ACCOUNT_ID         = "cmozpv9nh0004jr0447mxivtb";
const CANONICAL_STORE_ID      = "e182e256-98ca-4c78-970b-d4b118066c51";
const CANONICAL_STORE_SLUG    = "zhubei";
const CANONICAL_PHONE         = "0918493505";
const LINE_USER_ID            = "U917d0d9f78960b276a5371568264ba61";

// AuditLog action constants — must match PR-F2.0 §6.1 L0..L3 column.
const ACTION_APPLY              = "LINE_MISMATCH_REPAIR_APPLY";
const ACTION_REASSIGN_ACCOUNT   = "LINE_MISMATCH_REPAIR_REASSIGN_ACCOUNT";
const ACTION_MERGE_PLACEHOLDER  = "LINE_MISMATCH_REPAIR_MERGE_PLACEHOLDER";
const ACTION_SUSPEND_ORPHAN     = "LINE_MISMATCH_REPAIR_SUSPEND_ORPHAN";
const ACTION_ROLLBACK           = "LINE_MISMATCH_REPAIR_ROLLBACK";

// ── Argv gate (PR-F2.0 §3.1 / §4) ─────────────────────────────────────
// Defensively reject any flag that would broaden scope or relax checks.
// These are EXACTLY the patterns PR-F2.0 forbids; do not soften.
export const FORBIDDEN_FLAG_TOKENS = [
  "--force",
  "--skip-invariants",
  "--quick",
  "--batch",
  "--all",
  "--from-file",
  "--customer-id",
  "--all-needs-customer-merge",
] as const;

export function rejectForbiddenFlags(argv: readonly string[]): string | null {
  for (const arg of argv) {
    for (const f of FORBIDDEN_FLAG_TOKENS) {
      if (arg === f || arg.startsWith(f + "=")) return arg;
    }
  }
  return null;
}

const APPLY = process.argv.includes("--apply");

// ── Types ─────────────────────────────────────────────────────────────

export type PreState = {
  canonicalCustomer: {
    id: string;
    storeId: string;
    userId: string | null;
    phone: string;
    lineUserId: string | null;
    lineLinkStatus: string;
    mergedIntoCustomerId: string | null;
  };
  placeholderCustomer: {
    id: string;
    storeId: string;
    userId: string | null;
    phone: string;
    lineUserId: string | null;
    lineLinkStatus: string;
    mergedIntoCustomerId: string | null;
    selfBookingEnabled: boolean;
  };
  placeholderUser: {
    id: string;
    status: string;
    passwordHash: string | null;
  };
  lineAccount: {
    id: string;
    userId: string;
    provider: string;
    providerAccountId: string;
  };
  canonicalSide: {
    bookings: number;
    transactions: number;
    walletsActive: number;
  };
  placeholderSide: {
    bookings: number;
    transactions: number;
    walletsTotal: number;
    walletSessions: number;
    points: number;
    messages: number;
    checkins: number;
    makeupCredits: number;
    sponsored: number;
    referralsMade: number;
    otherAccounts: number;
  };
  crossStoreDistinctStoreCount: number;
  rollback: {
    applyRowIds: string[];
    rolledBackApplyIds: Set<string>;
    activeApplyCount: number;
  };
};

export type InvariantResult = {
  name: string;
  pass: boolean;
  observed: string;
};

/**
 * Subset of the hard-coded constants that the pure invariant checks need.
 * Threading them through as an argument keeps `runInvariants` pure and
 * lets tests exercise FAIL paths without sharing prod ID strings.
 */
export type InvariantConstants = {
  CANONICAL_USER_ID: string;
  PLACEHOLDER_USER_ID: string;
  CANONICAL_PHONE: string;
  LINE_USER_ID: string;
};

// ── Pre-state load (read-only) ────────────────────────────────────────

async function loadPreState(
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<PreState> {
  const [
    canonicalCustomer,
    placeholderCustomer,
    placeholderUser,
    lineAccount,
    canonicalBookings,
    canonicalTransactions,
    canonicalWalletsActive,
    placeholderBookings,
    placeholderTransactions,
    placeholderWalletsTotal,
    placeholderWalletSessions,
    placeholderPoints,
    placeholderMessages,
    placeholderCheckins,
    placeholderMakeupCredits,
    placeholderSponsored,
    placeholderReferralsMade,
    placeholderOtherAccounts,
    crossStoreRows,
    applyRows,
    rollbackRows,
  ] = await Promise.all([
    client.customer.findUnique({
      where: { id: CANONICAL_CUSTOMER_ID },
      select: {
        id: true, storeId: true, userId: true, phone: true,
        lineUserId: true, lineLinkStatus: true, mergedIntoCustomerId: true,
      },
    }),
    client.customer.findUnique({
      where: { id: PLACEHOLDER_CUSTOMER_ID },
      select: {
        id: true, storeId: true, userId: true, phone: true,
        lineUserId: true, lineLinkStatus: true, mergedIntoCustomerId: true,
        selfBookingEnabled: true,
      },
    }),
    client.user.findUnique({
      where: { id: PLACEHOLDER_USER_ID },
      select: { id: true, status: true, passwordHash: true },
    }),
    client.account.findUnique({
      where: { id: LINE_ACCOUNT_ID },
      select: { id: true, userId: true, provider: true, providerAccountId: true },
    }),
    client.booking.count({ where: { customerId: CANONICAL_CUSTOMER_ID } }),
    client.transaction.count({ where: { customerId: CANONICAL_CUSTOMER_ID } }),
    client.customerPlanWallet.count({
      where: { customerId: CANONICAL_CUSTOMER_ID, status: "ACTIVE" },
    }),
    client.booking.count({ where: { customerId: PLACEHOLDER_CUSTOMER_ID } }),
    client.transaction.count({ where: { customerId: PLACEHOLDER_CUSTOMER_ID } }),
    client.customerPlanWallet.count({ where: { customerId: PLACEHOLDER_CUSTOMER_ID } }),
    client.walletSession.count({
      where: { wallet: { customerId: PLACEHOLDER_CUSTOMER_ID } },
    }),
    client.pointRecord.count({ where: { customerId: PLACEHOLDER_CUSTOMER_ID } }),
    client.messageLog.count({ where: { customerId: PLACEHOLDER_CUSTOMER_ID } }),
    client.checkinPost.count({ where: { customerId: PLACEHOLDER_CUSTOMER_ID } }),
    client.makeupCredit.count({ where: { customerId: PLACEHOLDER_CUSTOMER_ID } }),
    client.customer.count({ where: { sponsorId: PLACEHOLDER_CUSTOMER_ID } }),
    client.referral.count({ where: { referrerId: PLACEHOLDER_CUSTOMER_ID } }),
    client.account.count({
      where: { userId: PLACEHOLDER_USER_ID, NOT: { id: LINE_ACCOUNT_ID } },
    }),
    // X1 cross-store: distinct stores carrying this lineUserId in non-merged
    // Customer rows. Length === 1 ⇒ single-store; > 1 ⇒ ABORT.
    client.customer.findMany({
      where: { lineUserId: LINE_USER_ID, mergedIntoCustomerId: null },
      select: { storeId: true },
      distinct: ["storeId"],
    }),
    // A1: existing APPLY rows for this canonical Customer.
    client.auditLog.findMany({
      where: {
        targetType: "Customer",
        targetId: CANONICAL_CUSTOMER_ID,
        action: ACTION_APPLY,
      },
      select: { id: true },
    }),
    // A1: existing ROLLBACK rows for this canonical Customer (used to
    // identify which APPLYs are closed and may therefore be ignored).
    client.auditLog.findMany({
      where: {
        targetType: "Customer",
        targetId: CANONICAL_CUSTOMER_ID,
        action: ACTION_ROLLBACK,
      },
      select: { beforeJson: true },
    }),
  ]);

  // Build the rolled-back APPLY-id set from each rollback row's
  // beforeJson.summaryRef.id (shape recorded by §6.4 W4').
  const rolledBackApplyIds = new Set<string>();
  for (const r of rollbackRows) {
    const ref = (r.beforeJson as { summaryRef?: { id?: string } } | null)?.summaryRef?.id;
    if (typeof ref === "string" && ref.length > 0) rolledBackApplyIds.add(ref);
  }
  const applyRowIds = applyRows.map((r) => r.id);
  const activeApplyCount = applyRowIds.filter((id) => !rolledBackApplyIds.has(id)).length;

  return {
    canonicalCustomer: canonicalCustomer ?? throwMissing("canonicalCustomer"),
    placeholderCustomer: placeholderCustomer ?? throwMissing("placeholderCustomer"),
    placeholderUser: placeholderUser ?? throwMissing("placeholderUser"),
    lineAccount: lineAccount ?? throwMissing("lineAccount"),
    canonicalSide: {
      bookings: canonicalBookings,
      transactions: canonicalTransactions,
      walletsActive: canonicalWalletsActive,
    },
    placeholderSide: {
      bookings: placeholderBookings,
      transactions: placeholderTransactions,
      walletsTotal: placeholderWalletsTotal,
      walletSessions: placeholderWalletSessions,
      points: placeholderPoints,
      messages: placeholderMessages,
      checkins: placeholderCheckins,
      makeupCredits: placeholderMakeupCredits,
      sponsored: placeholderSponsored,
      referralsMade: placeholderReferralsMade,
      otherAccounts: placeholderOtherAccounts,
    },
    crossStoreDistinctStoreCount: crossStoreRows.length,
    rollback: { applyRowIds, rolledBackApplyIds, activeApplyCount },
  };
}

function throwMissing(label: string): never {
  throw new Error(
    `ABORT: pre-state row missing for ${label}; the constants at the top of ` +
      `this script no longer match production data. Re-run PR-F1.2 audit and ` +
      `regenerate the constants before retrying.`,
  );
}

// ── Invariant checks (pure, testable) ─────────────────────────────────

/**
 * Runs all 19 invariants from PR-F2.0 §2 and returns one InvariantResult
 * per check. Pure: does no I/O. Tests can pass crafted PreState shapes
 * (no DB) and crafted constants to exercise FAIL paths without sharing
 * production IDs.
 */
export function runInvariants(
  pre: PreState,
  c: InvariantConstants,
): InvariantResult[] {
  const results: InvariantResult[] = [];
  const push = (name: string, pass: boolean, observed: string) =>
    results.push({ name, pass, observed });

  // §2.1 Identity invariants (13)
  push(
    "I1",
    pre.canonicalCustomer.userId === c.CANONICAL_USER_ID,
    `canonicalCustomer.userId=${maskId(pre.canonicalCustomer.userId)}`,
  );
  push(
    "I2",
    pre.canonicalCustomer.lineUserId === c.LINE_USER_ID,
    `canonicalCustomer.lineUserId=${maskLineUserId(pre.canonicalCustomer.lineUserId)}`,
  );
  push(
    "I3",
    pre.canonicalCustomer.lineLinkStatus === "LINKED",
    `canonicalCustomer.lineLinkStatus=${pre.canonicalCustomer.lineLinkStatus}`,
  );
  push(
    "I4",
    pre.canonicalCustomer.phone === c.CANONICAL_PHONE,
    `canonicalCustomer.phone=${maskPhone(pre.canonicalCustomer.phone)}`,
  );
  push(
    "I5",
    pre.canonicalCustomer.mergedIntoCustomerId === null,
    `canonicalCustomer.mergedIntoCustomerId=${maskId(pre.canonicalCustomer.mergedIntoCustomerId)}`,
  );
  push(
    "I6",
    pre.placeholderCustomer.userId === c.PLACEHOLDER_USER_ID,
    `placeholderCustomer.userId=${maskId(pre.placeholderCustomer.userId)}`,
  );
  push(
    "I7",
    pre.placeholderCustomer.mergedIntoCustomerId === null,
    `placeholderCustomer.mergedIntoCustomerId=${maskId(pre.placeholderCustomer.mergedIntoCustomerId)}`,
  );
  push(
    "I8",
    pre.placeholderCustomer.lineUserId === null,
    `placeholderCustomer.lineUserId=${maskLineUserId(pre.placeholderCustomer.lineUserId)}`,
  );
  push(
    "I9",
    pre.placeholderCustomer.storeId === pre.canonicalCustomer.storeId,
    `placeholderCustomer.storeId=${maskId(pre.placeholderCustomer.storeId)} canonicalCustomer.storeId=${maskId(pre.canonicalCustomer.storeId)}`,
  );
  push(
    "I10",
    pre.placeholderCustomer.phone.startsWith("_oauth_line_"),
    `placeholderCustomer.phone.startsWith="_oauth_line_": ${pre.placeholderCustomer.phone.startsWith("_oauth_line_")}`,
  );
  push(
    "I11",
    pre.lineAccount.provider === "line" &&
      pre.lineAccount.providerAccountId === c.LINE_USER_ID &&
      pre.lineAccount.userId === c.PLACEHOLDER_USER_ID,
    `lineAccount.provider=${pre.lineAccount.provider} providerAccountId=${maskLineUserId(pre.lineAccount.providerAccountId)} userId=${maskId(pre.lineAccount.userId)}`,
  );
  push(
    "I12",
    pre.placeholderUser.passwordHash === null,
    `placeholderUser.passwordHash=${pre.placeholderUser.passwordHash === null ? "null" : "(set)"}`,
  );
  push(
    "I13",
    pre.placeholderUser.status !== "SUSPENDED",
    `placeholderUser.status=${pre.placeholderUser.status}`,
  );

  // §2.2 Footprint invariants (4)
  push(
    "F1",
    pre.canonicalSide.bookings >= 1,
    `canonical.bookings=${pre.canonicalSide.bookings}`,
  );
  push(
    "F2",
    pre.canonicalSide.transactions >= 1 || pre.canonicalSide.walletsActive >= 1,
    `canonical.transactions=${pre.canonicalSide.transactions} canonical.walletsActive=${pre.canonicalSide.walletsActive}`,
  );
  push(
    "F3",
    pre.placeholderSide.bookings === 0 &&
      pre.placeholderSide.walletsTotal === 0 &&
      pre.placeholderSide.walletSessions === 0 &&
      pre.placeholderSide.transactions === 0 &&
      pre.placeholderSide.points === 0 &&
      pre.placeholderSide.messages === 0 &&
      pre.placeholderSide.checkins === 0 &&
      pre.placeholderSide.makeupCredits === 0 &&
      pre.placeholderSide.sponsored === 0 &&
      pre.placeholderSide.referralsMade === 0,
    `placeholder.{bookings=${pre.placeholderSide.bookings},wallets=${pre.placeholderSide.walletsTotal},sessions=${pre.placeholderSide.walletSessions},tx=${pre.placeholderSide.transactions},pts=${pre.placeholderSide.points},msg=${pre.placeholderSide.messages},checkins=${pre.placeholderSide.checkins},makeup=${pre.placeholderSide.makeupCredits},sponsored=${pre.placeholderSide.sponsored},referrals=${pre.placeholderSide.referralsMade}}`,
  );
  push(
    "F4",
    pre.placeholderSide.otherAccounts === 0,
    `placeholder.otherAccounts=${pre.placeholderSide.otherAccounts}`,
  );

  // §2.3 Cross-store invariant (1)
  push(
    "X1",
    pre.crossStoreDistinctStoreCount === 1,
    `distinctStores=${pre.crossStoreDistinctStoreCount}`,
  );

  // §2.4 Idempotency invariant (1) — active = APPLY rows minus rolled-back
  push(
    "A1",
    pre.rollback.activeApplyCount === 0,
    `activeApplyCount=${pre.rollback.activeApplyCount} (apply=${pre.rollback.applyRowIds.length} rolledBack=${pre.rollback.rolledBackApplyIds.size})`,
  );

  return results;
}

// ── Plan printing (masked) ────────────────────────────────────────────

function maskHost(url: string | undefined): string {
  if (!url) return "(unset)";
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "(default)"} db=${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(unparseable)";
  }
}

function printPlan(pre: PreState): void {
  console.log("\n──── Plan (masked) ────");
  console.log(`  CANONICAL_CUSTOMER_ID   = ${maskId(CANONICAL_CUSTOMER_ID)}`);
  console.log(`  CANONICAL_USER_ID       = ${maskId(CANONICAL_USER_ID)}`);
  console.log(`  PLACEHOLDER_CUSTOMER_ID = ${maskId(PLACEHOLDER_CUSTOMER_ID)}`);
  console.log(`  PLACEHOLDER_USER_ID     = ${maskId(PLACEHOLDER_USER_ID)}`);
  console.log(`  LINE_ACCOUNT_ID         = ${maskId(LINE_ACCOUNT_ID)}`);
  console.log(`  CANONICAL_STORE_SLUG    = ${CANONICAL_STORE_SLUG}`);
  console.log(`  CANONICAL_PHONE         = ${maskPhone(CANONICAL_PHONE)}`);
  console.log(`  LINE_USER_ID            = ${maskLineUserId(LINE_USER_ID)}`);
  console.log();
  console.log("  W1 Account.userId       :",
    `${maskId(pre.lineAccount.userId)} → ${maskId(CANONICAL_USER_ID)}`);
  console.log("  W2 Customer[placeholder]:");
  console.log("       mergedIntoCustomerId:",
    `${maskId(pre.placeholderCustomer.mergedIntoCustomerId)} → ${maskId(CANONICAL_CUSTOMER_ID)}`);
  console.log("       mergedAt           :", "null → <now()>");
  console.log("       userId             :",
    `${maskId(pre.placeholderCustomer.userId)} → null`);
  console.log("       selfBookingEnabled :",
    `${pre.placeholderCustomer.selfBookingEnabled} → false`);
  console.log("       lineLinkStatus     :",
    `${pre.placeholderCustomer.lineLinkStatus} → UNLINKED`);
  console.log("  W3 User[placeholder]    :",
    `status ${pre.placeholderUser.status} → SUSPENDED`);
  console.log("  W4 AuditLog             : +4 rows (L0 summary + L1 + L2 + L3)");
}

// ── AuditLog writes (in-tx) ───────────────────────────────────────────

function maskedSnapshot() {
  return {
    canonical: {
      customerId: maskId(CANONICAL_CUSTOMER_ID),
      userId: maskId(CANONICAL_USER_ID),
      phone: maskPhone(CANONICAL_PHONE),
    },
    placeholder: {
      customerId: maskId(PLACEHOLDER_CUSTOMER_ID),
      userId: maskId(PLACEHOLDER_USER_ID),
    },
    lineAccount: { id: maskId(LINE_ACCOUNT_ID) },
    lineUserId: maskLineUserId(LINE_USER_ID),
    storeSlug: CANONICAL_STORE_SLUG,
  };
}

async function writeAuditL0(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  pre: PreState,
  invariantResults: InvariantResult[],
): Promise<{ id: string }> {
  const snapshot = maskedSnapshot();
  const row = await tx.auditLog.create({
    data: {
      actorUserId,
      targetType: "Customer",
      targetId: CANONICAL_CUSTOMER_ID,
      action: ACTION_APPLY,
      beforeJson: {
        snapshot,
        classification: {
          recommendation: "needs_customer_merge",
          primarySide: "customer",
          shellSide: "account",
          canReassignSafely: true,
          accountCustomerDisposition: "shell_merge_deactivate",
        },
        invariants: invariantResults.map((r) => ({
          name: r.name,
          pass: r.pass,
          observed: r.observed,
        })),
        crossStoreDistinctStoreCount: pre.crossStoreDistinctStoreCount,
      },
      // L0.afterJson is intentionally the same shape; verification step
      // re-reads and confirms invariants are satisfied post-apply.
      afterJson: { snapshot, note: "afterJson written symmetrically; verifyPostState reads canonical state" },
    },
    select: { id: true },
  });
  return row;
}

async function writeAuditL1(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  summaryId: string,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorUserId,
      targetType: "Account",
      targetId: LINE_ACCOUNT_ID,
      action: ACTION_REASSIGN_ACCOUNT,
      beforeJson: {
        userId: maskId(PLACEHOLDER_USER_ID),
        provider: "line",
        providerAccountId: maskLineUserId(LINE_USER_ID),
        linkedSummaryId: summaryId,
      },
      afterJson: {
        userId: maskId(CANONICAL_USER_ID),
        provider: "line",
        providerAccountId: maskLineUserId(LINE_USER_ID),
        linkedSummaryId: summaryId,
      },
    },
  });
}

async function writeAuditL2(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  summaryId: string,
  pre: PreState,
  appliedAt: Date,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorUserId,
      targetType: "Customer",
      targetId: PLACEHOLDER_CUSTOMER_ID,
      action: ACTION_MERGE_PLACEHOLDER,
      beforeJson: {
        userId: maskId(pre.placeholderCustomer.userId),
        mergedIntoCustomerId: maskId(pre.placeholderCustomer.mergedIntoCustomerId),
        mergedAt: null,
        selfBookingEnabled: pre.placeholderCustomer.selfBookingEnabled,
        lineLinkStatus: pre.placeholderCustomer.lineLinkStatus,
        lineUserId: maskLineUserId(pre.placeholderCustomer.lineUserId),
      },
      afterJson: {
        userId: null,
        mergedIntoCustomerId: maskId(CANONICAL_CUSTOMER_ID),
        mergedAt: appliedAt.toISOString(),
        selfBookingEnabled: false,
        lineLinkStatus: "UNLINKED",
        lineUserId: maskLineUserId(pre.placeholderCustomer.lineUserId),
        linkedSummaryId: summaryId,
      },
    },
  });
}

async function writeAuditL3(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  summaryId: string,
  pre: PreState,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorUserId,
      targetType: "User",
      targetId: PLACEHOLDER_USER_ID,
      action: ACTION_SUSPEND_ORPHAN,
      beforeJson: { status: pre.placeholderUser.status },
      afterJson: { status: "SUSPENDED", linkedSummaryId: summaryId },
    },
  });
}

// ── Write groups W1/W2/W3 (in-tx) ─────────────────────────────────────

async function applyW1(tx: Prisma.TransactionClient): Promise<void> {
  // Account.userId: PLACEHOLDER_USER_ID → CANONICAL_USER_ID
  await tx.account.update({
    where: { id: LINE_ACCOUNT_ID },
    data: { userId: CANONICAL_USER_ID },
  });
}

async function applyW2(
  tx: Prisma.TransactionClient,
  appliedAt: Date,
): Promise<void> {
  // Customer[placeholder]:
  //   mergedIntoCustomerId: null → CANONICAL_CUSTOMER_ID
  //   mergedAt:              null → now
  //   userId:                PLACEHOLDER_USER_ID → null
  //   selfBookingEnabled:     ? → false
  //   lineLinkStatus:         ? → UNLINKED
  await tx.customer.update({
    where: { id: PLACEHOLDER_CUSTOMER_ID },
    data: {
      mergedIntoCustomerId: CANONICAL_CUSTOMER_ID,
      mergedAt: appliedAt,
      userId: null,
      selfBookingEnabled: false,
      lineLinkStatus: "UNLINKED",
      // NOTE: lineUserId stays null (per I8); not touched.
    },
  });
}

async function applyW3(tx: Prisma.TransactionClient): Promise<void> {
  // User[placeholder].status: ACTIVE → SUSPENDED
  await tx.user.update({
    where: { id: PLACEHOLDER_USER_ID },
    data: { status: "SUSPENDED" },
  });
}

// ── Post-apply verify (outside tx, read-only) ─────────────────────────

async function verifyPostState(): Promise<void> {
  const post = await loadPreState();
  // After apply, the Account should now reference CANONICAL_USER_ID.
  // Confirm + report; this is observation, not enforcement.
  console.log("\n──── Post-apply verify (read-only) ────");
  console.log(`  Account.userId       = ${maskId(post.lineAccount.userId)} (expected ${maskId(CANONICAL_USER_ID)})`);
  console.log(`  Customer[placeholder].mergedIntoCustomerId = ${maskId(post.placeholderCustomer.mergedIntoCustomerId)}`);
  console.log(`  Customer[placeholder].userId               = ${maskId(post.placeholderCustomer.userId)}`);
  console.log(`  Customer[placeholder].selfBookingEnabled   = ${post.placeholderCustomer.selfBookingEnabled}`);
  console.log(`  Customer[placeholder].lineLinkStatus       = ${post.placeholderCustomer.lineLinkStatus}`);
  console.log(`  User[placeholder].status                   = ${post.placeholderUser.status}`);
  console.log(`  AuditLog rows for canonical Customer       = ${post.rollback.applyRowIds.length} APPLY`);
}

// ── main ──────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("===== PR-F2.2 LINE account-mismatch repair (DRY RUN default) =====\n");
  console.log(`DATABASE_URL host: ${maskHost(process.env.DATABASE_URL)}`);
  console.log(`DIRECT_URL   host: ${maskHost(process.env.DIRECT_URL)}\n`);

  // Reject forbidden flags before any DB call.
  const forbidden = rejectForbiddenFlags(process.argv.slice(2));
  if (forbidden) {
    console.error(
      `ABORT: forbidden flag ${forbidden}; this script is strictly single-record, ` +
        "single-cycle, hard-coded-IDs. Re-run without the flag, or use a separate " +
        "PR for a different record.",
    );
    process.exit(2);
  }

  // 1. Pre-flight read
  console.log("──── Pre-flight (outside tx, read-only) ────");
  const pre = await loadPreState();

  // 1a. Constants-consistency sanity check (not one of the 19 invariants).
  //     Catches the "copy-pasted STORE_ID from another record's PR" mistake:
  //     if the canonical Customer we just loaded doesn't sit in the store this
  //     script was built for, abort BEFORE invariants run so the failure
  //     message points at the real problem.
  if (pre.canonicalCustomer.storeId !== CANONICAL_STORE_ID) {
    console.error(
      `ABORT: canonicalCustomer.storeId=${maskId(pre.canonicalCustomer.storeId)} ` +
        `does not match CANONICAL_STORE_ID=${maskId(CANONICAL_STORE_ID)}. ` +
        "Constants drift detected — script was likely built for a different record.",
    );
    process.exit(1);
  }

  // 2. Run 19 invariants
  const invariantConstants: InvariantConstants = {
    CANONICAL_USER_ID,
    PLACEHOLDER_USER_ID,
    CANONICAL_PHONE,
    LINE_USER_ID,
  };
  const results = runInvariants(pre, invariantConstants);
  for (const r of results) {
    console.log(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name}: ${r.observed}`);
  }
  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) {
    console.error(
      `\nABORT: ${failed.length} invariant(s) failed: ${failed.map((r) => r.name).join(", ")}`,
    );
    process.exit(1);
  }
  console.log(`\nAll ${results.length} invariants PASS.`);

  // 3. Print plan
  printPlan(pre);

  // 4. Dry-run exit gate
  if (!APPLY) {
    console.log(
      "\nDRY RUN — 沒有寫入。To apply, re-run after reviewer sign-off with:\n" +
        "  OPERATOR_USER_ID=<reviewer-User.id> npx tsx scripts/repair-line-mismatch-pr-f2-2.ts --apply",
    );
    return;
  }

  // 5. Apply gate: require explicit OPERATOR_USER_ID for AuditLog.actorUserId
  const operatorUserId = process.env.OPERATOR_USER_ID;
  if (!operatorUserId) {
    console.error(
      "ABORT: OPERATOR_USER_ID env var required for --apply (AuditLog.actorUserId " +
        "must be a real human reviewer's User.id; bot / system users are not " +
        "acceptable per PR-F2.0 §6.1).",
    );
    process.exit(2);
  }

  // 6. Apply in Serializable tx; re-check invariants in-tx; write W1/W2/W3 + L0..L3
  const appliedAt = new Date();
  const summaryId = await prisma.$transaction(
    async (tx) => {
      const inTx = await loadPreState(tx);
      const inTxResults = runInvariants(inTx, invariantConstants);
      const inTxFailed = inTxResults.filter((r) => !r.pass);
      if (inTxFailed.length > 0) {
        throw new Error(
          `in-tx invariant(s) FAILED (race detected between dry-run and apply): ${inTxFailed
            .map((r) => r.name)
            .join(", ")}`,
        );
      }

      const summary = await writeAuditL0(tx, operatorUserId, inTx, inTxResults);
      await applyW1(tx);
      await writeAuditL1(tx, operatorUserId, summary.id);
      await applyW2(tx, appliedAt);
      await writeAuditL2(tx, operatorUserId, summary.id, inTx, appliedAt);
      await applyW3(tx);
      await writeAuditL3(tx, operatorUserId, summary.id, inTx);

      return summary.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  console.log(`\nAPPLY OK — AuditLog summary id: ${summaryId}`);

  // 7. Post-apply verify
  await verifyPostState();
}

// Only connect to DB when invoked directly (not when imported by tests).
const runDirectly =
  !!process.argv[1] && /repair-line-mismatch-pr-f2-2/.test(process.argv[1]);

if (runDirectly) {
  main()
    .catch((err) => {
      console.error("[repair-line-mismatch-pr-f2-2] failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
