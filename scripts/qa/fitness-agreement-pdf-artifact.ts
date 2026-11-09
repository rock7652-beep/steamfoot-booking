// Synthetic document only. Run with node --conditions=react-server --import tsx.
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import type {Prisma} from '../../generated/course-client';
import {emptyFitnessCourseAgreement,buildCourseAgreement} from '../../src/lib/course-agreement';
import {courseAgreementEvidenceFixture} from '../../src/__tests__/fixtures/course-agreement-evidence';
import {verifiedAgreementReceipt} from '../../src/server/services/course-agreement-evidence';
import {createCourseAgreementPdf} from '../../src/server/services/course-agreement-pdf';
async function main(){
 const draft=emptyFitnessCourseAgreement('合成運動約定測試','030000000','合成路1號');
 Object.assign(draft,{entity:'合成運動商行',responsible:'合成負責人',city:'新竹縣',business:'fitness',leave:{mode:'deadline',days:1,time:'21:00'},makeup:'請聯絡店家協調補課。',privacyNotice:'此為隔離測試合成文件。'});
 draft.fitness={activityDescription:'不應限制為這個課程名稱',intensity:'依能力調整',specificRisks:'彈力帶回彈、跌倒及碰撞。',participationLimits:'依指導員安全說明操作。',emergencyProcedure:'停止活動並通知現場指導員。',refundRule:'依適用法令辦理解約退費。'};
 const record=await courseAgreementEvidenceFixture(false),document=buildCourseAgreement(draft),documentHash=createHash('sha256').update(JSON.stringify(document)).digest('hex');
 record.version.settingsSnapshot=draft as Prisma.JsonValue;record.version.document=document as unknown as Prisma.JsonValue;record.version.documentHash=documentHash;
 record.signerSnapshot={...(record.signerSnapshot as Prisma.JsonObject),fitnessAcknowledgement:{course:true,risk:true,courseAcknowledgedAt:record.signedAt.toISOString(),riskAcknowledgedAt:record.signedAt.toISOString(),documentHash}};
 const out='/workspace/reports/fitness-agreements-emphasis';mkdirSync(out,{recursive:true});
 writeFileSync(out+'/signed.pdf',await createCourseAgreementPdf(verifiedAgreementReceipt(record)));
 writeFileSync(out+'/document.json',JSON.stringify(document,null,2));
 console.log('Synthetic fitness PDF and immutable highlighted document saved');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
