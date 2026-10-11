"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { courseManager } from "@/server/services/course-access";
import { writeStaffPermissionChanges } from "@/server/services/staff-permission-write";
import { revalidateStaffPermissions } from "@/lib/revalidation";
import { revalidatePath } from "next/cache";

const inputSchema = z.object({storeId:z.string().min(1).max(180),staffId:z.string().min(1).max(180),enabled:z.boolean(),previous:z.boolean()});

/** Partial grant: retains every other permission and the teacher's account. */
export async function saveCourseOwnIncomeAccess(input: unknown) {
  try {
    const d = inputSchema.parse(input);
    const { user, storeId } = await courseManager("staff.manage");
    if (getEffectiveActorRole(user) !== "OWNER") throw new AppError("FORBIDDEN", "只有老闆能設定薪酬查看權限");
    if (d.storeId !== storeId) throw new AppError("FORBIDDEN", "門市已切換，請重新開啟");
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
      const actor = await tx.user.findFirst({where:{id:user.id,status:"ACTIVE",role:user.role},select:{id:true}});
      if (!actor) throw new AppError("FORBIDDEN", "帳號權限已變更");
      if (user.role==="OWNER"&&!await tx.staff.findFirst({where:{id:user.staffId??"",userId:user.id,storeId,status:"ACTIVE"},select:{id:true}})) throw new AppError("FORBIDDEN", "老闆帳號已停用或門市已變更");
      const staff = await tx.staff.findFirst({where:{id:d.staffId,storeId,courseCoachEnabled:true,user:{role:"CUSTOMER"}},select:{id:true,permissions:{where:{permission:"teacher.income.read.self",granted:true},select:{permission:true}}}});
      if (!staff) throw new AppError("FORBIDDEN", "找不到本店教師／教練");
      const previous = staff.permissions.length > 0;
      if (previous !== d.previous) throw new AppError("CONFLICT", "權限已更新，請重新開啟核對");
      await writeStaffPermissionChanges(tx,staff.id,[{permission:"teacher.income.read.self",granted:d.enabled}]);
      const updated = await tx.staff.update({where:{id:staff.id},data:{updatedAt:new Date()},select:{updatedAt:true}});
      await tx.auditLog.create({data:{actorUserId:user.id,storeId,module:"course",targetType:"StaffPermission",targetId:staff.id,action:"UPDATE",summary:d.enabled?"開放教師／教練查看自己的薪酬":"關閉教師／教練查看自己的薪酬",beforeJson:{storeId,ownIncomeEnabled:previous},afterJson:{storeId,ownIncomeEnabled:d.enabled}}});
      return {enabled:d.enabled,updatedAt:updated.updatedAt.toISOString()};
    });
    revalidateStaffPermissions();
    revalidatePath("/dashboard/teachers");revalidatePath("/dashboard/coaches");revalidatePath("/book");
    return {success:true as const,data:result};
  } catch (error) {
    const result = handleActionError(error);
    return {success:false as const,error:result.success?"儲存失敗":result.error};
  }
}
