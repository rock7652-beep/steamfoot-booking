"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { courseManager } from "@/server/services/course-access";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { getCourseCards } from "@/server/queries/course-members";
import { AppError, handleActionError } from "@/lib/errors";

function failure(error: unknown) {
  const result = handleActionError(error);
  return { success: false as const, error: result.success ? "讀取失敗，請重試" : result.error };
}

export async function searchCourseCustomers(input: unknown) {
  try {
    const query = z.string().trim().max(200).parse(input);
    const { user, storeId } = await courseManager("customer.read");
    const rows = await prisma.customer.findMany({
      where: { ...getManagerCustomerWhere(user.role,user.staffId,storeId), storeId, mergedIntoCustomerId: null,
        OR: ["name", "phone", "lineName"].map(key => ({ [key]: { contains: query, mode: "insensitive" } })) },
      select: { id: true, name: true, phone: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 21,
    });
    return { success: true as const, rows: rows.slice(0,20), hasMore: rows.length > 20 };
  } catch (error) { return failure(error); }
}

export async function browseCourseCards(input: unknown) {
  try {
    const data = z.object({ customerId: z.string().min(1).optional(), cardId: z.string().min(1).optional(),
      search: z.string().trim().max(200).default(""), history: z.boolean().default(false), page: z.number().int().min(0).max(50000).default(0) }).parse(input);
    const { user, storeId } = await courseManager("wallet.read");
    await courseManager("customer.read");
    const visibility = getManagerCustomerWhere(user.role,user.staffId,storeId);
    if (data.customerId && !await prisma.customer.findFirst({where:{...visibility,storeId,id:data.customerId,mergedIntoCustomerId:null},select:{id:true}}))
      throw new AppError("NOT_FOUND","找不到本店顧客");
    // Respect customer visibility even when browsing from the plan screen.
    const visibleIds = typeof visibility.assignedStaffId === "string"
      ? (await prisma.customer.findMany({where:{...visibility,storeId,mergedIntoCustomerId:null},select:{id:true}})).map(c=>c.id) : null;
    const matchingIds = data.search ? (await prisma.customer.findMany({where:{...visibility,storeId,mergedIntoCustomerId:null,
      OR:[{name:{contains:data.search,mode:"insensitive"}},{phone:{contains:data.search}}]},select:{id:true}})).map(c=>c.id) : [];
    const cards = await getCourseCards(storeId,data.customerId,{
      where:{
        ...(data.cardId ? {id:data.cardId} : data.history ? {OR:[{closedAt:{not:null}},{expiresAt:{lt:new Date()}}]} : {closedAt:null,expiresAt:{gte:new Date()}}),
        AND:[...(visibleIds ? [{members:{some:{customerId:{in:visibleIds},storeId}}}] : []),
          ...(data.search ? [{OR:[{nameSnapshot:{contains:data.search,mode:"insensitive" as const}},{members:{some:{customerId:{in:matchingIds},storeId}}}]}] : [])],
      }, skip:data.cardId ? 0 : data.page*20, take:data.cardId ? 1 : 21, entries:!!data.cardId,
    });
    return {success:true as const, rows:cards.slice(0,20),hasMore:cards.length>20};
  } catch(error) { return failure(error); }
}
