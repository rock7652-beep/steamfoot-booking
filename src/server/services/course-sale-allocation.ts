import "server-only";
import type {Prisma} from "../../../generated/course-client";
import {AppError} from "@/lib/errors";
import {calculateCourseSaleAllocation} from "@/lib/course-sale-allocation";
export async function courseSaleSnapshot(tx:Prisma.TransactionClient,storeId:string,paid:number,storeCost:number,revenueStaffId:string|null) {
 const allocation=calculateCourseSaleAllocation(paid,storeCost);
 if(allocation.shortfall>0) throw new AppError("VALIDATION","實收低於店家成本，請先核對優惠及成本設定；本次未發卡或入帳。");
 let name:string|null=null;
 if(revenueStaffId){
  const rows=await tx.$queryRaw<Array<{displayName:string}>>`SELECT s."displayName" FROM "Staff" s JOIN "User" u ON u.id=s."userId" WHERE s.id=${revenueStaffId} AND s."storeId"=${storeId} AND s.status::text='ACTIVE' AND u.status::text='ACTIVE' AND u.role::text='OWNER'`;
  if(!rows.length)throw new AppError("VALIDATION","請選擇本店啟用的直屬店長／開發人");
  name=rows[0].displayName;
 }else if(allocation.developerAmount>0)throw new AppError("VALIDATION","請先指定本次方案的直屬店長／開發人");
 return {storeCostSnapshot:allocation.storeAmount,developerProfitSnapshot:allocation.developerAmount,developerNameSnapshot:name,revenueStaffId};
}
