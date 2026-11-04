import {expect,it} from 'vitest';
import {buildCourseAgreement,courseAgreementDraftSchema,emptyBeautyAgreement,emptyCourseAgreement,emptyFitnessCourseAgreement} from '@/lib/course-agreement';
import {platformAgreementPrivacyNotice,withAgreementPrivacy} from '@/lib/course-agreement-privacy';

it('fills blank editable drafts in every module using store identity and the verified platform description',()=>{
 for(const make of [emptyCourseAgreement,emptyFitnessCourseAgreement,emptyBeautyAgreement]){
  const draft=withAgreementPrivacy({...make('品牌','03-0000000'),entity:'正式商行',responsible:'負責人甲'});
  expect(draft.privacyNoticeMode).toBe('platform');
  expect(draft.privacyNotice).toContain(draft.profile==='BEAUTY'?'服務預約':draft.profile==='FITNESS'?'指導服務':'授課服務');
  for(const text of ['正式商行','品牌','負責人甲','03-0000000','蒸管家','日本東京','Supabase','Vercel','跨境','法定代理人','必要期間','刪除'])expect(draft.privacyNotice).toContain(text);
  expect(draft.privacyNotice).not.toMatch(/1825|五年|5 年|自動刪除|待填保存/);
  expect(JSON.stringify(buildCourseAgreement(draft))).toContain(draft.privacyNotice.split('\n')[0]);
  expect(courseAgreementDraftSchema.safeParse(draft).success).toBe(true);
 }
});
it('updates platform notices when store identity changes, preserving optional supplemental text',()=>{
 const a=withAgreementPrivacy({...emptyCourseAgreement('舊店','舊電話'),entity:'舊商行',responsible:'舊負責人',privacySupplement:'提供顧客查詢的補充聯絡管道。'});
 const b=withAgreementPrivacy({...a,entity:'新商行',contact:'新電話',privacyNotice:'用戶端偽造的儲存區域'});
 expect(b.privacyNotice).toContain('新商行');expect(b.privacyNotice).toContain('新電話');expect(b.privacyNotice).toContain('提供顧客查詢的補充聯絡管道');expect(b.privacyNotice).toContain('日本東京');expect(b.privacyNotice).not.toContain('偽造');
 expect(withAgreementPrivacy(b)).toEqual(b);
});
it('preserves legacy custom notices and leaves old snapshot parsing unchanged',()=>{
 const legacy={...emptyCourseAgreement(),privacyNotice:'原有的個資告知\n完整保留。'};
 expect(withAgreementPrivacy(legacy)).toBe(legacy);
 expect(courseAgreementDraftSchema.parse(legacy)).not.toHaveProperty('privacyNoticeMode');
 expect(buildCourseAgreement(legacy).find(c=>c.title==='個人資料告知')?.body).toBe(legacy.privacyNotice);
 const explicitCustom={...legacy,privacyNoticeMode:'custom' as const};expect(withAgreementPrivacy(explicitCustom)).toBe(explicitCustom);
 const clearing={...explicitCustom,privacyNotice:''};expect(withAgreementPrivacy(clearing)).toBe(clearing);
});
it('fits schema limits even with maximum store fields and supplemental text',()=>{
 const d=withAgreementPrivacy({...emptyCourseAgreement('店'.repeat(200),'聯'.repeat(200)),entity:'名'.repeat(200),responsible:'人'.repeat(200),privacySupplement:'補'.repeat(2000)});
 expect(d.privacyNotice.length).toBeLessThanOrEqual(4000);expect(courseAgreementDraftSchema.safeParse(d).success).toBe(true);
 expect(courseAgreementDraftSchema.safeParse({...d,privacySupplement:'補'.repeat(2001)}).success).toBe(false);
 expect(platformAgreementPrivacyNotice({...emptyBeautyAgreement(),privacySupplement:''})).not.toContain('店家補充說明');
});
