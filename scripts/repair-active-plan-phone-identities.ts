import { PrismaClient, Prisma } from "@prisma/client";
const prisma=new PrismaClient();
async function main(){const out=await prisma.$transaction(async tx=>{
 const cs=await tx.customer.findMany({where:{userId:{not:null},mergedIntoCustomerId:null,planWallets:{some:{status:"ACTIVE",remainingSessions:{gt:0}}}},select:{id:true,userId:true,storeId:true,phone:true,user:{select:{id:true,phone:true,status:true}},planWallets:{where:{status:"ACTIVE",remainingSessions:{gt:0}},select:{id:true,remainingSessions:true}}}});
 const before=cs.flatMap(c=>c.planWallets.map(w=>`${w.id}:${w.remainingSessions}`)).sort();let created=0,phonesSet=0,already=0,blocked=0;
 for(const c of cs){if(!c.userId||!c.user||c.user.status!=="ACTIVE"){blocked++;continue}const existing=await tx.customerIdentityLink.findFirst({where:{customerId:c.id,provider:"phone"}});if(existing){already++;continue}
  const [storeRows,differentCustomerUsers,otherUsers,badLinks]=await Promise.all([tx.customer.count({where:{storeId:c.storeId,phone:c.phone,mergedIntoCustomerId:null}}),tx.customer.count({where:{phone:c.phone,mergedIntoCustomerId:null,userId:{not:c.userId}}}),tx.user.count({where:{phone:c.phone,id:{not:c.userId}}}),tx.customerIdentityLink.count({where:{customerId:c.id,OR:[{userId:{not:c.userId}},{storeId:{not:c.storeId}}]}})]);
  if(storeRows!==1||differentCustomerUsers!==0||otherUsers!==0||badLinks!==0||(c.user.phone!==null&&c.user.phone!==c.phone)){blocked++;continue}
  if(c.user.phone===null){const u=await tx.user.updateMany({where:{id:c.userId,phone:null,status:"ACTIVE"},data:{phone:c.phone}});if(u.count!==1)throw new Error("phone_compare_and_set_failed");phonesSet++}
  await tx.customerIdentityLink.create({data:{userId:c.userId,storeId:c.storeId,customerId:c.id,provider:"phone",providerAccountId:c.phone}});created++;
 }
 const afterRows=await tx.customerPlanWallet.findMany({where:{id:{in:cs.flatMap(c=>c.planWallets.map(w=>w.id))}},select:{id:true,remainingSessions:true}});const after=afterRows.map(w=>`${w.id}:${w.remainingSessions}`).sort();if(JSON.stringify(before)!==JSON.stringify(after))throw new Error("wallet_verification_failed");return{eligible:cs.length,created,phonesSet,already,blocked,walletsVerified:before.length};
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:300000,maxWait:20000});console.log(JSON.stringify(out))}
main().catch(e=>{console.error(e instanceof Error?e.message:"repair_failed");process.exitCode=1}).finally(()=>prisma.$disconnect());
