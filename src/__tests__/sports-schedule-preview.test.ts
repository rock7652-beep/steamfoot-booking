import {expect,it} from 'vitest';
import {sportsSchedulePreview} from '@/lib/sports-schedule-preview';
it('prepares only authorized calendar metadata and uses canonical teaching item names',()=>{
 const subject={id:'a',name:'A課程',isActive:true};
 const result=sportsSchedulePreview('store','2026-11-27',[
  {id:'sports_item_a',name:'舊方案-20堂',isActive:true,musicSubject:subject,durationMinutes:60},
  {id:'legacy',name:'另一方案',isActive:true,musicSubject:subject,durationMinutes:60},
  {id:'sports_item_off',name:'停用',isActive:false,musicSubject:subject,durationMinutes:60},
 ],[{id:'teacher',displayName:'老師',status:'ACTIVE',courseCoachEnabled:true,courseQualifiedTemplateIds:['sports_item_a']}],[{id:'room',name:'教室',isActive:true,capacity:8}]);
 expect(result.subjects.map(s=>s.name)).toEqual(['A課程']);expect(result.customers).toEqual([]);expect(result.students).toEqual([]);expect(result.fees).toEqual([]);expect(result.lessons).toEqual([]);
 expect(result.coaches[0].templates).toEqual(['sports_item_a']);expect(JSON.stringify(result)).not.toContain('20堂');
});
