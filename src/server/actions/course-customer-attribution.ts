"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { handleActionError } from "@/lib/errors";
import { updateCustomerAssignmentSchema, bulkUpdateCustomerAssignmentSchema } from "@/lib/validators/customer";
import { courseManager } from "@/server/services/course-access";
import {assignCustomersAtomically,saveCustomerAttributionAtomically,findCustomerReferrers} from "@/server/services/customer-attribution-core";
import { lockCourseStore } from "@/server/services/course-store-lock";
import type { ActionResult } from "@/types";
import { requireWritablePermission } from "@/lib/permissions";

export async function bulkAssignCourseCustomers(input: z.infer<typeof bulkUpdateCustomerAssignmentSchema>): Promise<ActionResult<{ count: number }>> {
  try {
    await requireWritablePermission("customer.assign");
    const data = bulkUpdateCustomerAssignmentSchema.parse(input);
    const { storeId, user } = await courseManager("customer.assign");
    const count = await assignCustomersAtomically({storeId,userId:user.id,customerIds:data.customerIds,assignedStaffId:data.assignedStaffId,lockStore:tx=>lockCourseStore(tx,storeId),eligibleStaff:{OR:[{courseCoachEnabled:true},{user:{role:"OWNER"}}]},auditAction:"COURSE_BULK_ASSIGN"});
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    return { success: true, data: { count } };
  } catch (error) { return handleActionError(error); }
}

export async function saveCourseCustomerAttribution(input: z.infer<typeof updateCustomerAssignmentSchema>): Promise<ActionResult<void>> {
  try {
    await requireWritablePermission("customer.assign");
    const data = updateCustomerAssignmentSchema.extend({assignedStaffId:z.string()}).parse(input);
    const { storeId, user } = await courseManager("customer.assign");
    const music = !!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}});
    await saveCustomerAttributionAtomically({storeId,userId:user.id,data,lockStore:tx=>lockCourseStore(tx,storeId),eligibleStaff:{OR:[{courseCoachEnabled:true},{user:{role:"OWNER"}}]},preserveStaff:music,auditAction:"COURSE_CUSTOMER_ATTRIBUTION"});
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    return { success: true, data: undefined };
  } catch (error) { return handleActionError(error); }
}

export async function searchCourseReferrerCandidates(query: string, excludeCustomerId?: string): Promise<ActionResult<Array<{ id: string; name: string; phoneMasked: string }>>> {
  try {
    const { storeId } = await courseManager("customer.read");
    const q = z.string().trim().max(100).parse(query);
    if (!q) return { success: true, data: [] };
    return {success:true,data:await findCustomerReferrers(storeId,q,excludeCustomerId)};
  } catch (error) { return handleActionError(error); }
}
