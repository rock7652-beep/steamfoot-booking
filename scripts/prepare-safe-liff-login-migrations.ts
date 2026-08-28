/** Owner-authorized all-store LIFF Login migration preauthorization. */
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/normalize";

const prisma = new PrismaClient();
const reason = "LIFF_LOGIN_CHANNEL_MIGRATION_V1";
const expectedFingerprint = process.env.EXPECTED_CANDIDATE_FINGERPRINT ?? "";
const expectedCount = Number(process.env.EXPECTED_CANDIDATE_COUNT ?? "0");
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

async function main() {
  if (!/^[a-f0-9]{64}$/.test(expectedFingerprint) || expectedCount < 1) {
    throw new Error("missing_expected_snapshot");
  }

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const [stores, customers, links, accounts, activeRequests, actor] = await Promise.all([
      tx.store.findMany({ select: { id: true, name: true, slug: true } }),
      tx.customer.findMany({
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
          user: { select: { id: true, status: true } },
        },
      }),
      tx.customerIdentityLink.findMany({
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
      tx.account.findMany({
        where: { provider: "line" },
        select: { id: true, userId: true, providerAccountId: true },
      }),
      tx.lineRebindRequest.findMany({
        where: {
          status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] },
          expiresAt: { gt: now },
        },
        select: { id: true, customerId: true, reason: true },
      }),
      tx.user.findFirst({
        where: { role: "ADMIN", status: "ACTIVE" },
        orderBy: { id: "asc" },
        select: { id: true },
      }),
    ]);
    if (!actor) throw new Error("active_admin_not_found");

    const phoneCounts = new Map<string, number>();
    const storeById = new Map(stores.map((store) => [store.id, store] as const));
    for (const customer of customers) {
      const key = `${customer.storeId}:${normalizePhone(customer.phone)}`;
      phoneCounts.set(key, (phoneCounts.get(key) ?? 0) + 1);
    }

    const eligible: Array<{
      storeId: string;
      store: string;
      customerId: string;
      customerName: string;
      userId: string;
      phoneHash: string;
      oldLoginUserIdHash: string;
      existingRequestId: string | null;
    }> = [];
    for (const customer of customers) {
      const phone = normalizePhone(customer.phone);
      if (!/^09\d{8}$/.test(phone) || (phoneCounts.get(`${customer.storeId}:${phone}`) ?? 0) !== 1) continue;
      if (!customer.userId || customer.user?.id !== customer.userId || customer.user.status !== "ACTIVE") continue;
      const customerLinks = links.filter((link) =>
        link.storeId === customer.storeId && link.customerId === customer.id && link.userId === customer.userId
      );
      if (customerLinks.length !== 1 || customerLinks[0].lineUserId !== customerLinks[0].providerAccountId) continue;
      const oldLoginId = customerLinks[0].providerAccountId;
      const userAccounts = accounts.filter((account) => account.userId === customer.userId);
      if (userAccounts.length !== 1 || userAccounts[0].providerAccountId !== oldLoginId) continue;
      if (links.some((link) => link.providerAccountId === oldLoginId && link.id !== customerLinks[0].id) ||
          accounts.some((account) => account.providerAccountId === oldLoginId && account.id !== userAccounts[0].id)) continue;
      const activeRequest = activeRequests.find((request) => request.customerId === customer.id);
      if (activeRequest && activeRequest.reason !== reason) continue;
      eligible.push({
        storeId: customer.storeId,
        store: storeById.get(customer.storeId)?.name ?? storeById.get(customer.storeId)?.slug ?? "unknown",
        customerId: customer.id,
        customerName: customer.name,
        userId: customer.userId,
        phoneHash: sha256(phone),
        oldLoginUserIdHash: sha256(oldLoginId),
        existingRequestId: activeRequest?.id ?? null,
      });
    }

    eligible.sort((a, b) => a.store.localeCompare(b.store, "zh-TW") || a.customerName.localeCompare(b.customerName, "zh-TW"));
    const fingerprintInput = eligible.map(({ storeId, customerId, userId, phoneHash, oldLoginUserIdHash }) => ({
      storeId, customerId, userId, phoneHash, oldLoginUserIdHash,
    }));
    const actualFingerprint = sha256(JSON.stringify(fingerprintInput));
    if (eligible.length !== expectedCount || actualFingerprint !== expectedFingerprint) {
      throw new Error(`snapshot_changed:${eligible.length}:${actualFingerprint}`);
    }

    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    let created = 0;
    for (const row of eligible) {
      if (row.existingRequestId) continue;
      const request = await tx.lineRebindRequest.create({
        data: {
          storeId: row.storeId,
          customerId: row.customerId,
          createdByUserId: actor.id,
          reason,
          phoneHash: row.phoneHash,
          oldUserIdHash: row.oldLoginUserIdHash,
          expiresAt,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          targetType: "LineRebindRequest",
          targetId: request.id,
          action: "PREPARE_LIFF_LOGIN_REBIND",
          afterJson: {
            storeId: row.storeId,
            customerId: row.customerId,
            expiresAt: expiresAt.toISOString(),
            phoneHash: row.phoneHash,
            oldLoginUserIdHash: row.oldLoginUserIdHash,
            batchCandidateFingerprint: expectedFingerprint,
            customerMessagingIdentityPreserved: true,
          },
        },
      });
      created += 1;
    }
    return { created, alreadyPrepared: eligible.length - created, expiresAt };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 60_000,
  });

  console.log(JSON.stringify({
    status: "prepared",
    created: result.created,
    alreadyPrepared: result.alreadyPrepared,
    expiresAt: result.expiresAt.toISOString(),
    candidateFingerprint: expectedFingerprint,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "prepare_failed");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
