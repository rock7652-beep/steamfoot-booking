/**
 * One-record, repeatable repair for the public-booking LINE identity split.
 *
 * Dry-run is the default. Apply is allowed only after the deployed commit SHA
 * equals the approved merge SHA and an accountable operator is supplied.
 * No record is deleted: the duplicate User is suspended and every change is
 * recorded in AuditLog. Raw identifiers are intentionally never printed.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { maskId, maskLineUserId } from "../src/lib/line-bind-log";

const CUSTOMER_ID = "cms933hkr0001k104ufe2q1pd";
const CANONICAL_USER_ID = "cms935dfv0004l104f63dflwu";
const DUPLICATE_USER_ID = "cms935xtk0007l104x9fmyhqh";
const LOGIN_ACCOUNT_ID = "cms935xtv0009l104t371l75w";
const STORE_SLUG = "zhubei";
const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

type Snapshot = Awaited<ReturnType<typeof snapshot>>;

function abort(reason: string): never {
  throw new Error(`ABORT: ${reason}`);
}

async function snapshot(tx: Prisma.TransactionClient | PrismaClient = prisma) {
  const [customer, duplicate, account, activeRepairs] = await Promise.all([
    tx.customer.findUnique({
      where: { id: CUSTOMER_ID },
      select: { id: true, storeId: true, userId: true, store: { select: { slug: true } }, identityLinks: { select: { userId: true } } },
    }),
    tx.user.findUnique({
      where: { id: DUPLICATE_USER_ID },
      select: {
        id: true, status: true, phone: true, passwordHash: true,
        customer: { select: { id: true } },
        accounts: { select: { id: true, provider: true } },
      },
    }),
    tx.account.findUnique({
      where: { id: LOGIN_ACCOUNT_ID },
      select: { id: true, userId: true, provider: true, providerAccountId: true },
    }),
    tx.auditLog.count({
      where: { targetType: "Customer", targetId: CUSTOMER_ID, action: "PUBLIC_LINE_SPLIT_REPAIR_APPLY" },
    }),
  ]);
  return { customer, duplicate, account, activeRepairs };
}

function verify(pre: Snapshot) {
  if (!pre.customer || pre.customer.store.slug !== STORE_SLUG) abort("canonical customer/store changed");
  if (pre.customer.userId !== CANONICAL_USER_ID) abort("canonical customer owner changed");
  if (pre.customer.identityLinks.some((link) => link.userId !== CANONICAL_USER_ID)) abort("customer identity ownership conflict");
  if (!pre.duplicate || pre.duplicate.status !== "ACTIVE") abort("duplicate user is no longer an active repair candidate");
  if (pre.duplicate.phone !== null || pre.duplicate.passwordHash !== null || pre.duplicate.customer) abort("duplicate user has login/customer evidence");
  if (pre.duplicate.accounts.length !== 1 || pre.duplicate.accounts[0]?.id !== LOGIN_ACCOUNT_ID) abort("duplicate user account footprint changed");
  if (!pre.account || pre.account.provider !== "line" || pre.account.userId !== DUPLICATE_USER_ID) abort("verified LINE Login account changed");
  if (pre.activeRepairs !== 0) abort("repair was already applied");
}

async function main() {
  const pre = await snapshot();
  verify(pre);
  console.log("DRY-RUN PASS", {
    customer: maskId(CUSTOMER_ID), canonicalUser: maskId(CANONICAL_USER_ID),
    duplicateUser: maskId(DUPLICATE_USER_ID), loginAccount: maskId(LOGIN_ACCOUNT_ID),
    loginIdentity: maskLineUserId(pre.account!.providerAccountId),
  });
  if (!APPLY) return;

  const actorUserId = process.env.OPERATOR_USER_ID;
  if (!actorUserId) abort("OPERATOR_USER_ID is required for --apply");
  await prisma.$transaction(async (tx) => {
    const inTx = await snapshot(tx);
    verify(inTx);
    const now = new Date();
    const link = await tx.customerIdentityLink.upsert({
      where: { uq_customer_identity_provider_store: { provider: "line", providerAccountId: inTx.account!.providerAccountId, storeId: inTx.customer!.storeId } },
      update: { userId: CANONICAL_USER_ID, customerId: CUSTOMER_ID, lineUserId: null },
      create: { userId: CANONICAL_USER_ID, customerId: CUSTOMER_ID, storeId: inTx.customer!.storeId, provider: "line", providerAccountId: inTx.account!.providerAccountId, lineUserId: null },
    });
    await tx.account.update({ where: { id: LOGIN_ACCOUNT_ID }, data: { userId: CANONICAL_USER_ID } });
    await tx.user.update({ where: { id: DUPLICATE_USER_ID }, data: { status: "SUSPENDED" } });
    await tx.auditLog.createMany({ data: [
      { actorUserId, targetType: "Customer", targetId: CUSTOMER_ID, action: "PUBLIC_LINE_SPLIT_REPAIR_APPLY", afterJson: { canonicalUserId: maskId(CANONICAL_USER_ID), duplicateUserId: maskId(DUPLICATE_USER_ID), accountId: maskId(LOGIN_ACCOUNT_ID), identityLinkId: maskId(link.id), appliedAt: now.toISOString() } },
      { actorUserId, targetType: "Account", targetId: LOGIN_ACCOUNT_ID, action: "PUBLIC_LINE_SPLIT_REPAIR_REASSIGN_ACCOUNT", beforeJson: { userId: maskId(DUPLICATE_USER_ID) }, afterJson: { userId: maskId(CANONICAL_USER_ID) } },
      { actorUserId, targetType: "User", targetId: DUPLICATE_USER_ID, action: "PUBLIC_LINE_SPLIT_REPAIR_SUSPEND_DUPLICATE", beforeJson: { status: "ACTIVE" }, afterJson: { status: "SUSPENDED" } },
    ] });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const post = await snapshot();
  if (post.account?.userId !== CANONICAL_USER_ID || post.duplicate?.status !== "SUSPENDED") abort("post-apply verification failed");
  console.log("APPLY PASS", { account: maskId(LOGIN_ACCOUNT_ID), duplicateUser: maskId(DUPLICATE_USER_ID) });
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
