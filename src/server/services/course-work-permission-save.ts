import "server-only";
import {ZodError} from "zod";

import { courseWorkPermissionInput } from "@/lib/course-work-permission-save";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { courseManager } from "@/server/services/course-access";
import { revalidateStaffPermissions, revalidateStaffPermissionsInRoute } from "@/lib/revalidation";
import { revalidatePath } from "next/cache";



/** Partial grant: retains every other permission and the teacher's account. */
export async function saveCourseWorkPermission(input: unknown, transport:"action"|"route"="action") {
  try {
    const started=performance.now();
    const d = courseWorkPermissionInput.parse(input);
    const { user, storeId } = await courseManager("staff.manage");
    if (getEffectiveActorRole(user) !== "OWNER") throw new AppError("FORBIDDEN", "只有老闆能設定我的工作權限");
    if (d.storeId !== storeId) throw new AppError("FORBIDDEN", "門市已切換，請重新開啟");
    const authMs=Math.round(performance.now()-started);
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
      const actor = await tx.user.findFirst({where:{id:user.id,status:"ACTIVE",role:user.role},select:{id:true}});
      if (!actor) throw new AppError("FORBIDDEN", "帳號權限已變更");
      if (user.role==="OWNER"&&!await tx.staff.findFirst({where:{id:user.staffId??"",userId:user.id,storeId,status:"ACTIVE"},select:{id:true}})) throw new AppError("FORBIDDEN", "老闆帳號已停用或門市已變更");
      const staff = await tx.staff.findFirst({where:{id:d.staffId,storeId,courseCoachEnabled:true,user:{role:"CUSTOMER"}},select:{id:true,permissions:{where:{permission:d.permission,granted:true},select:{permission:true}}}});
      if (!staff) throw new AppError("FORBIDDEN", "找不到本店教師／教練");
      const previous = staff.permissions.length > 0;
      if (previous !== d.previous) throw new AppError("CONFLICT", "權限已更新，請重新開啟核對");
      await tx.staffPermission.upsert({where:{staffId_permission:{staffId:staff.id,permission:d.permission}},create:{staffId:staff.id,permission:d.permission,granted:d.enabled},update:{granted:d.enabled}});
      const updated = await tx.staff.update({where:{id:staff.id},data:{updatedAt:new Date()},select:{updatedAt:true}});
      await tx.auditLog.create({data:{actorUserId:user.id,storeId,module:"course",targetType:"StaffPermission",targetId:staff.id,action:"UPDATE",summary:d.permission==="teacher.income.read.self"?(d.enabled?"開放教師／教練查看自己的薪酬":"關閉教師／教練查看自己的薪酬"):`${d.enabled?"開放":"關閉"}授課人員${d.permission==="teacher.booking.leave"?"代學員請假":d.permission==="teacher.booking.reschedule"?"替學員改期":d.permission==="teacher.session.leave"?"自己請假（整堂停課）":"自己調課（整堂改時間）"}`,beforeJson:d.permission==="teacher.income.read.self"?{storeId,ownIncomeEnabled:previous}:{storeId,permission:d.permission,enabled:previous},afterJson:d.permission==="teacher.income.read.self"?{storeId,ownIncomeEnabled:d.enabled}:{storeId,permission:d.permission,enabled:d.enabled}}});
      return {storeId,staffId:staff.id,permission:d.permission,enabled:d.enabled,updatedAt:updated.updatedAt.toISOString()};
    });
    if(transport==="route")revalidateStaffPermissionsInRoute();else revalidateStaffPermissions();
    revalidatePath("/dashboard/teachers");revalidatePath("/dashboard/coaches");revalidatePath("/book");
    console.info("[COURSE_WORK_PERMISSION_PERF]",{authMs,totalMs:Math.round(performance.now()-started)});
    return {success:true as const,data:result};
  } catch (error) {
    const result = handleActionError(error);
    return {success:false as const,uncertain:!(error instanceof AppError||error instanceof ZodError)||(error instanceof AppError&&error.code==="CONFLICT"),error:result.success?"儲存失敗":result.error};
  }
}
