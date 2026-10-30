import {expect,it,vi} from 'vitest';
import type {Prisma} from '../../generated/course-client';
import {readSportsTeachingRules,sportsTeachingTemplateId} from '@/server/services/sports-teaching-rule';
it('loads 100 rules with three scoped queries, retaining missing items, coach order and fee defaults',async()=>{
 const subjects=Array.from({length:100},(_,i)=>`subject-${i}`),ids=subjects.map(id=>sportsTeachingTemplateId('store',id));
 const templates=vi.fn().mockResolvedValue(ids.slice(0,99).map((id,i)=>({id,pointCost:i+1})));
 const coaches=vi.fn().mockResolvedValue([{id:'a',courseQualifiedTemplateIds:[ids[0],ids[1]]},{id:'b',courseQualifiedTemplateIds:[ids[0]]}]);
 const fees=vi.fn().mockResolvedValue([{templateId:ids[0],rules:[{mode:'HOUR',value:700}]},{templateId:ids[1],rules:[{invalid:true}]}]);
 const tx={courseTemplate:{findMany:templates},$queryRaw:coaches,courseCompensation:{findMany:fees}} as unknown as Prisma.TransactionClient;
 const result=await readSportsTeachingRules(tx,'store',[...subjects,subjects[0]]);
 expect(result.size).toBe(99);expect(result.has(subjects[99])).toBe(false);
 expect(result.get(subjects[0])).toEqual({pointCost:1,coachIds:['a','b'],expectedCoachIds:['a','b'],compensation:{mode:'HOUR',value:700},expectedCompensation:{mode:'HOUR',value:700}});
 expect(result.get(subjects[1])).toMatchObject({pointCost:2,coachIds:['a'],compensation:{mode:'SHARE',value:60},expectedCompensation:null});
 expect(result.get(subjects[2])).toMatchObject({coachIds:[],expectedCompensation:null});
 expect(templates).toHaveBeenCalledExactlyOnceWith({where:{storeId:'store',id:{in:ids}},select:{id:true,pointCost:true}});
 expect(fees).toHaveBeenCalledExactlyOnceWith({where:{storeId:'store',templateId:{in:ids},staffId:''},select:{templateId:true,rules:true}});
 expect(coaches).toHaveBeenCalledOnce();expect(coaches.mock.calls[0][1]).toBe('store');expect(coaches.mock.calls[0][2]).toEqual(ids);
 expect(coaches.mock.calls[0][0].join('?')).toContain('status::text=\'ACTIVE\'');
 expect(coaches.mock.calls[0][0].join('?')).toContain('"courseCoachEnabled"=true');
});
it('does no database work for an empty catalog',async()=>{
 expect(await readSportsTeachingRules({} as Prisma.TransactionClient,'store',[])).toEqual(new Map());
});
