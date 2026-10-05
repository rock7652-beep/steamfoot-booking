"use server";
import {z} from "zod";
import {courseManager,courseTransaction} from "@/server/services/course-access";
import {AppError} from "@/lib/errors";
import {handleCourseActionError} from "@/server/services/course-resources";
import {revalidatePath} from "next/cache";
import type {CourseOrderSnapshot} from "@/lib/course-display-order";

export async function saveCourseDisplayOrder(input:unknown) {
  try {
    const d=z.object({kind:z.enum(["subject","plan","room","staff"]),ids:z.array(z.string().min(1).max(180)).max(5000),revision:z.number().int().min(0)}).parse(input);
    if(new Set(d.ids).size!==d.ids.length)throw new AppError("VALIDATION","排序項目不可重複");
    const {storeId,user}=await courseManager(d.kind==="staff"?"staff.manage":d.kind==="plan"?"plans.edit":"booking.update");
    if(d.kind==="staff"&&!["OWNER","MANAGER","ADMIN"].includes(user.role))throw new AppError("FORBIDDEN","僅店長可管理人員");
    const revision=await courseTransaction(storeId,async tx=>{
      const rows=d.kind==="subject"?await tx.musicSubject.findMany({where:{storeId},select:{id:true}}):d.kind==="plan"?await tx.coursePointPlan.findMany({where:{storeId},select:{id:true}}):d.kind==="room"?await tx.courseRoom.findMany({where:{storeId},select:{id:true}}):await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Staff" WHERE "storeId"=${storeId}`;
      const known=new Set(rows.map(r=>r.id));
      if(d.ids.some(id=>!known.has(id)))throw new AppError("FORBIDDEN","排序只能包含本店現有項目，請重新整理");
      const [previous]=await tx.$queryRaw<CourseOrderSnapshot[]>`SELECT ids,revision FROM "CourseDisplayOrder" WHERE "storeId"=${storeId} AND kind=${d.kind} FOR UPDATE`;
      if((previous?.revision??0)!==d.revision)throw new AppError("CONFLICT","其他人已調整排序，請重新整理後再試");
      // Newly created or hidden items remain in their previous order rather than being dropped.
      const ids=[...d.ids,...(previous?.ids??[]).filter(id=>known.has(id)&&!d.ids.includes(id)),...rows.map(r=>r.id).filter(id=>!d.ids.includes(id)&&!previous?.ids.includes(id))];
      await tx.$executeRaw`INSERT INTO "CourseDisplayOrder" ("storeId",kind,ids,revision) VALUES (${storeId},${d.kind},${ids}::text[],1) ON CONFLICT ("storeId",kind) DO UPDATE SET ids=EXCLUDED.ids,revision="CourseDisplayOrder".revision+1`;
      return d.revision+1;
    });
    revalidatePath("/dashboard/courses");revalidatePath("/dashboard/staff");
    return {success:true as const,revision};
  }catch(e){const result=handleCourseActionError(e);return {success:false as const,error:result.error??"排序儲存失敗"};}
}
