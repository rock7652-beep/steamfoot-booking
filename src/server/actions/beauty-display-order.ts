"use server";
import {prisma} from "@/lib/db";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {AppError,handleActionError} from "@/lib/errors";
import {FEATURES} from "@/lib/feature-flags";
import {requireStoreFeature} from "@/lib/feature-gate";
import {beautyManager,beautyTransaction,audit} from "@/server/beauty/access";
import type {CourseOrderSnapshot} from "@/lib/course-display-order";

/** Same display preference table, scoped to a verified Beauty store. Never calls Course mutations. */
export async function saveBeautyDisplayOrder(input:unknown){
 try{
  const d=z.object({kind:z.enum(["room","subject","plan","staff"]),ids:z.array(z.string().min(1).max(180)).max(5000),revision:z.number().int().min(0)}).strict().parse(input);
  if(new Set(d.ids).size!==d.ids.length)throw new AppError("VALIDATION","排序項目不可重複");
  const a=await beautyManager(d.kind==="room"?"business_hours.manage":d.kind==="staff"?"staff.manage":"plans.edit",true);
  if(d.kind!=="room")await requireStoreFeature(a.storeId,d.kind==="staff"?FEATURES.STAFF_MANAGEMENT:FEATURES.PLAN_MANAGEMENT);
  const revision=await beautyTransaction(a,async tx=>{
   const rows=d.kind==='staff'?[...await tx.beautyTechnician.findMany({where:{storeId:a.storeId},select:{id:true},orderBy:{id:'asc'}}),...await prisma.staff.findMany({where:{storeId:a.storeId},select:{id:true},orderBy:{id:'asc'}})]:d.kind==="room"?await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "CourseRoom" WHERE "storeId"=${a.storeId}`:d.kind==='plan'?await tx.beautyPlan.findMany({where:{storeId:a.storeId},select:{id:true},orderBy:{id:'asc'}}):await tx.beautyService.findMany({where:{storeId:a.storeId},select:{id:true},orderBy:{id:"asc"}});
   const knownIds=rows.map(r=>d.kind==='plan'?'plan:'+r.id:r.id);
   const known=new Set(knownIds);
   if(d.ids.some(id=>!known.has(id)))throw new AppError("FORBIDDEN","排序只能包含本店現有項目，請重新整理");
   const [previous]=await tx.$queryRaw<CourseOrderSnapshot[]>`SELECT ids,revision FROM "CourseDisplayOrder" WHERE "storeId"=${a.storeId} AND kind=${d.kind} FOR UPDATE`;
   if((previous?.revision??0)!==d.revision)throw new AppError("CONFLICT","其他人已調整排序，請重新整理後再試");
   const ids=[...d.ids,...(previous?.ids??[]).filter(id=>known.has(id)&&!d.ids.includes(id)),...knownIds.filter(id=>!d.ids.includes(id)&&!previous?.ids.includes(id))];
   await tx.$executeRaw`INSERT INTO "CourseDisplayOrder" ("storeId",kind,ids,revision) VALUES (${a.storeId},${d.kind},${ids}::text[],1) ON CONFLICT ("storeId",kind) DO UPDATE SET ids=EXCLUDED.ids,revision="CourseDisplayOrder".revision+1`;
   await audit(tx,a,"DISPLAY_ORDER",JSON.stringify({kind:d.kind,ids,revision:d.revision+1}));
   return d.revision+1;
  });
  revalidatePath("/dashboard/beauty");
  return {success:true as const,revision};
 }catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?"排序儲存失敗":r.error};}
}
