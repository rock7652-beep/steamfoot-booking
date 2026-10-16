"use server";
import {readCourseCards} from "@/server/queries/course-card-browser";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { courseManagerRead } from "@/server/services/course-access";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { AppError, handleActionError } from "@/lib/errors";

function failure(error: unknown) {
  const result = handleActionError(error);
  return { success: false as const, error: result.success ? "讀取失敗，請重試" : result.error };
}

export async function searchCourseCustomers(input: unknown) {
  try {
    const query = z.string().trim().max(200).parse(input);
    const { user, storeId } = await courseManagerRead("customer.read");
    const rows = await prisma.customer.findMany({
      where: { ...getManagerCustomerWhere(user.role,user.staffId,storeId), storeId, mergedIntoCustomerId: null,
        OR: ["name", "phone", "lineName"].map(key => ({ [key]: { contains: query, mode: "insensitive" } })) },
      select: { id: true, name: true, phone: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 21,
    });
    return { success: true as const, rows: rows.slice(0,20), hasMore: rows.length > 20 };
  } catch (error) { return failure(error); }
}

export async function browseCourseCards(input: unknown) {
  return readCourseCards(input);
}

/** Lightweight, permission-scoped index. Kept only in the mounted picker. */
export async function loadCourseCustomerSearchIndex() {
  try {
    const { user, storeId } = await courseManagerRead("customer.read");
    const rows = await prisma.customer.findMany({
      where: { ...getManagerCustomerWhere(user.role,user.staffId,storeId), storeId, mergedIntoCustomerId: null },
      select: { id: true, name: true, phone: true, lineName: true },
      orderBy: [{ name: "asc" }, { id: "asc" }], take: 2001,
    });
    return { success: true as const, scope: `${user.id}:${storeId}`, rows: rows.slice(0,2000), complete: rows.length <= 2000 };
  } catch(error) { return failure(error); }
}
