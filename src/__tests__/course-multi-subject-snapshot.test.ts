import {expect,it} from "vitest";
import {coursePlanValues,coursePlanSaveInput,COURSE_PLAN_SNAPSHOT_MAX} from "@/lib/course-plan-save";
import {coursePlanSnapshot} from "@/lib/course-plan-snapshot";
it('keeps a select-all snapshot editable at the supported subject limit',()=>{
 const ids=Array.from({length:200},(_,index)=>String(index).padStart(3,'0')+'s'.repeat(97));
 const values=coursePlanValues.parse({name:'全選通用卡',points:10,price:4500,validDays:90,unit:'SESSION',sportsMode:'SUBJECTS',sportsSubjectId:null,sportsSubjectIds:ids,sportsCost:1,templateIds:ids.map(id=>'t'+id.slice(1))});
 const revision=JSON.stringify(coursePlanSnapshot(values));
 expect(revision.length).toBeGreaterThan(30000);
 expect(coursePlanSaveInput.safeParse({...values,id:'plan',expectedSnapshot:revision,expectedStoreId:'store',requestKey:'00000000-0000-4000-8000-000000000001'}).success).toBe(true);
});

it('continues to reject oversized revisions before a multi-subject save',()=>{
 expect(coursePlanSaveInput.safeParse({name:'通用卡',points:10,price:4500,validDays:90,id:'plan',expectedSnapshot:'x'.repeat(COURSE_PLAN_SNAPSHOT_MAX+1),expectedStoreId:'store',requestKey:'00000000-0000-4000-8000-000000000001'}).success).toBe(false);
});
