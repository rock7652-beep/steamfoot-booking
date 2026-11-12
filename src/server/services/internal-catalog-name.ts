import "server-only";
import type { Prisma } from "../../../generated/course-client";

/** Internal labels are not identity. Call within the caller's transaction/lock;
 * never adopt or modify an occupied row just because its label matches. */
export async function availableInternalCatalogName(baseName: string, occupied: (name: string) => Promise<unknown>) {
  let name = baseName;
  for (let suffix = 2; await occupied(name); suffix++) name = `${baseName}（${suffix}）`;
  return name;
}

export function availableCourseTemplateName(tx: Pick<Prisma.TransactionClient, "courseTemplate">, storeId: string, baseName: string, excludeId?: string) {
  return availableInternalCatalogName(baseName, name => tx.courseTemplate.findFirst({
    where: {storeId, name, ...(excludeId ? {id: {not: excludeId}} : {})}, select: {id: true},
  }));
}
