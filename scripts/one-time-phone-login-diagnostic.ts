/** One-time private diagnostic. READ ONLY: findMany only; no PII on stdout. */
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const [customers, users, links, stores] = await Promise.all([
    prisma.customer.findMany({ select: { id:true, storeId:true, name:true, phone:true, userId:true, lineUserId:true, lineLinkStatus:true, mergedIntoCustomerId:true } }),
    prisma.user.findMany({ where:{ role:"CUSTOMER" }, select:{ id:true, phone:true, status:true, passwordHash:true, accounts:{select:{provider:true,providerAccountId:true}} } }),
    prisma.customerIdentityLink.findMany({ select:{ id:true,userId:true,storeId:true,customerId:true,provider:true,providerAccountId:true,lineUserId:true } }),
    prisma.store.findMany({ select:{id:true,name:true,slug:true} }),
  ]);
  await writeFile("phone-login-diagnostic.json", JSON.stringify({customers,users,links,stores},null,2));
  console.log(JSON.stringify({customers:customers.length,users:users.length,links:links.length}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:"diagnostic failed");process.exitCode=1}).finally(()=>prisma.$disconnect());
