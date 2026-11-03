import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { coursePersonnelText, type CoursePersonnelLabel } from "@/lib/course-personnel-label";
/** Called only with a store resolved by the authenticated layout/account. */
export const readCoursePersonnelLabel = cache(async (storeId: string): Promise<CoursePersonnelLabel | null> => {
  const [row] = await prisma.$queryRaw<Array<{ label: string | null }>>`SELECT "coursePersonnelLabel" AS label FROM "ShopConfig" WHERE "storeId"=${storeId}`;
  return row?.label === "老師" || row?.label === "教練" ? row.label : null;
});

export async function getCoursePersonnelText(storeId: string) {
  const label = await readCoursePersonnelLabel(storeId);
  return (text: string) => coursePersonnelText(text, label);
}
