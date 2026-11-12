import 'server-only';
import type {Prisma} from '../../../generated/course-client';
import {coursePlanCompensation,musicSubjectDefaultId} from '@/lib/course-plan-compensation';
/** Catalog reads include persisted defaults; never replace saved minutes with a UI fallback. */
export async function enrichMusicSubjectDefaults<T extends {id:string}>(tx:Pick<Prisma.TransactionClient,'courseTemplate'|'courseCompensation'>,storeId:string,subjects:T[],readFees=true){
 if(!subjects.length)return subjects;
 const ids=subjects.map(s=>s.id);
 const [templates,fees]=await Promise.all([
  tx.courseTemplate.findMany({where:{storeId,musicSubjectId:{in:ids}},select:{id:true,musicSubjectId:true,durationMinutes:true,visibility:true,precautions:true},orderBy:[{createdAt:'asc'},{id:'asc'}]}),
  readFees?tx.courseCompensation.findMany({where:{storeId,staffId:'',templateId:{in:ids.map(musicSubjectDefaultId)}},select:{templateId:true,rules:true}}):Promise.resolve([]),
 ]);
 return subjects.map(subject=>{const versions=templates.filter(t=>t.musicSubjectId===subject.id),template=versions.find(t=>t.id===musicSubjectDefaultId(subject.id))??versions[0];const parsed=coursePlanCompensation.safeParse((fees.find(f=>f.templateId===musicSubjectDefaultId(subject.id))?.rules as unknown[])?.[0]);return {...subject,...(template?{durationMinutes:template.durationMinutes,visibility:template.visibility,precautions:template.precautions}:{}),compensation:parsed.success?parsed.data:undefined};});
}
