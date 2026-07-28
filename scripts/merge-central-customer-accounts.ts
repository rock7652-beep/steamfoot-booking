import { prisma } from "../src/lib/db";

/**
 * Safely consolidate a duplicate CUSTOMER login into an existing central member.
 *
 * This does not merge Customer rows or operational records. The selected Customer
 * remains in its original store; only its legacy userId and login Accounts move to
 * the already-verified central User.
 *
 * Dry run (default):
 * SOURCE_USER_ID=... TARGET_USER_ID=... CUSTOMER_ID=... ACTOR_USER_ID=... \
 * EXPECTED_CURRENT_NAME=... NEW_CUSTOMER_NAME=... npx tsx scripts/merge-central-customer-accounts.ts
 *
 * Apply (all confirmations are required):
 * CONFIRM_WRITE=1 CONFIRM_SOURCE_USER_ID=... CONFIRM_TARGET_USER_ID=... \
 * SOURCE_USER_ID=... TARGET_USER_ID=... CUSTOMER_ID=... ACTOR_USER_ID=... \
 * EXPECTED_CURRENT_NAME=... NEW_CUSTOMER_NAME=... npx tsx scripts/merge-central-customer-accounts.ts
 */

const input = {
  sourceUserId: process.env.SOURCE_USER_ID?.trim() ?? "",
  targetUserId: process.env.TARGET_USER_ID?.trim() ?? "",
  customerId: process.env.CUSTOMER_ID?.trim() ?? "",
  actorUserId: process.env.ACTOR_USER_ID?.trim() ?? "",
  expectedCurrentName: process.env.EXPECTED_CURRENT_NAME?.trim() ?? "",
  newCustomerName: process.env.NEW_CUSTOMER_NAME?.trim() ?? "",
};

const confirmWrite = process.env.CONFIRM_WRITE === "1";
const confirmedSource = process.env.CONFIRM_SOURCE_USER_ID?.trim() ?? "";
const confirmedTarget = process.env.CONFIRM_TARGET_USER_ID?.trim() ?? "";

function maskId(value: string): string {
  return value.length <= 10 ? "********" : `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function fail(message: string): never {
  throw new Error(`mergeCentralCustomerAccounts: ${message}`);
}

for (const [key, value] of Object.entries(input)) {
  if (!value) fail(`${key} is required`);
}
if (input.sourceUserId === input.targetUserId) fail("source and target users must differ");
if (
  confirmWrite &&
  (confirmedSource !== input.sourceUserId || confirmedTarget !== input.targetUserId)
) {
  fail("write confirmation IDs do not exactly match source and target");
}

async function inspect() {
  const [source, target, customer, actor, sourceCustomers, sourceLinks, sourceStaff] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: input.sourceUserId },
        include: { accounts: true, sessions: { select: { id: true } } },
      }),
      prisma.user.findUnique({
        where: { id: input.targetUserId },
        include: { accounts: true },
      }),
      prisma.customer.findUnique({
        where: { id: input.customerId },
        include: { identityLinks: true, store: { select: { id: true, slug: true } } },
      }),
      prisma.user.findUnique({
        where: { id: input.actorUserId },
        select: { id: true, role: true, status: true },
      }),
      prisma.customer.findMany({
        where: { userId: input.sourceUserId },
        select: { id: true },
      }),
      prisma.customerIdentityLink.count({ where: { userId: input.sourceUserId } }),
      prisma.staff.count({ where: { userId: input.sourceUserId } }),
    ]);

  if (!source || !target || !customer || !actor) fail("source, target, customer, or actor not found");
  if (source.role !== "CUSTOMER" || target.role !== "CUSTOMER") fail("both users must be CUSTOMER");
  if (source.status !== "ACTIVE" || target.status !== "ACTIVE") fail("both users must be ACTIVE before merge");
  if (actor.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(actor.role)) {
    fail("actor must be an active ADMIN or OWNER");
  }
  if (customer.userId !== source.id) fail("customer is not owned by the source user");
  if (customer.mergedIntoCustomerId !== null) fail("customer is already archived as merged");
  if (customer.name !== input.expectedCurrentName) fail("customer name no longer matches the approved precondition");
  if (sourceCustomers.length !== 1 || sourceCustomers[0]?.id !== customer.id) {
    fail("source user must own exactly the selected customer");
  }
  if (sourceLinks !== 0) fail("source user still owns central identity links");
  if (sourceStaff !== 0) fail("source user has a staff identity");

  const verifiedLinks = customer.identityLinks.filter((link) => link.userId === target.id);
  if (verifiedLinks.length === 0) fail("customer has no verified central link to target user");
  if (verifiedLinks.some((link) => link.storeId !== customer.storeId)) {
    fail("identity link store does not match customer store");
  }

  for (const link of verifiedLinks) {
    const targetAccountExists = target.accounts.some(
      (account) =>
        account.provider === link.provider &&
        account.providerAccountId === link.providerAccountId,
    );
    if (!targetAccountExists) fail(`target is missing verified ${link.provider} account`);
  }

  if (source.accounts.length === 0) fail("source user has no login account to preserve");
  for (const account of source.accounts) {
    const duplicate = target.accounts.some(
      (candidate) =>
        candidate.provider === account.provider &&
        candidate.providerAccountId === account.providerAccountId,
    );
    if (duplicate) fail(`target already contains source ${account.provider} account`);
  }

  return { source, target, customer };
}

async function main() {
  const state = await inspect();
  console.info("[mergeCentralCustomerAccounts] preflight passed", {
    mode: confirmWrite ? "WRITE" : "DRY_RUN",
    sourceUserId: maskId(state.source.id),
    targetUserId: maskId(state.target.id),
    customerId: maskId(state.customer.id),
    storeSlug: state.customer.store.slug,
    accountsToMove: state.source.accounts.length,
    sessionsToRevoke: state.source.sessions.length,
  });

  if (!confirmWrite) return;

  await prisma.$transaction(async (tx) => {
    // Re-lock and re-check the three mutable ownership boundaries immediately
    // before writing. Serializable prevents concurrent login/link changes from
    // being silently absorbed into this repair.
    const [source, target, customer] = await Promise.all([
      tx.user.findUnique({ where: { id: input.sourceUserId }, include: { accounts: true } }),
      tx.user.findUnique({ where: { id: input.targetUserId }, include: { accounts: true } }),
      tx.customer.findUnique({
        where: { id: input.customerId },
        include: { identityLinks: true },
      }),
    ]);
    if (!source || !target || !customer) fail("rows changed after preflight");
    if (source.status !== "ACTIVE" || target.status !== "ACTIVE") fail("user status changed after preflight");
    if (customer.userId !== source.id || customer.name !== input.expectedCurrentName) {
      fail("customer ownership or name changed after preflight");
    }
    if (!customer.identityLinks.some((link) => link.userId === target.id)) {
      fail("verified target link changed after preflight");
    }

    await tx.session.deleteMany({ where: { userId: source.id } });
    await tx.account.updateMany({ where: { userId: source.id }, data: { userId: target.id } });
    await tx.customer.update({
      where: { id: customer.id },
      data: { userId: null, name: input.newCustomerName },
    });
    await tx.user.update({
      where: { id: source.id },
      data: {
        status: "SUSPENDED",
        passwordHash: null,
        email: null,
        phone: null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        targetType: "User",
        targetId: target.id,
        action: "MERGE_DUPLICATE_CUSTOMER_ACCOUNT",
        beforeJson: {
          sourceUserId: source.id,
          targetUserId: target.id,
          customerId: customer.id,
          storeId: customer.storeId,
          sourceAccountCount: source.accounts.length,
        },
        afterJson: {
          sourceUserId: source.id,
          targetUserId: target.id,
          customerId: customer.id,
          sourceStatus: "SUSPENDED",
          sessionsRevoked: true,
          legacyCustomerUserIdCleared: true,\n          operationalCustomerRowsMoved: false,
        },
      },
    });
  }, { isolationLevel: "Serializable" });

  console.info("[mergeCentralCustomerAccounts] merge completed", {
    sourceUserId: maskId(input.sourceUserId),
    targetUserId: maskId(input.targetUserId),
    customerId: maskId(input.customerId),
  });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
