/** Owner-authorized one-time LIFF Login migration preparation for one exact customer. */
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/normalize";

const prisma = new PrismaClient();

const CUSTOMER_ID = "cmpqlf5qj0002kw04elnysjw5";
const USER_ID = "cmpqlf5qb0000kw0484rpj8bd";
const STORE_ID = "e182e256-98ca-4c78-970b-d4b118066c51";
const LEGACY_LOGIN_LINK_ID = "cmr4ujpfh0001l504kqbc4ei4";
const PHONE_HASH = "3673b89743552ed1c05fc5a30f4d62c2087b524a94633eecc694752b8e13ea7c";
const MESSAGING_ID_HASH = "65df90281cf0a70b2a26431af01ed60117ee75e7294b7b86303d0841dd60abef";
const OLD_LOGIN_ID_HASH = "f50c3c9564d87da54ef47e342de688d3b00ec1fa864ba106d8aed869e749ad96";
const REASON = "LIFF_LOGIN_CHANNEL_MIGRATION_V1";

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const customer = await tx.customer.findUnique({
      where: { id: CUSTOMER_ID },
      select: {
        id: true,
        storeId: true,
        phone: true,
        userId: true,
        lineUserId: true,
        mergedIntoCustomerId: true,
        user: { select: { id: true, status: true } },
      },
    });
    if (
      !customer ||
      customer.storeId !== STORE_ID ||
      customer.userId !== USER_ID ||
      customer.user?.id !== USER_ID ||
      customer.user.status !== "ACTIVE" ||
      customer.mergedIntoCustomerId ||
      sha256(normalizePhone(customer.phone)) !== PHONE_HASH ||
      !customer.lineUserId ||
      sha256(customer.lineUserId) !== MESSAGING_ID_HASH
    ) throw new Error("customer_precondition_failed");

    const samePhone = await tx.customer.count({
      where: {
        storeId: STORE_ID,
        phone: normalizePhone(customer.phone),
        mergedIntoCustomerId: null,
      },
    });
    if (samePhone !== 1) throw new Error("phone_not_unique");

    const link = await tx.customerIdentityLink.findUnique({
      where: { id: LEGACY_LOGIN_LINK_ID },
      select: {
        id: true,
        storeId: true,
        customerId: true,
        userId: true,
        provider: true,
        providerAccountId: true,
        lineUserId: true,
      },
    });
    if (
      !link ||
      link.storeId !== STORE_ID ||
      link.customerId !== CUSTOMER_ID ||
      link.userId !== USER_ID ||
      link.provider !== "line" ||
      link.lineUserId !== link.providerAccountId ||
      sha256(link.providerAccountId) !== OLD_LOGIN_ID_HASH
    ) throw new Error("login_link_precondition_failed");

    const accounts = await tx.account.findMany({
      where: { userId: USER_ID, provider: "line" },
      select: { id: true, providerAccountId: true },
    });
    if (
      accounts.length !== 1 ||
      sha256(accounts[0].providerAccountId) !== OLD_LOGIN_ID_HASH
    ) throw new Error("login_account_precondition_failed");

    const actor = await tx.user.findFirst({
      where: { role: "ADMIN", status: "ACTIVE" },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (!actor) throw new Error("active_admin_not_found");

    await tx.lineRebindRequest.updateMany({
      where: {
        storeId: STORE_ID,
        customerId: CUSTOMER_ID,
        status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] },
        expiresAt: { lte: now },
      },
      data: { status: "EXPIRED", expiredAt: now },
    });
    const active = await tx.lineRebindRequest.count({
      where: {
        storeId: STORE_ID,
        customerId: CUSTOMER_ID,
        status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] },
        expiresAt: { gt: now },
      },
    });
    if (active !== 0) throw new Error("another_active_rebind_request_exists");

    const request = await tx.lineRebindRequest.create({
      data: {
        storeId: STORE_ID,
        customerId: CUSTOMER_ID,
        createdByUserId: actor.id,
        reason: REASON,
        phoneHash: PHONE_HASH,
        oldUserIdHash: OLD_LOGIN_ID_HASH,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
      select: { id: true, expiresAt: true },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        targetType: "LineRebindRequest",
        targetId: request.id,
        action: "PREPARE_LIFF_LOGIN_REBIND",
        afterJson: {
          storeId: STORE_ID,
          customerId: CUSTOMER_ID,
          expiresAt: request.expiresAt.toISOString(),
          phoneHash: PHONE_HASH,
          oldLoginUserIdHash: OLD_LOGIN_ID_HASH,
          customerMessagingIdentityPreserved: true,
        },
      },
    });
    return request;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 30_000,
  });

  console.log(JSON.stringify({
    status: "prepared",
    requestId: result.id,
    expiresAt: result.expiresAt.toISOString(),
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "prepare_failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
