import "server-only";
import type {Prisma} from "../../../generated/course-client";
import {AppError} from "@/lib/errors";

/** Caller authorizes booking.update/customer.read and holds the course Store row lock. */
export async function attachCourseTrialCustomer(tx:Prisma.TransactionClient,actor:{storeId:string;userId:string;assignedStaffId?:string;canCreate:boolean;maxCustomers:number|null},input:{bookingId:string;name:string;phone:string}) {
  const booking=await tx.courseBooking.findFirst({where:{id:input.bookingId,storeId:actor.storeId,bookingKind:"TRIAL",cardId:null},include:{session:true}});
  if(!booking||booking.status==="CANCELLED"||booking.session.cancelledAt)throw new AppError("VALIDATION","找不到可補資料的體驗者");
  const people=await tx.$queryRaw<{id:string;name:string;phone:string;assignedStaffId:string|null}[]>`SELECT id,name,phone,"assignedStaffId" FROM "Customer" WHERE "storeId"=${actor.storeId} AND phone=${input.phone} AND "mergedIntoCustomerId" IS NULL LIMIT 1`;
  let person=people[0];
  if(person&&actor.assignedStaffId&&person.assignedStaffId!==actor.assignedStaffId)throw new AppError("FORBIDDEN","此手機已有顧客，請由有權限人員核對");
  if(booking.customerId){
    if(person?.id===booking.customerId)return {customer:person,existing:true};
    throw new AppError("CONFLICT","此體驗者已補資料，請重新開啟核對");
  }
  if(person){
    const duplicate=await tx.courseBooking.findFirst({where:{storeId:actor.storeId,id:{not:booking.id},customerId:person.id,status:{not:"CANCELLED"},session:{cancelledAt:null,releasedAt:null,startsAt:{lt:booking.session.endsAt},endsAt:{gt:booking.session.startsAt}}}});
    if(duplicate)throw new AppError("CONFLICT","此學員同時段已有課，原體驗與款項保留");
  }else{
    if(!actor.canCreate)throw new AppError("FORBIDDEN","沒有新增顧客權限");
    if(actor.maxCustomers!==null){const count=await tx.$queryRaw<{count:number}[]>`SELECT COUNT(*)::int AS count FROM "Customer" WHERE "storeId"=${actor.storeId} AND "mergedIntoCustomerId" IS NULL`;if(count[0].count>=actor.maxCustomers)throw new AppError("FORBIDDEN","已達顧客額度上限");}
    const id=crypto.randomUUID();
    const created=await tx.$queryRaw<typeof people>`INSERT INTO "Customer" (id,"storeId",name,phone,"assignedStaffId","updatedAt") VALUES (${id},${actor.storeId},${input.name},${input.phone},${actor.assignedStaffId??null},NOW()) RETURNING id,name,phone,"assignedStaffId"`;
    person=created[0];
  }
  const updated=await tx.courseBooking.updateMany({where:{id:booking.id,storeId:actor.storeId,customerId:null,updatedAt:booking.updatedAt},data:{customerId:person.id,customerName:person.name}});
  if(updated.count!==1)throw new AppError("CONFLICT","資料已更新，原體驗與款項保留，請重新開啟");
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","storeId",module,"targetType","targetId",action,"afterJson","createdAt") VALUES (${crypto.randomUUID()},${actor.userId},${actor.storeId},'COURSE','CourseBooking',${booking.id},'ATTACH_TRIAL_CUSTOMER',${JSON.stringify({customerId:person.id,existing:!!people[0],paymentUnchanged:true,attendanceUnchanged:true})}::jsonb,NOW())`;
  return {customer:person,existing:!!people[0]};
}
