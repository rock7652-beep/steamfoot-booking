"use server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { assertNoCourseResourceUse, handleCourseActionError } from "@/server/services/course-resources";
import { getStoreLimitsByStoreId, requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { AppError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { revalidateStaff, revalidateStaffPermissions } from "@/lib/revalidation";
export async function batchCourseStatus(input: unknown) {
  try {
    const d=z.object({kind:z.enum(["room","plan","staff","subject"]),ids:z.array(z.string().min(1).max(180)).min(1).max(200),active:z.boolean()}).parse(input);
    const ids=[...new Set(d.ids)];
    const {storeId,user}=await courseManager(d.kind==="staff"?"staff.manage":d.kind==="plan"?"plans.edit":"booking.update");
    if(d.kind==="staff" && user.role!=="OWNER") throw new AppError("FORBIDDEN","僅店長可管理人員");
    if(d.kind==="staff") await requireStoreFeature(storeId,FEATURES.STAFF_MANAGEMENT);
    const limits=d.kind==="staff" ? await getStoreLimitsByStoreId(storeId):null;
    await courseTransaction(storeId,async tx=>{
      if(d.kind==="staff") {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`staff-capacity:${storeId}`}, 0))`;
        const rows=await tx.$queryRaw<Array<{id:string;status:string;courseCoachEnabled:boolean}>>`SELECT id,status::text,"courseCoachEnabled" FROM "Staff" WHERE "storeId"=${storeId} AND id=ANY(${ids}::text[]) FOR UPDATE`;
        if(rows.length!==ids.length) throw new AppError("FORBIDDEN","選取項目包含非本店人員，未變更任何資料");
        if(!d.active && ids.includes(user.staffId ?? "")) throw new AppError("FORBIDDEN","不能停用自己，請取消勾選本人");
        if(!d.active) {
          const unfinished=await tx.courseSession.groupBy({by:["coachId"],where:{storeId,coachId:{in:ids},cancelledAt:null,endsAt:{gt:new Date()}},_count:{_all:true}});
          if(unfinished.length) throw new AppError("CONFLICT",`仍有 ${unfinished.reduce((sum,row)=>sum+row._count._all,0)} 堂未結束課次，請先完成改派或取消後再停用`);
        }
        if(d.active && rows.some(r=>r.status!=="ACTIVE") && limits?.maxStaff!=null) {
          const [r]=await tx.$queryRaw<Array<{count:bigint}>>`SELECT count(*) FROM "Staff" WHERE "storeId"=${storeId} AND status::text='ACTIVE'`;
          if(Number(r.count)+rows.filter(r=>r.status!=="ACTIVE").length>limits.maxStaff) throw new AppError("FORBIDDEN","啟用後超過人員上限，未變更任何資料");
        }
        if(d.active) await tx.$executeRaw`UPDATE "Staff" SET status='ACTIVE' WHERE "storeId"=${storeId} AND id=ANY(${ids}::text[])`;
        else await tx.$executeRaw`UPDATE "Staff" SET status='INACTIVE' WHERE "storeId"=${storeId} AND id=ANY(${ids}::text[])`;
        if(!d.active) await tx.$executeRaw`UPDATE "StaffMemberLink" SET "revokedAt"=NOW() WHERE "storeId"=${storeId} AND "staffId"=ANY(${ids}::text[])`;
        // Reactivation follows the individual editor, including coach-work access.
        else {const coaches=rows.filter(r=>r.courseCoachEnabled).map(r=>r.id);if(coaches.length) await tx.$executeRaw`UPDATE "StaffMemberLink" SET "revokedAt"=NULL WHERE "storeId"=${storeId} AND "staffId"=ANY(${coaches}::text[])`;}
        await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${user.id},'StaffBatch',${ids.join(',')},'STATUS_UPDATE',${JSON.stringify(rows.map(r=>({id:r.id,status:r.status})))}::jsonb,${JSON.stringify({storeId,ids,status:d.active?"ACTIVE":"INACTIVE"})}::jsonb,now())`;
      } else if(d.kind==="room") {
        const rows=await tx.courseRoom.findMany({where:{storeId,id:{in:ids}},select:{id:true}});
        if(rows.length!==ids.length) throw new AppError("FORBIDDEN","選取項目包含非本店教室");
        if(!d.active && !await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"}})) for(const id of ids) await assertNoCourseResourceUse(tx,storeId,{roomId:id});
        await tx.courseRoom.updateMany({where:{storeId,id:{in:ids}},data:{isActive:d.active}});
      } else if(d.kind==="subject") {
        if(!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"}})) throw new AppError("FORBIDDEN","僅適用音樂教室");
        const result=await tx.musicSubject.updateMany({where:{storeId,id:{in:ids}},data:{isActive:d.active}});
        if(result.count!==ids.length)throw new AppError("FORBIDDEN","找不到本店課程");
      } else {
        const rows=await tx.coursePointPlan.findMany({where:{storeId,id:{in:ids}},select:{id:true}});
        if(rows.length!==ids.length) throw new AppError("FORBIDDEN","選取項目包含非本店方案");
        await tx.coursePointPlan.updateMany({where:{storeId,id:{in:ids}},data:{isActive:d.active}});
      }
    });
    if(d.kind==="staff"){revalidateStaff();revalidateStaffPermissions();}
    revalidatePath("/dashboard","layout");revalidatePath("/book");
    return {success:true as const};
  } catch(e){return handleCourseActionError(e);}
}

export async function deleteCourseItems(input: unknown) {
  try {
    const d=z.object({kind:z.enum(["room","plan","staff","template"]),ids:z.array(z.string().min(1).max(180)).min(1).max(200)}).parse(input);
    const {storeId,user}=await courseManager(d.kind==="staff"?"staff.manage":d.kind==="plan"?"plans.edit":"booking.update");
    if(user.role!=="OWNER") throw new AppError("FORBIDDEN","僅店長可刪除項目");
    const {deleteUnusedCourseItems}=await import("@/server/services/course-delete");
    const count=await courseTransaction(storeId,tx=>deleteUnusedCourseItems(tx,{storeId,userId:user.id,staffId:user.staffId??undefined},d.kind,[...new Set(d.ids)]));
    if(d.kind==="staff"){revalidateStaff();revalidateStaffPermissions();}
    revalidatePath("/dashboard","layout");revalidatePath("/book");
    return {success:true as const,count};
  } catch(e){return handleCourseActionError(e);}
}

/** Each item commits independently; callers retain only failed selections. */
export async function applyCourseBatchStatus(input: unknown) {
  try {
    const d=z.object({kind:z.enum(["room","plan","staff","subject"]),ids:z.array(z.string().min(1).max(180)).min(1).max(200),active:z.boolean()}).parse(input);
    const succeeded:string[]=[];const failed:Array<{id:string;error:string}>=[];
    for(const id of [...new Set(d.ids)]) {
      const result=await batchCourseStatus({...d,ids:[id]});
      if(result.success)succeeded.push(id);else failed.push({id,error:result.error});
    }
    return {success:true as const,succeeded,failed};
  }catch(e){const result=handleCourseActionError(e);return {success:false as const,error:result.error??"操作失敗，請重試"};}
}

export async function courseStatusImpact(input:unknown){
  try {
    const d=z.object({kind:z.enum(["room","plan","staff","subject"]),ids:z.array(z.string().min(1).max(180)).min(1).max(200)}).parse(input);
    const {storeId,user}=await courseManager(d.kind==="staff"?"staff.manage":d.kind==="plan"?"plans.edit":"booking.update");
    if(d.kind==="staff"&&user.role!=="OWNER")throw new AppError("FORBIDDEN","僅店長可管理人員");
    const count=await courseTransaction(storeId,async tx=>d.kind==="plan"?0:tx.courseSession.count({where:{storeId,cancelledAt:null,endsAt:{gt:new Date()},...(d.kind==="room"?{roomId:{in:d.ids}}:d.kind==="staff"?{coachId:{in:d.ids}}:{template:{musicSubjectId:{in:d.ids}}})}}));
    return {success:true as const,count};
  }catch(e){const result=handleCourseActionError(e);return {success:false as const,error:result.error??"操作失敗，請重試"};}
}
