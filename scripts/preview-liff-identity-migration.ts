/**
 * One-time LIFF identity migration preview. READ ONLY.
 *
 * Prints aggregate counts only. No customer name, phone, user ID, customer ID,
 * LINE ID, email, or rollback payload is written to stdout or an artifact.
 */
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type UnsafeReason =
  | "customer_missing_or_archived"
  | "central_user_mismatch"
  | "central_user_inactive"
  | "phone_invalid_or_not_unique"
  | "candidate_line_missing"
  | "candidate_account_not_owned"
  | "candidate_line_conflict";

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("886") && digits.length === 12 ? `0${digits.slice(3)}` : digits;
}

async function main() {
  const [stores, customers, links, users, accounts] = await Promise.all([
    prisma.store.findMany({ select: { id: true, slug: true } }),
    prisma.customer.findMany({
      select: {
        id: true,
        storeId: true,
        phone: true,
        userId: true,
        lineUserId: true,
        mergedIntoCustomerId: true,
        planWallets: {
          where: { status: "ACTIVE", remainingSessions: { gt: 0 } },
          select: { id: true },
        },
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
    prisma.user.findMany({
      where: { role: "CUSTOMER" },
      select: { id: true, status: true },
    }),
    prisma.account.findMany({
      where: { provider: "line" },
      select: { userId: true, providerAccountId: true },
    }),
  ]);

  const customerById = new Map(customers.map((row) => [row.id, row] as const));
  const userById = new Map(users.map((row) => [row.id, row] as const));
  const unsafeReasons = new Map<UnsafeReason, number>();
  const safeKeys: string[] = [];
  const byStore = new Map<string, { mismatch: number; safe: number; unsafe: number; activePlan: number }>();

  for (const link of links) {
    const customer = customerById.get(link.customerId);
    const candidateLineId = link.lineUserId ?? link.providerAccountId;
    if (!customer?.lineUserId || customer.lineUserId === candidateLineId) continue;

    const storeSlug = stores.find((store) => store.id === link.storeId)?.slug ?? "unknown";
    const storeCounts = byStore.get(storeSlug) ?? { mismatch: 0, safe: 0, unsafe: 0, activePlan: 0 };
    storeCounts.mismatch += 1;
    if (customer.planWallets.length > 0) storeCounts.activePlan += 1;

    let reason: UnsafeReason | null = null;
    if (customer.storeId !== link.storeId || customer.mergedIntoCustomerId !== null) {
      reason = "customer_missing_or_archived";
    } else if (!customer.userId || customer.userId !== link.userId) {
      reason = "central_user_mismatch";
    } else if (userById.get(link.userId)?.status !== "ACTIVE") {
      reason = "central_user_inactive";
    } else {
      const phone = normalizePhone(customer.phone);
      const samePhone = customers.filter(
        (row) => row.storeId === customer.storeId
          && row.mergedIntoCustomerId === null
          && normalizePhone(row.phone) === phone,
      );
      if (!/^09\d{8}$/.test(phone) || samePhone.length !== 1) {
        reason = "phone_invalid_or_not_unique";
      } else if (!candidateLineId) {
        reason = "candidate_line_missing";
      } else {
        const candidateAccounts = accounts.filter((row) => row.providerAccountId === candidateLineId);
        if (candidateAccounts.length !== 1 || candidateAccounts[0]?.userId !== link.userId) {
          reason = "candidate_account_not_owned";
        } else {
          const customerConflict = customers.some(
            (row) => row.id !== customer.id
              && row.mergedIntoCustomerId === null
              && row.lineUserId === candidateLineId
              && row.userId !== link.userId,
          );
          const linkConflict = links.some(
            (row) => row.id !== link.id
              && (row.lineUserId ?? row.providerAccountId) === candidateLineId
              && row.userId !== link.userId,
          );
          if (customerConflict || linkConflict) reason = "candidate_line_conflict";
        }
      }
    }

    if (reason) {
      storeCounts.unsafe += 1;
      unsafeReasons.set(reason, (unsafeReasons.get(reason) ?? 0) + 1);
    } else {
      storeCounts.safe += 1;
      safeKeys.push(`${link.id}:${customer.id}:${link.userId}:${candidateLineId}`);
    }
    byStore.set(storeSlug, storeCounts);
  }

  const totals = [...byStore.values()].reduce(
    (sum, row) => ({
      mismatch: sum.mismatch + row.mismatch,
      safe: sum.safe + row.safe,
      unsafe: sum.unsafe + row.unsafe,
      activePlan: sum.activePlan + row.activePlan,
    }),
    { mismatch: 0, safe: 0, unsafe: 0, activePlan: 0 },
  );
  const planDigest = createHash("sha256").update(safeKeys.sort().join("\n")).digest("hex");

  console.log(JSON.stringify({
    mode: "READ_ONLY",
    totals,
    byStore: Object.fromEntries([...byStore.entries()].sort(([a], [b]) => a.localeCompare(b))),
    unsafeReasons: Object.fromEntries([...unsafeReasons.entries()].sort(([a], [b]) => a.localeCompare(b))),
    planDigest,
    writesPerformed: 0,
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "preview_failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
