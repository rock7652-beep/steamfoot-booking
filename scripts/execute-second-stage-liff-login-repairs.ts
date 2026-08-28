/** Owner-authorized second-stage LIFF login structural repair. */
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/normalize";

const prisma = new PrismaClient();
const expectedCount = Number(process.env.SECOND_STAGE_EXPECTED_COUNT ?? "0");
const expectedFingerprint = process.env.SECOND_STAGE_EXPECTED_FINGERPRINT ?? "";
const rebindReason = "LIFF_LOGIN_CHANNEL_MIGRATION_V1";
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
type RepairAction = "CREATE_LINK_FROM_ACCOUNT" | "ALIGN_LINK_TO_ACCOUNT" | "CREATE_ACCOUNT_FROM_LINK" | "ATTACH_CUSTOMER_TO_PHONE_USER_AND_CREATE_LINK" | "ATTACH_CUSTOMER_TO_PHONE_USER";

async function main() {
  if (expectedCount < 1 || !/^[a-f0-9]{64}$/.test(expectedFingerprint)) throw new Error("missing_expected_snapshot");
  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const [stores, activePlanCustomers, allCustomers, links, accounts, users, rebindRequests, actor] = await Promise.all([
      tx.store.findMany({ select: { id: true, name: true, slug: true } }),
      tx.customer.findMany({
        where: { mergedIntoCustomerId: null, planWallets: { some: { status: "ACTIVE", remainingSessions: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] } } },
        select: { id: true, storeId: true, name: true, phone: true, userId: true, user: { select: { id: true, status: true, role: true } } },
      }),
      tx.customer.findMany({ where: { mergedIntoCustomerId: null }, select: { id: true, storeId: true, phone: true, userId: true } }),
      tx.customerIdentityLink.findMany({ where: { provider: "line" }, select: { id: true, storeId: true, customerId: true, userId: true, providerAccountId: true, lineUserId: true } }),
      tx.account.findMany({ where: { provider: "line" }, select: { id: true, userId: true, providerAccountId: true } }),
      tx.user.findMany({ where: { role: "CUSTOMER", status: "ACTIVE" }, select: { id: true, phone: true } }),
      tx.lineRebindRequest.findMany({ select: { id: true, customerId: true, reason: true, status: true, expiresAt: true, candidate: { select: { id: true } } } }),
      tx.user.findFirst({ where: { role: "ADMIN", status: "ACTIVE" }, orderBy: { id: "asc" }, select: { id: true } }),
    ]);
    if (!actor) throw new Error("active_admin_not_found");
    const storeById = new Map(stores.map((store) => [store.id, store] as const));
    const phoneCounts = new Map<string, number>();
    for (const customer of allCustomers) {
      const key = `${customer.storeId}:${normalizePhone(customer.phone)}`;
      phoneCounts.set(key, (phoneCounts.get(key) ?? 0) + 1);
    }
    const usersByPhone = new Map<string, typeof users>();
    for (const user of users) {
      const phone = user.phone ? normalizePhone(user.phone) : "";
      if (!phone) continue;
      const rows = usersByPhone.get(phone) ?? [];
      rows.push(user);
      usersByPhone.set(phone, rows);
    }
    const repairable: Array<{
      storeId: string; store: string; customerId: string; customerName: string; phoneHash: string;
      action: RepairAction; userId: string; accountId: string | null; linkId: string | null;
      providerAccountId: string; providerAccountIdHash: string; rebindRequestId: string | null;
      rebindRequestMode: "ACTIVE" | "REUSABLE" | "CREATE";
    }> = [];
    const addRepair = (customer: typeof activePlanCustomers[number], action: RepairAction, userId: string, accountId: string | null, linkId: string | null, providerAccountId: string) => {
      const existingRequest = rebindRequests.find((request) => request.customerId === customer.id);
      const activeRequest = existingRequest && ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"].includes(existingRequest.status) && existingRequest.expiresAt > now ? existingRequest : null;
      if ((activeRequest && activeRequest.reason !== rebindReason) || (existingRequest?.candidate && !activeRequest)) return;
      repairable.push({
        storeId: customer.storeId,
        store: storeById.get(customer.storeId)?.name ?? storeById.get(customer.storeId)?.slug ?? "unknown",
        customerId: customer.id,
        customerName: customer.name,
        phoneHash: sha256(normalizePhone(customer.phone)),
        action, userId, accountId, linkId, providerAccountId,
        providerAccountIdHash: sha256(providerAccountId),
        rebindRequestId: existingRequest?.id ?? null,
        rebindRequestMode: activeRequest ? "ACTIVE" : existingRequest ? "REUSABLE" : "CREATE",
      });
    };

    for (const customer of activePlanCustomers) {
      const phone = normalizePhone(customer.phone);
      if (!/^09\d{8}$/.test(phone) || (phoneCounts.get(`${customer.storeId}:${phone}`) ?? 0) !== 1) continue;
      const customerLinks = links.filter((link) => link.storeId === customer.storeId && link.customerId === customer.id);
      if (customer.userId && customer.user?.id === customer.userId && customer.user.status === "ACTIVE" && customer.user.role === "CUSTOMER") {
        const userAccounts = accounts.filter((account) => account.userId === customer.userId);
        const linksForUser = customerLinks.filter((link) => link.userId === customer.userId);
        if (linksForUser.length === 1 && userAccounts.length === 1 && linksForUser[0].providerAccountId === userAccounts[0].providerAccountId && linksForUser[0].lineUserId === linksForUser[0].providerAccountId) continue;
        if (userAccounts.length === 1 && linksForUser.length <= 1 && customerLinks.length === linksForUser.length) {
          const account = userAccounts[0];
          const conflict = links.some((link) => link.providerAccountId === account.providerAccountId && (link.userId !== customer.userId || (link.storeId === customer.storeId && link.customerId !== customer.id)));
          if (!conflict) {
            addRepair(customer, linksForUser.length === 0 ? "CREATE_LINK_FROM_ACCOUNT" : "ALIGN_LINK_TO_ACCOUNT", customer.userId, account.id, linksForUser[0]?.id ?? null, account.providerAccountId);
            continue;
          }
        }
        if (userAccounts.length === 0 && linksForUser.length === 1 && customerLinks.length === 1) {
          const link = linksForUser[0];
          if (!accounts.some((account) => account.providerAccountId === link.providerAccountId) && !links.some((other) => other.providerAccountId === link.providerAccountId && other.id !== link.id) && link.lineUserId === link.providerAccountId) {
            addRepair(customer, "CREATE_ACCOUNT_FROM_LINK", customer.userId, null, link.id, link.providerAccountId);
          }
        }
        continue;
      }
      const phoneUsers = usersByPhone.get(phone) ?? [];
      if (phoneUsers.length !== 1) continue;
      const targetUser = phoneUsers[0];
      if (allCustomers.some((other) => other.storeId === customer.storeId && other.id !== customer.id && other.userId === targetUser.id)) continue;
      const userAccounts = accounts.filter((account) => account.userId === targetUser.id);
      if (userAccounts.length !== 1) continue;
      const account = userAccounts[0];
      if (links.some((link) => link.providerAccountId === account.providerAccountId && (link.userId !== targetUser.id || (link.storeId === customer.storeId && link.customerId !== customer.id)))) continue;
      if (customerLinks.length === 0) addRepair(customer, "ATTACH_CUSTOMER_TO_PHONE_USER_AND_CREATE_LINK", targetUser.id, account.id, null, account.providerAccountId);
      else if (customerLinks.length === 1 && customerLinks[0].userId === targetUser.id && customerLinks[0].providerAccountId === account.providerAccountId) addRepair(customer, "ATTACH_CUSTOMER_TO_PHONE_USER", targetUser.id, account.id, customerLinks[0].id, account.providerAccountId);
    }

    repairable.sort((a, b) => a.store.localeCompare(b.store, "zh-TW") || a.customerName.localeCompare(b.customerName, "zh-TW") || a.action.localeCompare(b.action));
    const fingerprintRows = repairable.map((row) => ({
      storeId: row.storeId, customerId: row.customerId, action: row.action, userId: row.userId,
      accountId: row.accountId, linkId: row.linkId, phoneHash: row.phoneHash, providerAccountIdHash: row.providerAccountIdHash,
      rebindRequestId: row.rebindRequestId, rebindRequestMode: row.rebindRequestMode,
    }));
    const fingerprint = sha256(JSON.stringify(fingerprintRows));
    if (repairable.length !== expectedCount || fingerprint !== expectedFingerprint) throw new Error(`snapshot_changed:${repairable.length}:${fingerprint}`);

    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const actionCounts: Record<string, number> = {};
    for (const row of repairable) {
      if (row.action === "CREATE_LINK_FROM_ACCOUNT" || row.action === "ATTACH_CUSTOMER_TO_PHONE_USER_AND_CREATE_LINK") {
        if (row.action === "ATTACH_CUSTOMER_TO_PHONE_USER_AND_CREATE_LINK") {
          const updated = await tx.customer.updateMany({ where: { id: row.customerId, storeId: row.storeId, userId: null }, data: { userId: row.userId } });
          if (updated.count !== 1) throw new Error("customer_compare_and_set_failed");
        }
        await tx.customerIdentityLink.create({ data: { userId: row.userId, storeId: row.storeId, customerId: row.customerId, provider: "line", providerAccountId: row.providerAccountId, lineUserId: row.providerAccountId } });
      } else if (row.action === "ALIGN_LINK_TO_ACCOUNT") {
        const updated = await tx.customerIdentityLink.updateMany({ where: { id: row.linkId!, storeId: row.storeId, customerId: row.customerId, userId: row.userId, provider: "line" }, data: { providerAccountId: row.providerAccountId, lineUserId: row.providerAccountId } });
        if (updated.count !== 1) throw new Error("link_compare_and_set_failed");
      } else if (row.action === "CREATE_ACCOUNT_FROM_LINK") {
        await tx.account.create({ data: { userId: row.userId, type: "oauth", provider: "line", providerAccountId: row.providerAccountId } });
      } else {
        const updated = await tx.customer.updateMany({ where: { id: row.customerId, storeId: row.storeId, OR: [{ userId: null }, { userId: { not: row.userId } }] }, data: { userId: row.userId } });
        if (updated.count !== 1) throw new Error("customer_compare_and_set_failed");
      }

      let requestId = row.rebindRequestId;
      if (row.rebindRequestMode === "REUSABLE") {
        const request = await tx.lineRebindRequest.update({ where: { id: row.rebindRequestId! }, data: { createdByUserId: actor.id, cancelledByUserId: null, reason: rebindReason, phoneHash: row.phoneHash, oldUserIdHash: row.providerAccountIdHash, status: "PENDING_CAPTURE", expiresAt, capturedAt: null, consumedAt: null, expiredAt: null, cancelledAt: null }, select: { id: true } });
        requestId = request.id;
      } else if (row.rebindRequestMode === "CREATE") {
        const request = await tx.lineRebindRequest.create({ data: { storeId: row.storeId, customerId: row.customerId, createdByUserId: actor.id, reason: rebindReason, phoneHash: row.phoneHash, oldUserIdHash: row.providerAccountIdHash, expiresAt }, select: { id: true } });
        requestId = request.id;
      }
      await tx.auditLog.create({ data: { actorUserId: actor.id, targetType: "Customer", targetId: row.customerId, action: `SECOND_STAGE_LIFF_${row.action}`, afterJson: { storeId: row.storeId, customerId: row.customerId, userId: row.userId, loginProviderAccountIdHash: row.providerAccountIdHash, rebindRequestId: requestId, batchFingerprint: expectedFingerprint, customerMessagingIdentityPreserved: true, planBookingHealthPreserved: true } } });
      actionCounts[row.action] = (actionCounts[row.action] ?? 0) + 1;
    }
    return { repaired: repairable.length, actionCounts, expiresAt, fingerprint };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 90_000 });
  console.log(JSON.stringify({ status: "repaired", ...result }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "execution_failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
