import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError, handleActionError } from "@/lib/errors";
import { formatTWDateTime } from "@/lib/date-utils";

export type CourseConflict = { id: string; name: string; startsAt: string; capacity: number };
export class ResourceConflict extends AppError {
  constructor(message: string, public conflicts: CourseConflict[]) { super("CONFLICT", message); }
}
export function handleCourseActionError(error: unknown) {
  if (error instanceof ResourceConflict) return { success: false as const, error: error.message, conflicts: error.conflicts };
  return { ...handleActionError(error), conflicts: [] as CourseConflict[] };
}
export async function assertNoCourseResourceUse(tx: Pick<Prisma.TransactionClient,"courseSession">, storeId: string,
  resource: { roomId?: string; coachId?: string; templateIds?: string[]; capacity?: number }, now = new Date()) {
  const sessions = await tx.courseSession.findMany({where: {storeId,cancelledAt:null,endsAt:{gt:now},
    ...(resource.roomId ? {roomId:resource.roomId} : {}), ...(resource.coachId ? {coachId:resource.coachId}:{}),
    ...(resource.templateIds ? {templateId:{in:resource.templateIds}} : {}),
    ...(resource.capacity !== undefined ? {capacity:{gt:resource.capacity}} : {})},
    select:{id:true,nameSnapshot:true,startsAt:true,capacity:true}, orderBy:{startsAt:"asc"}});
  if (sessions.length) throw new ResourceConflict(`尚有 ${sessions.length} 堂未結束課程（含進行中），請先處理排課後重試：${formatTWDateTime(sessions[0].startsAt)} ${sessions[0].nameSnapshot}`,
    sessions.map(s=>({id:s.id,name:s.nameSnapshot,startsAt:s.startsAt.toISOString(),capacity:s.capacity})));
}
/** Called under the same Store row lock by all scheduling/resource writers. */
export async function assertCourseResources(tx: Pick<Prisma.TransactionClient,"$queryRaw"|"courseRoom"|"courseTemplate">, storeId: string,
  input: {templateId:string;roomId:string;coachId:string;capacity:number}, previous?: {templateId:string;coachId:string}) {
  const [room, template, staff] = await Promise.all([
    tx.courseRoom.findFirst({where:{id:input.roomId,storeId,isActive:true}}),
    tx.courseTemplate.findFirst({where:{id:input.templateId,storeId}}),
    tx.$queryRaw<Array<{courseCoachEnabled:boolean;courseQualificationsConfirmed:boolean;courseQualifiedTemplateIds:string[]}>>`
      SELECT "courseCoachEnabled","courseQualificationsConfirmed","courseQualifiedTemplateIds" FROM "Staff"
      WHERE id=${input.coachId} AND "storeId"=${storeId} AND status::text='ACTIVE'`
  ]);
  if (!room || !template || !staff[0]?.courseCoachEnabled) throw new AppError("VALIDATION","請選擇本店啟用教室及具教練身分的人員");
  if ((!previous || previous.templateId !== input.templateId) && (!template.isActive || template.visibility === 'OFF')) throw new AppError("VALIDATION","下架課程不可新增使用");
  if (room.capacity !== null && input.capacity > room.capacity) throw new AppError("CONFLICT",`排課上限 ${input.capacity} 人超過教室容量 ${room.capacity} 人`);
  const unchanged = previous?.coachId === input.coachId && previous.templateId === input.templateId;
  const coach = staff[0];
  if ((!unchanged || coach.courseQualificationsConfirmed) && (!coach.courseQualificationsConfirmed || !coach.courseQualifiedTemplateIds.includes(input.templateId))) throw new AppError("VALIDATION","教練尚未具備本課程授課資格，請先由店長一次設定可教課程");
}
