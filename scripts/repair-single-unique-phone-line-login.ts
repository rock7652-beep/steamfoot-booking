/** One-time exact repair. Removes one stale Taichung LINE Login identity only. */
import { PrismaClient, Prisma } from "@prisma/client";
const prisma = new PrismaClient();
const CUSTOMER_ID="cmsnydfoa0001l404ef9962ti";
const USER_ID="cmsrgbdj10000l604w9e3mqxt";
const LINK_ID="cmsrgbdn80004l604a6re9j69";
async function main(){
 const result=await prisma.$transaction(async tx=>{
  const c=await tx.customer.findUnique({where:{id:CUSTOMER_ID},select:{id:true,storeId:true,phone:true,userId:true,mergedIntoCustomerId:true,user:{select:{id:true,status:true,passwordHash:true}}}});
  if(!c||c.storeId!=="store-taichung"||c.userId!==USER_ID||c.mergedIntoCustomerId!==null||c.user?.status!=="ACTIVE"||!c.user.passwordHash) throw new Error("customer_precondition_failed");
  const samePhone=await tx.customer.count({where:{storeId:c.storeId,phone:c.phone,mergedIntoCustomerId:null}});
  if(samePhone!==1) throw new Error("phone_not_unique");
  const link=await tx.customerIdentityLink.findUnique({where:{id:LINK_ID},select:{id:true,customerId:true,userId:true,storeId:true,provider:true}});
  if(!link||link.customerId!==CUSTOMER_ID||link.userId!==USER_ID||link.storeId!==c.storeId||link.provider!=="line_login") throw new Error("link_precondition_failed");
  const removed=await tx.customerIdentityLink.deleteMany({where:{id:LINK_ID,customerId:CUSTOMER_ID,userId:USER_ID,storeId:c.storeId,provider:"line_login"}});
  if(removed.count!==1) throw new Error("delete_compare_and_set_failed");
  return {removed:removed.count,customerPreserved:c.id,userPreserved:c.userId};
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e instanceof Error?e.message:"repair_failed");process.exitCode=1}).finally(()=>prisma.$disconnect());
