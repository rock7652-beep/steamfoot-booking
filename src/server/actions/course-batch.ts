"use server";
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
    const d=z.object({kind:z.enum(["room","plan","staff"]),ids:z.array(z.string().min(1).max(180)).min(1).max(200),active:z.boolean()}).parse(input);
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
        if(d.active && limits?.maxStaff!=null) {
          const [r]=await tx.$queryRaw<Array<{count:bigint}>>`SELECT count(*) FROM "Staff" WHERE "storeId"=${storeId} AND status::text='ACTIVE'`;
          if(Number(r.count)+rows.filter(r=>r.status!=="ACTIVE").length>limits.maxStaff) throw new AppError("FORBIDDEN","啟用後超過人員上限，未變更任何資料");
        }
        if(d.active) await tx.$executeRaw`UPDATE "Staff" SET status='ACTIVE' WHERE "storeId"=${storeId} AND id=ANY(${ids}::text[])`;
        else await tx.$executeRaw`UPDATE "Staff" SET status='INACTIVE' WHERE "storeId"=${storeId} AND id=ANY(${ids}::text[])`;
        if(!d.active) await tx.$executeRaw`UPDATE "StaffMemberLink" SET "revokedAt"=NOW() WHERE "storeId"=${storeId} AND "staffId"=ANY(${ids}::text[])`;
        // Reactivation follows the individual editor, including coach-work access.
        else {const coaches=rows.filter(r=>r.courseCoachEnabled).map(r=>r.id);if(coaches.length) await tx.$executeRaw`UPDATE "StaffMemberLink" SET "revokedAt"=NULL WHERE "storeId"=${storeId} AND "staffId"=ANY(${coaches}::text[])`;}
      } else if(d.kind==="room") {
        const rows=await tx.courseRoom.findMany({where:{storeId,id:{in:ids}},select:{id:true}});
        if(rows.length!==ids.length) throw new AppError("FORBIDDEN","選取項目包含非本店教室");
        if(!d.active) for(const id of ids) await assertNoCourseResourceUse(tx,storeId,{roomId:id});
        await tx.courseRoom.updateMany({where:{storeId,id:{in:ids}},data:{isActive:d.active}});
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
