/** Second-stage active-plan LIFF login repair audit — STRICTLY READ ONLY. */
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/normalize";

const prisma = new PrismaClient();
const reportPath = process.env.SECOND_STAGE_LIFF_AUDIT_REPORT_PATH ?? "second-stage-liff-audit.json";
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

type RepairAction =
  | "CREATE_LINK_FROM_ACCOUNT"
  | "ALIGN_LINK_TO_ACCOUNT"
  | "CREATE_ACCOUNT_FROM_LINK"
  | "ATTACH_CUSTOMER_TO_PHONE_USER_AND_CREATE_LINK"
  | "ATTACH_CUSTOMER_TO_PHONE_USER";

async function main() {
  const now = new Date();
  const [stores, activePlanCustomers, allCustomers, links, accounts, users, rebindRequests] = await Promise.all([
    prisma.store.findMany({ select: { id: true, name: true, slug: true } }),
    prisma.customer.findMany({
      where: {
        mergedIntoCustomerId: null,
        planWallets: { some: { status: "ACTIVE", remainingSessions: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] } },
      },
      select: { id: true, storeId: true, name: true, phone: true, userId: true, user: { select: { id: true, status: true, role: true } } },
    }),
    prisma.customer.findMany({
      where: { mergedIntoCustomerId: null },
      select: { id: true, storeId: true, name: true, phone: true, userId: true },
    }),
    prisma.customerIdentityLink.findMany({
      where: { provider: "line" },
      select: { id: true, storeId: true, customerId: true, userId: true, providerAccountId: true, lineUserId: true },
    }),
    prisma.account.findMany({
      where: { provider: "line" },
      select: { id: true, userId: true, providerAccountId: true },
    }),
    prisma.user.findMany({
      where: { role: "CUSTOMER" },
      select: { id: true, name: true, phone: true, status: true, role: true },
    }),
    prisma.lineRebindRequest.findMany({
      select: {
        id: true, customerId: true, reason: true, status: true, expiresAt: true,
        candidate: { select: { id: true } },
      },
    }),
  ]);

  const storeById = new Map(stores.map((store) => [store.id, store] as const));
  const phoneCounts = new Map<string, number>();
  for (const customer of allCustomers) {
    const key = `${customer.storeId}:${normalizePhone(customer.phone)}`;
    phoneCounts.set(key, (phoneCounts.get(key) ?? 0) + 1);
  }
  const usersByPhone = new Map<string, typeof users>();
  for (const user of users) {
    if (user.status !== "ACTIVE") continue;
    const phone = user.phone ? normalizePhone(user.phone) : "";
    if (!phone) continue;
    const rows = usersByPhone.get(phone) ?? [];
    rows.push(user);
    usersByPhone.set(phone, rows);
  }

  const repairable: Array<Record<string, unknown>> = [];
  const manual: Array<Record<string, unknown>> = [];
  let firstStageExact = 0;
  const addManual = (customer: typeof activePlanCustomers[number], code: string) => manual.push({
    storeId: customer.storeId,
    store: storeById.get(customer.storeId)?.name ?? storeById.get(customer.storeId)?.slug ?? "unknown",
    customerId: customer.id,
    customerName: customer.name,
    phoneHash: sha256(normalizePhone(customer.phone)),
    code,
  });
  const addRepair = (
    customer: typeof activePlanCustomers[number], action: RepairAction,
    userId: string, accountId: string | null, linkId: string | null, providerAccountId: string,
  ) => {
    const existingRequest = rebindRequests.find((request) => request.customerId === customer.id);
    const activeRequest = existingRequest && ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"].includes(existingRequest.status) && existingRequest.expiresAt > now
      ? existingRequest : null;
    if (activeRequest && activeRequest.reason !== "LIFF_LOGIN_CHANNEL_MIGRATION_V1") {
      addManual(customer, "OTHER_ACTIVE_REBIND_REQUEST"); return;
    }
    if (existingRequest?.candidate && !activeRequest) {
      addManual(customer, "HISTORICAL_REBIND_HAS_CANDIDATE"); return;
    }
    repairable.push({
    storeId: customer.storeId,
    store: storeById.get(customer.storeId)?.name ?? storeById.get(customer.storeId)?.slug ?? "unknown",
    customerId: customer.id,
    customerName: customer.name,
    phoneHash: sha256(normalizePhone(customer.phone)),
    action,
    userId,
    accountId,
    linkId,
    providerAccountIdHash: sha256(providerAccountId),
    rebindRequestId: existingRequest?.id ?? null,
    rebindRequestMode: activeRequest ? "ACTIVE" : existingRequest ? "REUSABLE" : "CREATE",
  });
  };

  for (const customer of activePlanCustomers) {
    const phone = normalizePhone(customer.phone);
    if (!/^09\d{8}$/.test(phone) || (phoneCounts.get(`${customer.storeId}:${phone}`) ?? 0) !== 1) {
      addManual(customer, "PHONE_NOT_UNIQUE_OR_INVALID"); continue;
    }
    const customerLinks = links.filter((link) => link.storeId === customer.storeId && link.customerId === customer.id);

    if (customer.userId && customer.user?.id === customer.userId && customer.user.status === "ACTIVE" && customer.user.role === "CUSTOMER") {
      const userAccounts = accounts.filter((account) => account.userId === customer.userId);
      const linksForUser = customerLinks.filter((link) => link.userId === customer.userId);
      if (linksForUser.length === 1 && userAccounts.length === 1 &&
          linksForUser[0].providerAccountId === userAccounts[0].providerAccountId &&
          linksForUser[0].lineUserId === linksForUser[0].providerAccountId) {
        firstStageExact += 1; continue;
      }

      if (userAccounts.length === 1 && linksForUser.length <= 1 && customerLinks.length === linksForUser.length) {
        const account = userAccounts[0];
        const candidateLinks = links.filter((link) => link.providerAccountId === account.providerAccountId);
        const conflict = candidateLinks.some((link) => link.userId !== customer.userId || (link.storeId === customer.storeId && link.customerId !== customer.id));
        if (!conflict) {
          if (linksForUser.length === 0) {
            addRepair(customer, "CREATE_LINK_FROM_ACCOUNT", customer.userId, account.id, null, account.providerAccountId); continue;
          }
          addRepair(customer, "ALIGN_LINK_TO_ACCOUNT", customer.userId, account.id, linksForUser[0].id, account.providerAccountId); continue;
        }
      }

      if (userAccounts.length === 0 && linksForUser.length === 1 && customerLinks.length === 1) {
        const link = linksForUser[0];
        const accountConflict = accounts.some((account) => account.providerAccountId === link.providerAccountId);
        const linkConflict = links.some((other) => other.providerAccountId === link.providerAccountId && other.id !== link.id);
        if (!accountConflict && !linkConflict && link.lineUserId === link.providerAccountId) {
          addRepair(customer, "CREATE_ACCOUNT_FROM_LINK", customer.userId, null, link.id, link.providerAccountId); continue;
        }
      }
      addManual(customer, "ACTIVE_USER_IDENTITY_NOT_UNIQUE"); continue;
    }

    const phoneUsers = usersByPhone.get(phone) ?? [];
    if (phoneUsers.length !== 1) { addManual(customer, "UNIQUE_ACTIVE_PHONE_USER_NOT_FOUND"); continue; }
    const targetUser = phoneUsers[0];
    if (allCustomers.some((other) => other.id !== customer.id && other.userId === targetUser.id)) {
      addManual(customer, "PHONE_USER_ALREADY_HAS_DIRECT_CUSTOMER"); continue;
    }
    const userAccounts = accounts.filter((account) => account.userId === targetUser.id);
    if (userAccounts.length !== 1) { addManual(customer, "PHONE_USER_LINE_ACCOUNT_NOT_EXACT"); continue; }
    const account = userAccounts[0];
    const providerConflict = links.some((link) => link.providerAccountId === account.providerAccountId &&
      (link.userId !== targetUser.id || (link.storeId === customer.storeId && link.customerId !== customer.id)));
    if (providerConflict) { addManual(customer, "PHONE_USER_LINE_IDENTITY_CONFLICT"); continue; }
    if (customerLinks.length === 0) {
      addRepair(customer, "ATTACH_CUSTOMER_TO_PHONE_USER_AND_CREATE_LINK", targetUser.id, account.id, null, account.providerAccountId); continue;
    }
    if (customerLinks.length === 1 && customerLinks[0].userId === targetUser.id && customerLinks[0].providerAccountId === account.providerAccountId) {
      addRepair(customer, "ATTACH_CUSTOMER_TO_PHONE_USER", targetUser.id, account.id, customerLinks[0].id, account.providerAccountId); continue;
    }
    addManual(customer, "UNLINKED_CUSTOMER_IDENTITY_NOT_EXACT");
  }

  repairable.sort((a, b) => String(a.store).localeCompare(String(b.store), "zh-TW") || String(a.customerName).localeCompare(String(b.customerName), "zh-TW") || String(a.action).localeCompare(String(b.action)));
  manual.sort((a, b) => String(a.store).localeCompare(String(b.store), "zh-TW") || String(a.customerName).localeCompare(String(b.customerName), "zh-TW"));
  const fingerprintRows = repairable.map((row) => ({
    storeId: row.storeId, customerId: row.customerId, action: row.action, userId: row.userId,
    accountId: row.accountId, linkId: row.linkId, phoneHash: row.phoneHash, providerAccountIdHash: row.providerAccountIdHash,
    rebindRequestId: row.rebindRequestId, rebindRequestMode: row.rebindRequestMode,
  }));
  const actionCounts = Object.fromEntries([...new Set(repairable.map((row) => String(row.action)))].sort().map((action) => [action, repairable.filter((row) => row.action === action).length]));
  const manualReasonCounts = Object.fromEntries([...new Set(manual.map((row) => String(row.code)))].sort().map((code) => [code, manual.filter((row) => row.code === code).length]));
  const manualDiagnostics = manual.map((row) => {
    const customer = activePlanCustomers.find((item) => item.id === row.customerId)!;
    const phone = normalizePhone(customer.phone);
    const customerLinks = links.filter((link) => link.customerId === customer.id);
    const samePhoneUsers = users.filter((user) => user.phone && normalizePhone(user.phone) === phone);
    const relatedUserIds = new Set([
      customer.userId,
      ...customerLinks.map((link) => link.userId),
      ...samePhoneUsers.map((user) => user.id),
    ].filter((id): id is string => Boolean(id)));
    const relatedAccounts = accounts.filter((account) => relatedUserIds.has(account.userId));
    return {
      storeId: customer.storeId,
      store: row.store,
      customerId: customer.id,
      customerName: customer.name,
      code: row.code,
      directUserId: customer.userId,
      samePhoneCustomers: allCustomers.filter((item) => normalizePhone(item.phone) === phone).map((item) => ({
        customerId: item.id, storeId: item.storeId, customerName: item.name, directUserId: item.userId,
      })),
      samePhoneUsers: samePhoneUsers.map((user) => ({
        userId: user.id, name: user.name, status: user.status,
        directCustomerIds: allCustomers.filter((item) => item.userId === user.id).map((item) => item.id),
        lineAccounts: accounts.filter((account) => account.userId === user.id).map((account) => ({
          accountId: account.id, providerAccountIdHash: sha256(account.providerAccountId),
          matchingLinkIds: links.filter((link) => link.providerAccountId === account.providerAccountId).map((link) => link.id),
        })),
      })),
      customerLineLinks: customerLinks.map((link) => ({
        linkId: link.id, userId: link.userId,
        providerAccountIdHash: sha256(link.providerAccountId),
        lineUserIdMatches: link.lineUserId === link.providerAccountId,
        matchingAccountIds: relatedAccounts.filter((account) => account.userId === link.userId && account.providerAccountId === link.providerAccountId).map((account) => account.id),
        globalMatchingLinkIds: links.filter((other) => other.providerAccountId === link.providerAccountId).map((other) => other.id),
      })),
      relatedUsers: [...relatedUserIds].map((userId) => ({
        userId,
        user: users.find((user) => user.id === userId) ?? null,
        directCustomerIds: allCustomers.filter((item) => item.userId === userId).map((item) => item.id),
        lineAccountIds: accounts.filter((account) => account.userId === userId).map((account) => account.id),
        identityLinkIds: links.filter((link) => link.userId === userId).map((link) => link.id),
      })),
    };
  });
  const summary = {
    activePlanCustomersAudited: activePlanCustomers.length,
    firstStageExact,
    secondStageRepairable: repairable.length,
    remainsManual: manual.length,
    actionCounts,
    manualReasonCounts,
    candidateFingerprint: sha256(JSON.stringify(fingerprintRows)),
  };
  await writeFile(reportPath, JSON.stringify({ generatedAt: now.toISOString(), summary, repairable, manual, manualDiagnostics }, null, 2));
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error("Second-stage LIFF audit failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
