// Synthetic document only. Run with node --conditions=react-server --import tsx.
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import type {Prisma} from '../../generated/course-client';
import {beautyServiceTypes,toggleBeautyService} from '../../src/lib/beauty-agreement-templates';
import {emptyBeautyAgreement,buildCourseAgreement} from '../../src/lib/course-agreement';
import {courseAgreementEvidenceFixture} from '../../src/__tests__/fixtures/course-agreement-evidence';
import {verifiedAgreementReceipt} from '../../src/server/services/course-agreement-evidence';
import {createCourseAgreementPdf} from '../../src/server/services/course-agreement-pdf';
async function main(){
 const draft=emptyBeautyAgreement('合成美業約定測試','030000000','合成路1號');
 Object.assign(draft,{entity:'合成美業商行',responsible:'合成負責人',city:'新竹縣',business:'beauty',leave:{mode:'deadline',days:1,time:'21:00'},makeup:'請聯絡店家協調取消與改期',privacyNotice:'此為隔離測試合成文件。'});
 draft.beauty={serviceScope:'一般非醫療美容、保養與美甲美睫等服務',productsAndMethods:'每次服務前依實際產品及方式說明',specificRisks:'泛紅、敏感、刺激、疼痛或其他不適',precautions:'事前私下說明必要過敏與皮膚資訊',aftercare:'不適持續請聯絡本店並尋求醫療專業協助',emergencyProcedure:'立即停止操作並依現場狀況協助就醫',refundRule:'依適用法令處理'};
 for(const type of beautyServiceTypes)draft.beautyServices=toggleBeautyService(draft.beautyServices,type,true);
 const record=await courseAgreementEvidenceFixture(false),document=buildCourseAgreement(draft),documentHash=createHash('sha256').update(JSON.stringify(document)).digest('hex');
 record.version.settingsSnapshot=draft as Prisma.JsonValue;record.version.document=document as unknown as Prisma.JsonValue;record.version.documentHash=documentHash;
 record.signerSnapshot={...(record.signerSnapshot as Prisma.JsonObject),beautyAcknowledgement:{course:true,risk:true,courseAcknowledgedAt:record.signedAt.toISOString(),riskAcknowledgedAt:record.signedAt.toISOString(),documentHash}};
 const out='/workspace/reports/beauty-agreements-pdf';mkdirSync(out,{recursive:true});
 writeFileSync(out+'/signed.pdf',await createCourseAgreementPdf(verifiedAgreementReceipt(record)));
 writeFileSync(out+'/document.json',JSON.stringify(document,null,2));
 console.log('Synthetic beauty PDF and immutable highlighted document saved');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
