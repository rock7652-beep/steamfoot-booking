/** Owner-authorized atomic execution for the exact final-25 no-OTP preview. */
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/normalize";

const prisma = new PrismaClient();
const expectedFingerprint = process.env.FINAL_25_EXPECTED_FINGERPRINT ?? "";
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const rebindReason = "LIFF_LOGIN_CHANNEL_MIGRATION_V1";
const captureReason = "LIFF_LOGIN_FIRST_CAPTURE_V1";
type Action = "FIRST_CAPTURE" | "CLEAN_EXTRA_AND_REBIND" | "ALIGN_LINK_AND_REBIND" | "READY_REBIND" | "STANDARD_ONBOARDING";

const expectedActions = new Map<string, Action>([
  ["cmrllha0l0002jp04wfd11hmq", "FIRST_CAPTURE"], ["cms39pn9n0002jr045bth6v4o", "FIRST_CAPTURE"],
  ["cms7hu8vh0007kz04c97qn1s0", "FIRST_CAPTURE"], ["cmrkkmpj50001jz047h6ml7ip", "FIRST_CAPTURE"],
  ["cmsnydfoa0001l404ef9962ti", "FIRST_CAPTURE"], ["cmscq288z0001l1045t3phc4o", "FIRST_CAPTURE"],
  ["cmrpxw8pp0001l104cvho2bav", "FIRST_CAPTURE"], ["cmsdzjyz40001l204t90i8925", "FIRST_CAPTURE"],
  ["cmoigppvt0001jr04h3i2p66r", "FIRST_CAPTURE"], ["cmojv9rkb0003jo04x6hfstuc", "FIRST_CAPTURE"],
  ["cmojy74oe0001jo04um0qb7at", "FIRST_CAPTURE"], ["cmsdg4w630002kz04q0166mvt", "FIRST_CAPTURE"],
  ["cmpujx2jj0002ji0426eoc4gc", "FIRST_CAPTURE"],
  ["cms933hkr0001k104ufe2q1pd", "CLEAN_EXTRA_AND_REBIND"], ["cmqwagvm10001l904qqvxry7y", "CLEAN_EXTRA_AND_REBIND"],
  ["cmrynwmum0001l604m852g5m6", "ALIGN_LINK_AND_REBIND"], ["cmruhq05e0002jf04j88frlpx", "ALIGN_LINK_AND_REBIND"],
  ["cmr5ta9zq0001js0447r8tsdb", "READY_REBIND"], ["cmqzhrsff0001l404tsaqlnd8", "READY_REBIND"], ["cmsfu4tei0001lf046glyq0fo", "READY_REBIND"],
  ["cmsujg46c0001jr049498w40a", "STANDARD_ONBOARDING"], ["cmsh1zfro0007jx04fxn3fxgy", "STANDARD_ONBOARDING"],
  ["cmshdvrcj0001l004kjylpms2", "STANDARD_ONBOARDING"], ["cmr42waoj0005jm04zc2uqil3", "STANDARD_ONBOARDING"],
  ["cmsq5vtqo0001if04on2s30bq", "STANDARD_ONBOARDING"],
]);

async function protectedFingerprint(tx: Prisma.TransactionClient, customerIds: string[]) {
  const rows = await tx.customer.findMany({ where: { id: { in: customerIds } }, orderBy: { id: "asc" }, select: {
    id: true, lineUserId: true, lineLinkStatus: true,
    planWallets: { orderBy: { id: "asc" }, select: { id: true, totalSessions: true, remainingSessions: true, status: true, expiryDate: true } },
    bookings: { orderBy: { id: "asc" }, select: { id: true, bookingStatus: true, customerPlanWalletId: true, reminderSent: true } },
    healthRecords: { orderBy: { id: "asc" }, select: { id: true, storeId: true, measuredAt: true } },
  } });
  return sha256(JSON.stringify(rows));
}

async function main() {
  if (!/^[a-f0-9]{64}$/.test(expectedFingerprint)) throw new Error("missing_expected_fingerprint");
  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const ids = [...expectedActions.keys()];
    const [customers, allCustomers, links, accounts, users, stores, requests, actor] = await Promise.all([
      tx.customer.findMany({ where: { id: { in: ids }, mergedIntoCustomerId: null, planWallets: { some: { status: "ACTIVE", remainingSessions: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] } } }, select: { id: true, storeId: true, name: true, phone: true, userId: true } }),
      tx.customer.findMany({ where: { mergedIntoCustomerId: null }, select: { id: true, storeId: true, phone: true } }),
      tx.customerIdentityLink.findMany({ where: { provider: "line" }, select: { id: true, storeId: true, customerId: true, userId: true, providerAccountId: true, lineUserId: true } }),
      tx.account.findMany({ where: { provider: "line" }, select: { id: true, userId: true, providerAccountId: true } }),
      tx.user.findMany({ where: { role: "CUSTOMER" }, select: { id: true, status: true, role: true, phone: true } }),
      tx.store.findMany({ select: { id: true, name: true, slug: true } }),
      tx.lineRebindRequest.findMany({ where: { customerId: { in: ids } }, select: { id: true, customerId: true } }),
      tx.user.findFirst({ where: { role: "ADMIN", status: "ACTIVE" }, orderBy: { id: "asc" }, select: { id: true } }),
    ]);
    if (!actor || customers.length !== 25 || requests.length !== 0) throw new Error("execution_snapshot_changed");
    const storeById = new Map(stores.map((store) => [store.id, store] as const));
    const userById = new Map(users.map((user) => [user.id, user] as const));
    const plans: Array<{ storeId: string; store: string; customerId: string; customerName: string; phoneHash: string; action: Action; userId: string | null; linkId: string | null; accountId: string | null; providerAccountId: string | null; providerAccountIdHash: string | null; extraAccountIds: string[]; requestId: null; requestMode: "CREATE" | "NONE" }> = [];
    for (const customer of customers) {
      const action = expectedActions.get(customer.id)!;
      const phone = normalizePhone(customer.phone);
      if (!/^09\d{8}$/.test(phone) || allCustomers.filter((item) => item.storeId === customer.storeId && normalizePhone(item.phone) === phone).length !== 1) throw new Error(`phone_changed:${customer.id}`);
      const customerLinks = links.filter((link) => link.customerId === customer.id);
      let userId: string | null = null, linkId: string | null = null, accountId: string | null = null, providerAccountId: string | null = null;
      let extraAccountIds: string[] = [];
      if (action === "FIRST_CAPTURE") {
        if (!customer.userId || userById.get(customer.userId)?.status !== "ACTIVE" || customerLinks.length !== 0 || accounts.some((account) => account.userId === customer.userId)) throw new Error(`first_capture_changed:${customer.id}`);
        userId = customer.userId;
      } else if (action === "STANDARD_ONBOARDING") {
        const activePhoneUsers = users.filter((user) => user.status === "ACTIVE" && user.phone && normalizePhone(user.phone) === phone);
        if (customer.userId || customerLinks.length !== 0 || activePhoneUsers.length !== 0) throw new Error(`onboarding_changed:${customer.id}`);
      } else {
        if (customerLinks.length !== 1) throw new Error(`link_changed:${customer.id}`);
        const link = customerLinks[0];
        userId = customer.userId ?? link.userId;
        if (link.userId !== userId || userById.get(userId)?.status !== "ACTIVE") throw new Error(`owner_changed:${customer.id}`);
        const userAccounts = accounts.filter((account) => account.userId === userId);
        linkId = link.id;
        if (action === "ALIGN_LINK_AND_REBIND") {
          if (customer.userId || userAccounts.length !== 1 || userAccounts[0].providerAccountId === link.providerAccountId ||
              links.some((other) => other.storeId === customer.storeId && other.id !== link.id && other.providerAccountId === userAccounts[0].providerAccountId) ||
              links.some((other) => other.providerAccountId === userAccounts[0].providerAccountId && other.userId !== userId)) throw new Error(`align_changed:${customer.id}`);
          accountId = userAccounts[0].id; providerAccountId = userAccounts[0].providerAccountId;
        } else {
          if (link.lineUserId !== link.providerAccountId) throw new Error(`link_identity_changed:${customer.id}`);
          const matching = userAccounts.filter((account) => account.providerAccountId === link.providerAccountId);
          const extras = userAccounts.filter((account) => account.providerAccountId !== link.providerAccountId);
          if (matching.length !== 1) throw new Error(`account_changed:${customer.id}`);
          accountId = matching[0].id; providerAccountId = link.providerAccountId;
          if (action === "READY_REBIND" && extras.length !== 0) throw new Error(`ready_changed:${customer.id}`);
          if (action === "CLEAN_EXTRA_AND_REBIND") {
            if (extras.length === 0 || extras.some((account) => links.some((other) => other.providerAccountId === account.providerAccountId))) throw new Error(`cleanup_changed:${customer.id}`);
            extraAccountIds = extras.map((account) => account.id).sort();
          }
        }
      }
      plans.push({ storeId: customer.storeId, store: storeById.get(customer.storeId)?.name ?? storeById.get(customer.storeId)?.slug ?? "unknown", customerId: customer.id, customerName: customer.name, phoneHash: sha256(phone), action, userId, linkId, accountId, providerAccountId, providerAccountIdHash: providerAccountId ? sha256(providerAccountId) : null, extraAccountIds, requestId: null, requestMode: action === "STANDARD_ONBOARDING" ? "NONE" : "CREATE" });
    }
    plans.sort((a, b) => a.store.localeCompare(b.store, "zh-TW") || a.customerName.localeCompare(b.customerName, "zh-TW"));
    const fingerprintRows = plans.map(({ store, customerName, providerAccountId, ...row }) => row);
    const fingerprint = sha256(JSON.stringify(fingerprintRows));
    if (fingerprint !== expectedFingerprint) throw new Error(`fingerprint_changed:${fingerprint}`);
    const beforeProtected = await protectedFingerprint(tx, ids);
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const actionCounts: Record<string, number> = {};
    for (const plan of plans) {
      if (plan.action === "ALIGN_LINK_AND_REBIND") {
        const oldLink = links.find((link) => link.id === plan.linkId)!;
        const updated = await tx.customerIdentityLink.updateMany({ where: { id: oldLink.id, userId: plan.userId!, storeId: plan.storeId, customerId: plan.customerId, provider: "line", providerAccountId: oldLink.providerAccountId, lineUserId: oldLink.lineUserId }, data: { providerAccountId: plan.providerAccountId!, lineUserId: plan.providerAccountId! } });
        if (updated.count !== 1) throw new Error(`align_compare_and_set:${plan.customerId}`);
      }
      if (plan.action === "CLEAN_EXTRA_AND_REBIND") {
        const removed = await tx.account.deleteMany({ where: { id: { in: plan.extraAccountIds }, userId: plan.userId!, provider: "line" } });
        if (removed.count !== plan.extraAccountIds.length) throw new Error(`cleanup_compare_and_set:${plan.customerId}`);
      }
      let requestId: string | null = null;
      if (plan.action !== "STANDARD_ONBOARDING") {
        const request = await tx.lineRebindRequest.create({ data: {
          storeId: plan.storeId, customerId: plan.customerId, createdByUserId: actor.id,
          reason: plan.action === "FIRST_CAPTURE" ? captureReason : rebindReason,
          phoneHash: plan.phoneHash, oldUserIdHash: plan.action === "FIRST_CAPTURE" ? null : plan.providerAccountIdHash,
          expiresAt,
        }, select: { id: true } });
        requestId = request.id;
      }
      await tx.auditLog.create({ data: { actorUserId: actor.id, targetType: "Customer", targetId: plan.customerId, action: `FINAL_25_NO_OTP_${plan.action}`, afterJson: { batchFingerprint: expectedFingerprint, requestId, userId: plan.userId, loginIdentityHash: plan.providerAccountIdHash, removedUnreferencedAccountIds: plan.extraAccountIds, customerMessagingIdentityPreserved: true, planBookingHealthPreserved: true } } });
      actionCounts[plan.action] = (actionCounts[plan.action] ?? 0) + 1;
    }
    const afterProtected = await protectedFingerprint(tx, ids);
    if (beforeProtected !== afterProtected) throw new Error("protected_data_changed");
    return { prepared: plans.length, actionCounts, expiresAt, fingerprint };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 90_000 });
  console.log(JSON.stringify({ status: "prepared", ...result }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "execution_failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
