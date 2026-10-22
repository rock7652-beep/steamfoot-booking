import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";

type Teacher = { id: string; courseQualifiedTemplateIds: string[]; courseCoachEnabled: boolean; courseQualificationsConfirmed:boolean; active: boolean };
const equal = (a: string[], b: string[]) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());
/** Called under the shared Store lock. All fee versions use one subject qualification. */
export async function syncMusicSubjectTeachers(tx: Prisma.TransactionClient, storeId: string, subjectId: string, selected?: string[], expected?: string[], authorizeChange?: () => Promise<unknown>) {
  const templates = await tx.courseTemplate.findMany({ where: { storeId, musicSubjectId: subjectId }, select: { id: true } });
  const templateIds = templates.map(t => t.id);
  if (!templateIds.length) throw new AppError("VALIDATION", "請先建立教學項目");
  const teachers = await tx.$queryRaw<Teacher[]>`SELECT s.id,s."courseQualifiedTemplateIds",s."courseCoachEnabled",s."courseQualificationsConfirmed",(s.status::text='ACTIVE' AND u.status::text='ACTIVE') AS active FROM "Staff" s JOIN "User" u ON u.id=s."userId" WHERE s."storeId"=${storeId}`;
  const current = teachers.filter(t => t.courseCoachEnabled && t.courseQualifiedTemplateIds.some(id => templateIds.includes(id))).map(t => t.id);
  if (selected && !expected) throw new AppError("VALIDATION", "請重新讀取目前授課教師後再儲存");
  if (selected && expected && !equal(current, expected)) throw new AppError("CONFLICT", "授課教師已有更新，請重新開啟收費方式後再核對");
  const target = selected ? [...new Set(selected)] : current;
  if (!target.length) throw new AppError("VALIDATION", "請至少選擇一位可授課教師");
  if (target.some(id => !teachers.some(t => t.id === id && t.courseCoachEnabled && (t.active || current.includes(id)))))
    throw new AppError("VALIDATION", "請選擇本店啟用的教師");
  const changed = !equal(current, target) || teachers.some(t=>target.includes(t.id)&&!t.courseQualificationsConfirmed);
  if (changed) {
    if (!authorizeChange) throw new AppError("FORBIDDEN", "修改教師資格需要人員管理權限");
    await authorizeChange();
  }
  // A new price version inherits every qualified teacher even if selection is unchanged.
  for (const teacher of teachers) {
    const qualificationIds = target.includes(teacher.id)
      ? [...new Set([...teacher.courseQualifiedTemplateIds, ...templateIds])]
      : teacher.courseQualifiedTemplateIds.filter(id => !templateIds.includes(id));
    if (equal(qualificationIds, teacher.courseQualifiedTemplateIds) && (!target.includes(teacher.id)||teacher.courseQualificationsConfirmed)) continue;
    await tx.$executeRaw`UPDATE "Staff" SET "courseQualifiedTemplateIds"=${qualificationIds}::text[],"courseQualificationsConfirmed"=true,"updatedAt"=clock_timestamp() WHERE id=${teacher.id} AND "storeId"=${storeId}`;
  }
  return { changed, before: current, after: target };
}
