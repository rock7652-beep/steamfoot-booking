// Synthetic documents only; never accesses a cloud database.
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import type {Prisma} from '../../generated/course-client';
import {buildCourseAgreement,emptyCourseAgreement,emptyFitnessCourseAgreement,emptyBeautyAgreement,validateCourseAgreementForPublish} from '../../src/lib/course-agreement';
import {withAgreementPrivacy} from '../../src/lib/course-agreement-privacy';
import {courseAgreementEvidenceFixture} from '../../src/__tests__/fixtures/course-agreement-evidence';
import {verifiedAgreementReceipt} from '../../src/server/services/course-agreement-evidence';
import {createCourseAgreementPdf} from '../../src/server/services/course-agreement-pdf';
async function main(){
 const out='/workspace/reports/agreement-privacy/pdf';mkdirSync(out,{recursive:true});
 for(const [kind,make] of [['music',emptyCourseAgreement],['fitness',emptyFitnessCourseAgreement],['beauty',emptyBeautyAgreement]] as const){
  const d={...make('合成告知測試店','03-0000000','合成路'),entity:'合成服務商行',responsible:'合成負責人',city:'新竹縣',business:kind==='music'?'cram' as const:kind,makeup:'由本店協調改期',privacyNotice:'',privacySupplement:'合成補充說明，僅供隔離驗證。'};
  if(kind==='fitness')d.fitness={activityDescription:'一般運動',intensity:'依能力調整',specificRisks:'跌倒及碰撞',participationLimits:'依安全說明',emergencyProcedure:'停止並協助就醫',refundRule:'依適用法令'};
  if(kind==='beauty')d.beauty={serviceScope:'非醫療服務',productsAndMethods:'服務前確認',specificRisks:'泛紅敏感',precautions:'私下溝通必要資訊',aftercare:'依當次說明',emergencyProcedure:'停止並協助就醫',refundRule:'依適用法令'};
  const draft=withAgreementPrivacy(d);validateCourseAgreementForPublish(draft);
  const record=await courseAgreementEvidenceFixture(false),document=buildCourseAgreement(draft),documentHash=createHash('sha256').update(JSON.stringify(document)).digest('hex');
  record.version.settingsSnapshot=draft as Prisma.JsonValue;record.version.document=document as unknown as Prisma.JsonValue;record.version.documentHash=documentHash;
  if(kind!=='music')record.signerSnapshot={...(record.signerSnapshot as Prisma.JsonObject),[kind==='beauty'?'beautyAcknowledgement':'fitnessAcknowledgement']:{course:true,risk:true,documentHash,courseAcknowledgedAt:record.signedAt.toISOString(),riskAcknowledgedAt:record.signedAt.toISOString()}};
  const file=`${out}/${kind}.pdf`;writeFileSync(file,await createCourseAgreementPdf(verifiedAgreementReceipt(record)));
  const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'}).replace(/\s+/g,'');
  for(const expected of ['合成服務商行','合成負責人','日本東京','Supabase','Vercel','必要期間','合成補充說明'])if(!text.includes(expected))throw Error(`Missing ${expected} in ${kind} PDF`);
  console.log(`${kind}: generated notice, immutable evidence and PDF text verified`);
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
