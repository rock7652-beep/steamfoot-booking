import {expect,it} from 'vitest';
import {sameCoursePlanRevision} from '@/lib/course-plan-revision';
const plan={name:'吉他一對二$650',points:4,price:2600,validDays:35,isActive:true,unit:'SESSION',templateIds:['A'],chargeSettings:{kind:'plan',durationMinutes:60,trialPrice:null,trialDuration:null,providerIds:['teacher']}};
it('compares persisted JSONB and parsed receipt property orders without a false conflict',()=>{
 const reordered={...plan,chargeSettings:{providerIds:['teacher'],trialDuration:null,trialPrice:null,durationMinutes:60,kind:'plan'}};
 expect(JSON.stringify(plan)).not.toBe(JSON.stringify(reordered));
 expect(sameCoursePlanRevision(JSON.stringify(plan),JSON.stringify(reordered))).toBe(true);
 expect(sameCoursePlanRevision(JSON.stringify(plan),JSON.stringify({...plan,musicTerms:null,storeCost:0}))).toBe(true);
});
it('keeps actual business changes, scope changes and invalid revisions distinct',()=>{
 for(const patch of [{price:2800},{templateIds:['B']},{chargeSettings:{...plan.chargeSettings,durationMinutes:90}}])expect(sameCoursePlanRevision(JSON.stringify(plan),JSON.stringify({...plan,...patch}))).toBe(false);
 expect(sameCoursePlanRevision('broken',JSON.stringify(plan))).toBe(false);
 expect(sameCoursePlanRevision(null,JSON.stringify(plan))).toBe(false);
});
