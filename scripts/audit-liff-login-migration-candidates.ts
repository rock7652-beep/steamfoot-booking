/**
 * One-time production LIFF Login migration candidate audit — STRICTLY READ ONLY.
 *
 * This does not assume Customer.lineUserId must equal the LINE Login subject:
 * Customer.lineUserId is the Messaging API recipient and may legitimately differ.
 * A row is only "eligible" when an active-plan customer has one internally
 * consistent legacy LINE Login account/link that can later be compared with a
 * freshly verified current-LIFF subject.
 */
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/normalize";

const prisma = new PrismaClient();
const reportPath = process.env.LIFF_MIGRATION_AUDIT_REPORT_PATH ?? "liff-migration-audit.json";
const reason = "LIFF_LOGIN_CHANNEL_MIGRATION_V1";

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

async function main() {
  const now = new Date();
  const [stores, customers, links, accounts, activeRequests] = await Promise.all([
    prisma.store.findMany({ select: { id: true, name: true, slug: true } }),
    prisma.customer.findMany({
      where: {
        mergedIntoCustomerId: null,
        planWallets: {
          some: {
            status: "ACTIVE",
            remainingSessions: { gt: 0 },
            OR: [{ expiryDate: null }, { expiryDate: { gte: now } }],
          },
        },
      },
      select: {
        id: true,
        storeId: true,
        name: true,
        phone: true,
        userId: true,
        lineUserId: true,
        user: { select: { id: true, status: true } },
      },
    }),
    prisma.customerIdentityLink.findMany({
      where: { provider: "line" },
      select: {
        id: true,
        storeId: true,
        customerId: true,
        userId: true,
        providerAccountId: true,
        lineUserId: true,
      },
    }),
    prisma.account.findMany({
      where: { provider: "line" },
      select: { id: true, userId: true, providerAccountId: true },
    }),
    prisma.lineRebindRequest.findMany({
      where: {
        status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] },
        expiresAt: { gt: now },
      },
      select: { id: true, customerId: true, reason: true, expiresAt: true },
    }),
  ]);

  const storeById = new Map(stores.map((store) => [store.id, store] as const));
  const phoneCounts = new Map<string, number>();
  for (const customer of customers) {
    const key = `${customer.storeId}:${normalizePhone(customer.phone)}`;
    phoneCounts.set(key, (phoneCounts.get(key) ?? 0) + 1);
  }

  const eligible: Array<Record<string, unknown>> = [];
  const excluded: Array<Record<string, unknown>> = [];
  const reasonCounts = new Map<string, number>();
  const addExcluded = (customer: typeof customers[number], code: string) => {
    reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1);
    excluded.push({
      storeId: customer.storeId,
      store: storeById.get(customer.storeId)?.name ?? storeById.get(customer.storeId)?.slug ?? "unknown",
      customerId: customer.id,
      customerName: customer.name,
      phoneHash: sha256(normalizePhone(customer.phone)),
      code,
    });
  };

  for (const customer of customers) {
    const phone = normalizePhone(customer.phone);
    if (!/^09\d{8}$/.test(phone)) { addExcluded(customer, "INVALID_PHONE"); continue; }
    if ((phoneCounts.get(`${customer.storeId}:${phone}`) ?? 0) !== 1) { addExcluded(customer, "PHONE_NOT_UNIQUE_IN_STORE"); continue; }
    if (!customer.userId || customer.user?.id !== customer.userId || customer.user.status !== "ACTIVE") {
      addExcluded(customer, "ACTIVE_LOGIN_USER_MISSING"); continue;
    }

    const customerLinks = links.filter((link) =>
      link.storeId === customer.storeId && link.customerId === customer.id && link.userId === customer.userId
    );
    if (customerLinks.length !== 1 || customerLinks[0].lineUserId !== customerLinks[0].providerAccountId) {
      addExcluded(customer, "LEGACY_LOGIN_LINK_NOT_EXACT"); continue;
    }
    const oldLoginId = customerLinks[0].providerAccountId;
    const userAccounts = accounts.filter((account) => account.userId === customer.userId);
    if (userAccounts.length !== 1 || userAccounts[0].providerAccountId !== oldLoginId) {
      addExcluded(customer, "LEGACY_LOGIN_ACCOUNT_NOT_EXACT"); continue;
    }
    if (links.some((link) => link.providerAccountId === oldLoginId && link.id !== customerLinks[0].id) ||
        accounts.some((account) => account.providerAccountId === oldLoginId && account.id !== userAccounts[0].id)) {
      addExcluded(customer, "LEGACY_LOGIN_IDENTITY_CONFLICT"); continue;
    }
    const activeRequest = activeRequests.find((request) => request.customerId === customer.id);
    if (activeRequest && activeRequest.reason !== reason) {
      addExcluded(customer, "OTHER_ACTIVE_REBIND_REQUEST"); continue;
    }

    eligible.push({
      storeId: customer.storeId,
      store: storeById.get(customer.storeId)?.name ?? storeById.get(customer.storeId)?.slug ?? "unknown",
      customerId: customer.id,
      customerName: customer.name,
      userId: customer.userId,
      phoneHash: sha256(phone),
      oldLoginUserIdHash: sha256(oldLoginId),
      messagingUserIdHash: customer.lineUserId ? sha256(customer.lineUserId) : null,
      existingAuthorizedRequestId: activeRequest?.id ?? null,
      existingAuthorizedRequestExpiresAt: activeRequest?.expiresAt.toISOString() ?? null,
    });
  }

  eligible.sort((a, b) => String(a.store).localeCompare(String(b.store), "zh-TW") || String(a.customerName).localeCompare(String(b.customerName), "zh-TW"));
  excluded.sort((a, b) => String(a.store).localeCompare(String(b.store), "zh-TW") || String(a.customerName).localeCompare(String(b.customerName), "zh-TW"));
  const fingerprintInput = eligible.map((row) => ({
    storeId: row.storeId,
    customerId: row.customerId,
    userId: row.userId,
    phoneHash: row.phoneHash,
    oldLoginUserIdHash: row.oldLoginUserIdHash,
  }));
  const candidateFingerprint = sha256(JSON.stringify(fingerprintInput));
  const byStore = Object.fromEntries(stores.map((store) => [
    store.name,
    eligible.filter((row) => row.storeId === store.id).length,
  ]).filter(([, count]) => Number(count) > 0));
  const summary = {
    activePlanCustomersAudited: customers.length,
    safelyPreauthorizable: eligible.length,
    excludedForManualReview: excluded.length,
    alreadyPreauthorized: eligible.filter((row) => row.existingAuthorizedRequestId).length,
    byStore,
    exclusionReasons: Object.fromEntries([...reasonCounts.entries()].sort()),
    candidateFingerprint,
    note: "Eligibility is not proof of a LIFF mismatch; migration occurs only after a fresh current-LIFF subject differs and passes transaction-time conflict checks.",
  };
  await writeFile(reportPath, JSON.stringify({ generatedAt: now.toISOString(), summary, eligible, excluded }, null, 2));
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error("LIFF migration audit failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
