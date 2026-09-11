/**
 * Repair legacy official-LINE phone bindings that accidentally created a
 * synthetic login User/Account and now block real member registration.
 *
 * Default is read-only. Applying requires an exact reviewed candidate count:
 *   npx tsx scripts/repair-notification-prebind-login-collisions.ts
 *   npx tsx scripts/repair-notification-prebind-login-collisions.ts --apply --confirm-count=3
 */
import { PrismaClient, UserStatus } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const confirmArg = process.argv.find((arg) => arg.startsWith("--confirm-count="));
const confirmedCount = confirmArg ? Number(confirmArg.split("=")[1]) : null;
const operatorUserId = process.env.OPERATOR_USER_ID?.trim() || null;

function withinTenMinutes(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= 10 * 60 * 1000;
}

async function main() {
  const rows = await prisma.customer.findMany({
    where: {
      userId: { not: null },
      lineUserId: { not: null },
      lineLinkedAt: { not: null },
      mergedIntoCustomerId: null,
      user: {
        name: "顧客",
        email: null,
        passwordHash: null,
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    },
    select: {
      id: true,
      storeId: true,
      phone: true,
      lineUserId: true,
      lineLinkedAt: true,
      user: {
        select: {
          id: true,
          phone: true,
          createdAt: true,
          accounts: true,
          sessions: { select: { id: true }, take: 1 },
          customerIdentityLinks: { select: { id: true }, take: 1 },
        },
      },
    },
  });

  const candidates = rows.filter((customer) => {
    const user = customer.user;
    if (!user || !customer.lineUserId || !customer.lineLinkedAt) return false;
    if (user.phone !== customer.phone) return false;
    if (!withinTenMinutes(user.createdAt, customer.lineLinkedAt)) return false;
    if (user.sessions.length > 0 || user.customerIdentityLinks.length > 0) return false;
    if (user.accounts.length !== 1) return false;
    const account = user.accounts[0];
    return account.provider === "line" &&
      account.providerAccountId === customer.lineUserId &&
      !account.access_token && !account.refresh_token && !account.id_token;
  });

  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "DRY_RUN",
    candidateCount: candidates.length,
    candidates: candidates.map((row) => ({
      customerId: row.id,
      storeId: row.storeId,
      userId: row.user?.id,
      phoneTail: row.phone.slice(-3),
    })),
  }, null, 2));

  if (!apply) return;
  if (!Number.isInteger(confirmedCount) || confirmedCount !== candidates.length) {
    throw new Error("CONFIRM_COUNT_MISMATCH");
  }
  if (!operatorUserId) throw new Error("OPERATOR_USER_ID_REQUIRED");

  for (const customer of candidates) {
    const user = customer.user;
    if (!user || !customer.lineUserId) throw new Error("CANDIDATE_STALE");
    const notificationLineId = customer.lineUserId;
    await prisma.$transaction(async (tx) => {
      const released = await tx.customer.updateMany({
        where: {
          id: customer.id,
          storeId: customer.storeId,
          userId: user.id,
          lineUserId: notificationLineId,
          mergedIntoCustomerId: null,
        },
        data: { userId: null },
      });
      if (released.count !== 1) throw new Error("CANDIDATE_STALE");

      const deletedAccounts = await tx.account.deleteMany({
        where: {
          userId: user.id,
          provider: "line",
          providerAccountId: notificationLineId,
          access_token: null,
          refresh_token: null,
          id_token: null,
        },
      });
      if (deletedAccounts.count !== 1) throw new Error("ACCOUNT_STALE");

      const retired = await tx.user.updateMany({
        where: {
          id: user.id,
          name: "顧客",
          phone: customer.phone,
          email: null,
          passwordHash: null,
          role: "CUSTOMER",
          status: "ACTIVE",
        },
        data: { phone: null, status: UserStatus.DELETED },
      });
      if (retired.count !== 1) throw new Error("USER_STALE");

      await tx.auditLog.create({
        data: {
          actorUserId: operatorUserId,
          targetType: "Customer",
          targetId: customer.id,
          action: "REPAIR_NOTIFICATION_PREBIND_LOGIN_COLLISION",
          beforeJson: { userId: user.id, notificationRecipientPreserved: true },
          afterJson: { userId: null, syntheticUserRetired: true },
        },
      });
    });
  }

  console.log(JSON.stringify({ repairedCount: candidates.length }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "REPAIR_FAILED");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
