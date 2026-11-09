import {expect,it} from 'vitest';
import {courseAgreementTextRuns} from '@/lib/course-agreement-emphasis';
it('preserves all text across overlapping, repeated and multiline highlights',()=>{
 const body='請於前一日 21:00 前請假。\n\n前一日 21:00。<script>保留純文字</script>';
 const runs=courseAgreementTextRuns({title:'條款',body,emphasis:['前一日','前一日 21:00','不在本文的內容']});
 expect(runs.map(r=>r.text).join('')).toBe(body);
 expect(runs.filter(r=>r.emphasized).map(r=>r.text)).toEqual(['前一日 21:00','前一日 21:00']);
});
it('does not retroactively emphasize legacy snapshots or interpret markup',()=>{
 const body='**重要** <u>退費</u> 原有內容';
 expect(courseAgreementTextRuns({title:'舊條款',body})).toEqual([{text:body,emphasized:false}]);
});

it('music highlights the actual leave rule and rights without changing clause text',async()=>{
 const {emptyCourseAgreement,buildCourseAgreement,courseAgreementLeaveText}=await import('@/lib/course-agreement');
 for(const leave of [{mode:'hours',hours:24},{mode:'deadline',days:1,time:'21:00'},{mode:'custom',rule:'請於前一營業日中午前聯絡本店。'}] as const){
  const draft={...emptyCourseAgreement(),leave,makeup:'每期可補課兩次',groupRule:'團體課請由本店安排',pauseRule:'暫停後由雙方確認後續安排。'};
  const clauses=buildCourseAgreement(draft),leaveClause=clauses.find(c=>c.title==='請假與補課')!;
  expect(leaveClause.emphasis).toContain(courseAgreementLeaveText(leave));
  expect(leaveClause.emphasis).toContain('補課方式：每期可補課兩次');
  for(const clause of clauses){
   expect(courseAgreementTextRuns(clause).map(r=>r.text).join('')).toBe(clause.body);
   for(const phrase of clause.emphasis??[]){expect(phrase.length).toBeLessThanOrEqual(160);expect(clause.body).toContain(phrase);}
  }
  for(const title of ['退費方式','老師請假與臨時停課','影像與隱私','版本、通知與副本'])expect(clauses.find(c=>c.title===title)?.emphasis?.length).toBeGreaterThan(0);
 }
});

it('keeps long merchant paragraphs intact while emphasizing only short labels across modules',async()=>{
 const {emptyCourseAgreement,emptyFitnessCourseAgreement,emptyBeautyAgreement,buildCourseAgreement}=await import('@/lib/course-agreement');
 const long='這是店家依實際服務填寫的完整規則。'.repeat(30);
 const drafts=[{...emptyCourseAgreement(),makeup:long,groupRule:long,pauseRule:long},
 {...emptyFitnessCourseAgreement(),makeup:long,fitness:{activityDescription:'一般活動',intensity:'一般',specificRisks:long,participationLimits:'依說明',emergencyProcedure:'停止並求助',refundRule:long}},
 {...emptyBeautyAgreement(),makeup:long,beauty:{serviceScope:'一般',productsAndMethods:'另行確認',specificRisks:long,precautions:'另行說明',aftercare:long,emergencyProcedure:'停止並求助',refundRule:long}}];
 for(const draft of drafts){const clauses=buildCourseAgreement(draft);expect(clauses.some(c=>c.body.includes(long))).toBe(true);
 for(const clause of clauses){expect(clause.emphasis?.length??0).toBeLessThanOrEqual(20);for(const phrase of clause.emphasis??[]){expect(phrase.length).toBeLessThanOrEqual(80);expect(phrase).not.toContain('\n');expect(clause.body).toContain(phrase);}expect(courseAgreementTextRuns(clause).map(r=>r.text).join('')).toBe(clause.body);}}
});
