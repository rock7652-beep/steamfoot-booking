"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { courseManager } from "@/server/services/course-access";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { AppError, handleActionError } from "@/lib/errors";

export async function loadCourseCardReservations(input: unknown) {
  try {
    const {cardId,page}=z.object({cardId:z.string().min(1).max(100),page:z.number().int().min(0).max(50000).default(0)}).parse(input);
    const {user,storeId}=await courseManager("booking.read");
    await courseManager("wallet.read");
    await courseManager("customer.read");
    const visibility=getManagerCustomerWhere(user.role,user.staffId,storeId);
    const scoped=typeof visibility.assignedStaffId === "string";
    const people=scoped ? await prisma.customer.findMany({where:{...visibility,storeId,mergedIntoCustomerId:null},select:{id:true}}) : null;
    const visibleIds=people?.map(p=>p.id);
    const card=await coursePrisma.coursePointCard.findFirst({where:{id:cardId,storeId,...(visibleIds?{members:{some:{storeId,customerId:{in:visibleIds}}}}:{})},select:{id:true}});
    if(!card)throw new AppError("NOT_FOUND","找不到方案");
    const rows=await coursePrisma.courseBooking.findMany({where:{storeId,cardId,status:"RESERVED",...(visibleIds?{customerId:{in:visibleIds}}:{})},orderBy:[{session:{startsAt:"asc"}},{id:"asc"}],skip:page*20,take:21,select:{id:true,customerName:true,pointCost:true,session:{select:{nameSnapshot:true,startsAt:true}}}});
    return {success:true as const,scoped,hasMore:rows.length>20,rows:rows.slice(0,20).map(b=>({id:b.id,customerName:b.customerName,amount:b.pointCost,name:b.session.nameSnapshot,startsAt:b.session.startsAt.toISOString()}))};
  } catch(error){const result=handleActionError(error);return {success:false as const,error:result.success?"讀取失敗":result.error};}
}
