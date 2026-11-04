import { createHash } from 'node:crypto';
import legacyDocument from './fixtures/course-agreement-legacy-document.json';
import { expect, it } from 'vitest';
import { buildCourseAgreement, courseAgreementDraftSchema, emptyCourseAgreement, emptyFitnessCourseAgreement, fitnessAgreementFields, validateCourseAgreementForPublish } from '@/lib/course-agreement';
import { parseCourseAgreementSignerSnapshot } from '@/lib/course-agreement-signing';
import { courseAgreementEvidenceFixture } from './fixtures/course-agreement-evidence';
import { verifiedAgreementReceipt } from '@/server/services/course-agreement-evidence';
import { createCourseAgreementPdf } from '@/server/services/course-agreement-pdf';
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fitnessDraft() {
 const draft={...emptyFitnessCourseAgreement('測試運動館','030000000','測試路'),entity:'測試商行',responsible:'測試負責人',city:'新竹縣',business:'fitness' as const,makeup:'雙方協調',privacyNotice:'測試資料告知'};
 draft.fitness={activityDescription:'伸展與肌力',intensity:'循序漸進，依能力調整',specificRisks:'彈力帶回彈、失去平衡',participationLimits:'遵守器材負載限制',emergencyProcedure:'通知現場指導員並啟動救護',refundRule:'依本店適用法令辦理解約退費'};
 return draft;
}
it('keeps legacy music wording unchanged when new documents add emphasis',()=>{
 const draft=emptyCourseAgreement('音樂店');
 expect(buildCourseAgreement(draft).map(({title,body})=>({title,body}))).toEqual(legacyDocument);
 expect(legacyDocument.every(clause=>!('emphasis' in clause))).toBe(true);
});
it('renders two blocks with instructor wording and no universal cram-school refund',()=>{
 const draft=courseAgreementDraftSchema.parse(fitnessDraft());
 expect(()=>validateCourseAgreementForPublish(draft)).not.toThrow();
 const blocks=buildCourseAgreement(draft),text=JSON.stringify(blocks);
 expect(blocks.map(b=>b.title)).toEqual(['課程共同約定','運動健康與風險告知']);
 expect(text).not.toContain('單堂時間為');expect(text).not.toContain('課程內容與類型：伸展與肌力');expect(text).toContain('各類運動課程及指導服務');
 expect(text).toContain('指導員');expect(text).not.toMatch(/老師|教練|短期補習班/);
 expect(text).toContain('不免除本店或指導員依法應負的責任');expect(text).toContain('不蒐集完整病史');expect(text).toContain('彈力帶回彈');
 for(const key of Object.keys(fitnessAgreementFields)) {
  const incomplete=structuredClone(draft);incomplete.fitness![key as keyof NonNullable<typeof draft.fitness>]='';
  expect(()=>validateCourseAgreementForPublish(incomplete)).toThrow();
 }
});
it('strictly parses separate confirmation evidence without widening client identity',()=>{
 const identity={name:'合成學員',phone:'0911000001',minor:false};
 expect(parseCourseAgreementSignerSnapshot(identity).signer).toEqual(identity);
 expect(()=>parseCourseAgreementSignerSnapshot({...identity,medicalHistory:'不應儲存'})).toThrow();
 expect(()=>parseCourseAgreementSignerSnapshot({...identity,fitnessAcknowledgement:{risk:true}})).toThrow();
});
it('verifies both confirmations against immutable fitness version and creates one PDF',async()=>{
 const record=await courseAgreementEvidenceFixture(false),draft=fitnessDraft(),document=buildCourseAgreement(draft),documentHash=digest(document);
 record.version.settingsSnapshot=draft;record.version.document=document;record.version.documentHash=documentHash;
 const ack={course:true,risk:true,documentHash,courseAcknowledgedAt:record.signedAt.toISOString(),riskAcknowledgedAt:record.signedAt.toISOString()};
 record.signerSnapshot={...record.signerSnapshot as object,fitnessAcknowledgement:ack};
 const receipt=verifiedAgreementReceipt(record);expect(receipt.profile).toBe('FITNESS');expect(receipt.fitnessAcknowledgement).toEqual(ack);
 expect(()=>verifiedAgreementReceipt({...record,version:{...record.version,document:document.map(c=>({...c,emphasis:[]}))}})).toThrow('內容驗證');
 const pdf=await createCourseAgreementPdf(receipt);expect(pdf.subarray(0,5).toString()).toBe('%PDF-');
 expect(()=>verifiedAgreementReceipt({...record,signerSnapshot:{...record.signerSnapshot as object,fitnessAcknowledgement:{...ack,documentHash:'f'.repeat(64)}}})).toThrow('確認紀錄');
 expect(()=>verifiedAgreementReceipt({...record,signerSnapshot:{name:'測試',phone:'0911000001',minor:false}})).toThrow('確認紀錄');
},20000);
