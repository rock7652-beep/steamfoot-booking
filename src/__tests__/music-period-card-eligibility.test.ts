import {expect,it} from 'vitest';
import {musicLessonPeriodIssue} from '@/lib/music-lesson-periods';
import {courseCardScheduleIssue,courseCardScheduleRows} from '@/lib/course-card-schedule-issue';
it('rejects a legacy balance without inferring purchased periods from its four available lessons',()=>{
 const unavailableReason=musicLessonPeriodIssue({musicTermSizes:[],musicOpeningStateRequired:false});
 const card={unit:'SESSION',available:4,unavailableReason};
 expect(courseCardScheduleIssue(card,new Date('2026-10-27T10:00:00Z'),1)).toEqual({label:'待核對',message:'方案期別待確認，請先核對各期堂數'});
 expect(courseCardScheduleRows(card,['2026-10-27','2026-11-03'],'18:00').every(row=>!row.covered&&row.reason==='待核對')).toBe(true);
});
it('accepts an explicit purchased snapshot and leaves opening cards to their existing verification',()=>{
 expect(musicLessonPeriodIssue({musicTermSizes:[4],musicOpeningStateRequired:false})).toBeNull();
 expect(musicLessonPeriodIssue({musicTermSizes:[],musicOpeningStateRequired:true})).toBeNull();
});
