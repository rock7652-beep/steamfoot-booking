import {expect,it} from 'vitest';
import {capturedTeacherFee} from '@/server/services/course-captured-teacher-fee';
import {coursePlanCompensation} from '@/lib/course-plan-compensation';
import {courseChargeSettings,qualifiedCourseChargeSettings,cardChargeSettings,courseChargeAllowsProvider} from '@/lib/course-charge-settings';
const seat={id:'s',customerName:'合成學員',status:'ATTENDED',bookingKind:'CARD',absenceKind:null,originalUnitPrice:800,sportsCharge:800,planId:'A1'};
const snapshot=(version:number,rules:Record<string,unknown>,durationMinutes=50)=>({revision:1,rule:{mode:'SHARE',value:60,calculationVersion:version,planRules:rules,durationMinutes}});
it.each([2,3])('independent per-plan rates in calculation version %s',version=>{
 const capture=snapshot(version,{A1:{mode:'SHARE',value:60},A2:{mode:'SHARE',value:70}});
 expect(capturedTeacherFee(capture,[seat]).amount).toBe(480);
 expect(capturedTeacherFee(capture,[{...seat,planId:'A2'}]).amount).toBe(560);
 expect(capturedTeacherFee(capture,[seat,{...seat,id:'b',planId:'A2'}]).amount).toBe(1040);
});
it.each([2,3])('fixed fees are once per event at any duration/headcount, v%s',version=>{
 for(const minutes of [50,90,120,180])for(const count of [1,6])expect(capturedTeacherFee(snapshot(version,{A1:{mode:'CLASS',value:600}},minutes),Array.from({length:count},(_,i)=>({...seat,id:String(i)}))).amount).toBe(600);
 expect(capturedTeacherFee(snapshot(version,{A1:{mode:'CLASS',value:0}}),[seat]).amount).toBe(0);
});
it.each([2,3])('does not silently sum conflicting fixed fees or mix fixed/share, v%s',version=>{
 for(const second of [{mode:'CLASS',value:900},{mode:'SHARE',value:60}])expect(capturedTeacherFee(snapshot(version,{A1:{mode:'CLASS',value:600},A2:second}),[seat,{...seat,id:'b',planId:'A2'}])).toMatchObject({amount:null,issue:expect.stringContaining('請核對')});
 expect(capturedTeacherFee(snapshot(version,{A1:{mode:'CLASS',value:600},A2:{mode:'CLASS',value:600}}),[seat,{...seat,id:'b',planId:'A2'}]).amount).toBe(600);
});
it('allows only the agreed two modes for new agreements',()=>{
 expect(coursePlanCompensation.safeParse({mode:'HOUR',value:600}).success).toBe(false);
 expect(coursePlanCompensation.safeParse({mode:'CLASS',value:600.5}).success).toBe(false);
 expect(coursePlanCompensation.safeParse({mode:'SHARE',value:100.01}).success).toBe(false);
});
it('new fees need no provider roster while existing sold-plan rosters stay unchanged',()=>{
 const base={kind:'plan' as const,durationMinutes:50,trialPrice:null,trialDuration:null,providerScope:'QUALIFIED' as const,providerIds:[]};
 expect(courseChargeSettings.parse(base)).toMatchObject({providerIds:[]});
 expect(courseChargeAllowsProvider(base,'new-qualified-teacher')).toBe(true);
 const old={...base,providerScope:undefined,providerIds:['old-teacher']};
 expect(qualifiedCourseChargeSettings(old)).toMatchObject({providerIds:[],providerScope:'QUALIFIED'});
 expect(cardChargeSettings({chargeSettingsSnapshot:old,plan:{chargeSettings:base}})).toEqual(old);
 expect(courseChargeSettings.safeParse({...base,providerScope:undefined}).success).toBe(false);
});
