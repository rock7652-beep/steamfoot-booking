/** One-time owner-authorized LIFF rebind for a single customer. */
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Prisma, PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/normalize";

const prisma = new PrismaClient();
const EXPECTED = {
  storeId: "store-hsinchu",
  customerId: "cmt4a22ym0003jo043rxomj4o",
  userId: "cmt4391vd0000jo04caeitut3",
  actorUserId: "cmoica0qn0000jv04joki1n59",
} as const;
const REASON = "LIFF_LOGIN_CHANNEL_MIGRATION_V1";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{id:string}>>`
      SELECT "id" FROM "Customer"
      WHERE "id" = ${EXPECTED.customerId} AND "storeId" = ${EXPECTED.storeId}
      FOR UPDATE
    `;
    if (locked.length !== 1) throw new Error("CUSTOMER_NOT_UNIQUE");

    const [customer, user, actor, storeCustomers, links, accounts, pending] = await Promise.all([
      tx.customer.findUnique({where:{id:EXPECTED.customerId},select:{id:true,storeId:true,phone:true,userId:true,mergedIntoCustomerId:true}}),
      tx.user.findUnique({where:{id:EXPECTED.userId},select:{id:true,role:true,status:true}}),
      tx.user.findUnique({where:{id:EXPECTED.actorUserId},select:{id:true,role:true,status:true}}),
      tx.customer.findMany({where:{storeId:EXPECTED.storeId,mergedIntoCustomerId:null},select:{id:true,phone:true}}),
      tx.customerIdentityLink.findMany({where:{OR:[{customerId:EXPECTED.customerId},{userId:EXPECTED.userId}],provider:"line"},select:{id:true,userId:true,storeId:true,customerId:true,providerAccountId:true,lineUserId:true},take:3}),
      tx.account.findMany({where:{userId:EXPECTED.userId,provider:"line"},select:{id:true,userId:true,providerAccountId:true},take:3}),
      tx.lineRebindRequest.findMany({where:{storeId:EXPECTED.storeId,customerId:EXPECTED.customerId,status:"PENDING_CAPTURE",expiresAt:{gt:new Date()}},select:{id:true,reason:true,phoneHash:true,oldUserIdHash:true,expiresAt:true},take:2}),
    ]);
    if (!customer || customer.storeId !== EXPECTED.storeId || customer.userId !== EXPECTED.userId || customer.mergedIntoCustomerId) throw new Error("CUSTOMER_STATE_CHANGED");
    const phone = normalizePhone(customer.phone);
    if (!/^09\d{8}$/.test(phone)) throw new Error("INVALID_PHONE");
    if (!user || user.role !== "CUSTOMER" || user.status !== "ACTIVE") throw new Error("USER_STATE_CHANGED");
    if (!actor || actor.status !== "ACTIVE" || !["OWNER","ADMIN"].includes(actor.role)) throw new Error("ACTOR_STATE_CHANGED");
    if (storeCustomers.filter((row)=>normalizePhone(row.phone)===phone).length !== 1) throw new Error("PHONE_NOT_UNIQUE");
    if (links.length !== 1 || accounts.length !== 1) throw new Error("OLD_LOGIN_IDENTITY_NOT_UNIQUE");
    const link=links[0], account=accounts[0];
    if (link.userId!==EXPECTED.userId || link.storeId!==EXPECTED.storeId || link.customerId!==EXPECTED.customerId ||
        link.providerAccountId!==link.lineUserId || account.userId!==EXPECTED.userId || account.providerAccountId!==link.providerAccountId) {
      throw new Error("OLD_LOGIN_IDENTITY_INCONSISTENT");
    }
    const oldIdentityHash=sha256(link.providerAccountId);
    const phoneHash=sha256(phone);
    if (pending.length === 1) {
      const existing=pending[0];
      if (existing.reason!==REASON || existing.phoneHash!==phoneHash || existing.oldUserIdHash!==oldIdentityHash) throw new Error("ACTIVE_REQUEST_CONFLICT");
      return {status:"ALREADY_AUTHORIZED",requestId:existing.id,customerId:EXPECTED.customerId,expiresAt:existing.expiresAt.toISOString()};
    }
    if (pending.length > 1) throw new Error("MULTIPLE_ACTIVE_REQUESTS");

    const now = new Date();
    const request = await tx.lineRebindRequest.create({data:{
      storeId:EXPECTED.storeId,
      customerId:EXPECTED.customerId,
      createdByUserId:EXPECTED.actorUserId,
      reason:REASON,
      phoneHash,
      oldUserIdHash:oldIdentityHash,
      status:"PENDING_CAPTURE",
      expiresAt:new Date(now.getTime()+48*60*60*1000),
    }});
    await tx.auditLog.create({data:{
      actorUserId:EXPECTED.actorUserId,
      targetType:"LineRebindRequest",
      targetId:request.id,
      action:"AUTHORIZE_LIFF_LOGIN_REBIND",
      beforeJson:{customerId:EXPECTED.customerId,oldLoginUserIdHash:oldIdentityHash},
      afterJson:{requestId:request.id,status:"PENDING_CAPTURE",reason:REASON,expiresAt:request.expiresAt.toISOString(),scope:"single-customer",customerMessagingIdentityPreserved:true},
    }});
    return {status:"AUTHORIZED",requestId:request.id,customerId:EXPECTED.customerId,expiresAt:request.expiresAt.toISOString()};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10000,timeout:30000});
  await writeFile("jian-liff-first-capture-result.json",JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:result.status,requestId:result.requestId}));
}
main().catch((error)=>{console.error(error instanceof Error?error.message:"repair failed");process.exitCode=1}).finally(()=>prisma.$disconnect());
