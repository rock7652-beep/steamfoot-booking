import {it,expect} from "vitest";
import {musicTeacherSettings,resolveMusicTeacherRule} from "@/lib/music-teacher-settings";
const defaults={defaultRatio:0.65,subjectRules:{guitar:{mode:"SHARE" as const,value:55}},revision:1};
it("resolves plan, subject, teacher and product in order",()=>{
 expect(resolveMusicTeacherRule({mode:"CLASS",value:800},"guitar",defaults,0.6).rule).toEqual({mode:"CLASS",value:800});
 expect(resolveMusicTeacherRule(null,"guitar",defaults,0.6).rule?.value).toBe(55);
 expect(resolveMusicTeacherRule(null,"piano",defaults,0.6).rule?.value).toBe(65);
 expect(resolveMusicTeacherRule(null,"piano",{...defaults,defaultRatio:null},0.6).rule?.value).toBe(60);
});
it("zero is an explicit rule; unset remains unknown",()=>{
 expect(resolveMusicTeacherRule(null,null,{...defaults,defaultRatio:0},0.6).rule?.value).toBe(0);
 expect(resolveMusicTeacherRule(null,null,{...defaults,defaultRatio:null},null).rule).toBeNull();
});
it.each([-0.1,1.1,NaN,Infinity])("rejects invalid ratio %s",defaultRatio=>expect(musicTeacherSettings.safeParse({...defaults,defaultRatio}).success).toBe(false));
