import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";

const tables = { room: "CourseRoom", plan: "CoursePointPlan", template: "CourseTemplate", staff: "Staff" } as const;
export type CourseDeleteKind = keyof typeof tables;
const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
/** Under the store lock; never cascade into history or delete the login account. */
export async function deleteUnusedCourseItems(tx: Prisma.TransactionClient, actor: { storeId: string; userId: string; staffId?: string }, kind: CourseDeleteKind, ids: string[]) {
  const table = tables[kind];
  const rows = await tx.$queryRawUnsafe<Array<{id:string;name?:string;displayName?:string;isOwner?:boolean;status?:string}>>(
    `SELECT * FROM ${quote(table)} WHERE "storeId"=$1 AND id=ANY($2::text[]) FOR UPDATE`, actor.storeId, ids);
  if (rows.length !== ids.length) throw new AppError("FORBIDDEN", "選取項目已不存在或不屬於本店；未刪除任何資料");
  if (kind === "staff" && rows.some(r => r.id === actor.staffId || r.isOwner || r.status !== "INACTIVE")) throw new AppError("BUSINESS_RULE", "僅可刪除未使用的停用人員；本人及店長不可刪除");
  // Guard every inbound FK, including SET NULL and CASCADE, before DELETE.
  // Identifiers come only from PostgreSQL's catalog; all user values remain bound parameters.
  const refs = await tx.$queryRaw<Array<{schema:string;table:string;columns:string[];targets:string[]}>>`
    SELECT ns.nspname AS schema, cl.relname AS table,
      array_agg(src.attname ORDER BY k.ordinality) AS columns,
      array_agg(dst.attname ORDER BY k.ordinality) AS targets
    FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace
    CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY AS k(src,dst,ordinality)
    JOIN pg_attribute src ON src.attrelid=c.conrelid AND src.attnum=k.src
    JOIN pg_attribute dst ON dst.attrelid=c.confrelid AND dst.attnum=k.dst
    WHERE c.contype='f' AND c.confrelid=to_regclass(${quote(table)})
    GROUP BY c.oid,ns.nspname,cl.relname`;
  for (const ref of refs) {
    if ((kind === "staff" && ref.table === "StaffPermission") || (kind === "template" && ref.table === "CourseCompensation")) continue;
    const join = ref.columns.map((col,i)=>`child.${quote(col)}=parent.${quote(ref.targets[i])}`).join(" AND ");
    const [used] = await tx.$queryRawUnsafe<Array<{used:boolean}>>(`SELECT EXISTS(SELECT 1 FROM ${quote(ref.schema)}.${quote(ref.table)} child JOIN ${quote(table)} parent ON ${join} WHERE parent."storeId"=$1 AND parent.id=ANY($2::text[])) AS used`,actor.storeId,ids);
    if (used.used) throw new AppError("BUSINESS_RULE", "選取項目已有排課、方案、會員或其他使用關聯；請改用下架／停用。未刪除任何資料。");
  }
  if (kind === "plan" && await tx.coursePurchase.count({where:{storeId:actor.storeId,planId:{in:ids}}})) throw new AppError("BUSINESS_RULE", "方案已有購買紀錄，請改用下架");
  if (kind === "template") {
    const [used] = await tx.$queryRaw<Array<{used:boolean}>>`SELECT EXISTS(
      SELECT 1 FROM "CoursePointPlan" WHERE "storeId"=${actor.storeId} AND "templateIds" && ${ids}::text[]
      UNION ALL SELECT 1 FROM "CoursePointCard" WHERE "storeId"=${actor.storeId} AND "templateIds" && ${ids}::text[]
      UNION ALL SELECT 1 FROM "CoursePurchase" WHERE "storeId"=${actor.storeId} AND "templateIds" && ${ids}::text[]
      UNION ALL SELECT 1 FROM "Staff" WHERE "storeId"=${actor.storeId} AND "courseQualifiedTemplateIds" && ${ids}::text[]
    ) AS used`;
    if(used.used) throw new AppError("BUSINESS_RULE", "課程已被方案或教練授課項目使用，請先解除設定；已有歷史紀錄請改用下架。");
    await tx.courseCompensation.deleteMany({where:{storeId:actor.storeId,templateId:{in:ids}}});
  }
  if (kind === "staff") {
    // These snapshot/config staff IDs deliberately have no Staff FK.
    const used=await tx.courseCompensationSnapshot.count({where:{storeId:actor.storeId,staffId:{in:ids}}});
    if(used) throw new AppError("BUSINESS_RULE", "人員已有授課計酬紀錄，請保留停用狀態");
    await tx.courseCompensation.deleteMany({where:{storeId:actor.storeId,staffId:{in:ids}}});
    await tx.$executeRaw`DELETE FROM "StaffPermission" WHERE "staffId"=ANY(${ids}::text[])`;
  }
  await tx.$executeRawUnsafe(`DELETE FROM ${quote(table)} WHERE "storeId"=$1 AND id=ANY($2::text[])`,actor.storeId,ids);
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","createdAt") VALUES (${crypto.randomUUID()},${actor.userId},${table},${ids.join(",")},'DELETE_UNUSED',${JSON.stringify({storeId:actor.storeId,items:rows.map(r=>({id:r.id,name:r.name??r.displayName}))})}::jsonb,NOW())`;
  return rows.length;
}
