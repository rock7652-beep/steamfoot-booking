import "server-only";
import {coursePrisma} from "@/lib/course-db";
import type {CourseOrderKind,CourseOrderSnapshot} from "@/lib/course-display-order";
export async function readCourseOrders(storeId:string) {
  const rows=await coursePrisma.$queryRaw<Array<CourseOrderSnapshot&{kind:CourseOrderKind}>>`SELECT kind,ids,revision FROM "CourseDisplayOrder" WHERE "storeId"=${storeId}`;
  return Object.fromEntries(rows.map(r=>[r.kind,{ids:r.ids,revision:r.revision}])) as Partial<Record<CourseOrderKind,CourseOrderSnapshot>>;
}
