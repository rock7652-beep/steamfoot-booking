import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import type {Prisma} from '../../generated/course-client';
import {emptyBeautyAgreement,buildCourseAgreement,validateCourseAgreementForPublish,beautyAgreementFields} from '@/lib/course-agreement';
import {courseAgreementEvidenceFixture} from './fixtures/course-agreement-evidence';
import {verifiedAgreementReceipt} from '@/server/services/course-agreement-evidence';
import {createCourseAgreementPdf} from '@/server/services/course-agreement-pdf';
function draft(){return {...emptyBeautyAgreement('合成美容店','030000000','合成路'),entity:'合成商行',responsible:'測試負責人',city:'新竹縣',business:'beauty' as const,makeup:'依雙方確認改期',privacyNotice:'合成告知',beauty:{serviceScope:'非醫療美容與保養',productsAndMethods:'當次說明產品與方式',specificRisks:'泛紅、敏感與刺激',precautions:'私下說明必要過敏資訊',aftercare:'不適請聯絡本店',emergencyProcedure:'停止操作並協助就醫',refundRule:'依適用法令處理'}};}
it('beauty terms cover service-specific risks, separate imagery consent and no blanket waiver',()=>{
 const d=draft();expect(()=>validateCourseAgreementForPublish(d)).not.toThrow();const clauses=buildCourseAgreement(d),text=clauses.map(c=>c.body).join('\n');
 expect(clauses.map(c=>c.title)).toEqual(['服務共同約定','服務風險與注意事項告知']);
 expect(text).toContain('更換項目或產品時應再次確認');expect(text).toContain('不免除本店或服務人員依法應負');expect(text).toContain('另行取得獨立授權');expect(text).toContain('不要求填寫完整病史');
 expect(text).not.toMatch(/老師|指導員|單堂|補課|短期補習班|運動/);expect(clauses.every(c=>c.emphasis?.length)).toBe(true);
 for(const key of Object.keys(beautyAgreementFields)){const v=structuredClone(d);v.beauty[key as keyof typeof v.beauty]='';expect(()=>validateCourseAgreementForPublish(v)).toThrow();}
});
it('beauty receipt and PDF require the beauty acknowledgement type and retain the original hash',async()=>{
 const record=await courseAgreementEvidenceFixture(false),d=draft(),document=buildCourseAgreement(d),documentHash=createHash('sha256').update(JSON.stringify(document)).digest('hex');
 record.version.settingsSnapshot=d as Prisma.JsonValue;record.version.document=document as unknown as Prisma.JsonValue;record.version.documentHash=documentHash;
 const ack={course:true,risk:true,documentHash,courseAcknowledgedAt:record.signedAt.toISOString(),riskAcknowledgedAt:record.signedAt.toISOString()};
 record.signerSnapshot={...(record.signerSnapshot as Prisma.JsonObject),beautyAcknowledgement:ack};
 const value=verifiedAgreementReceipt(record);expect(value.profile).toBe('BEAUTY');expect(value.beautyAcknowledgement).toEqual(ack);expect((await createCourseAgreementPdf(value)).subarray(0,5).toString()).toBe('%PDF-');
 expect(()=>verifiedAgreementReceipt({...record,signerSnapshot:{name:'測試',phone:'0911000001',minor:false,fitnessAcknowledgement:ack}})).toThrow();
 expect(()=>verifiedAgreementReceipt({...record,signerSnapshot:{name:'測試',phone:'0911000001',minor:false}})).toThrow('確認紀錄');
},20000);

it('multi-service selections preserve edits and publish only selected service content',async()=>{
 const {beautyServiceTypes,beautyServiceTemplates,toggleBeautyService}=await import('@/lib/beauty-agreement-templates');
 let selection=toggleBeautyService(undefined,'massage',true);
 selection.content.massage='店家自訂按摩風險與照護';
 selection=toggleBeautyService(selection,'massage',false);
 expect(selection.content.massage).toBe('店家自訂按摩風險與照護');
 expect(buildCourseAgreement({...draft(),beautyServices:selection})[1].body).not.toContain('店家自訂按摩');
 for(const type of beautyServiceTypes)selection=toggleBeautyService(selection,type,true);
 expect(selection.content.massage).toBe('店家自訂按摩風險與照護');
 const d={...draft(),beautyServices:selection},document=buildCourseAgreement(d);
 expect(document).toHaveLength(2);
 for(const type of beautyServiceTypes)expect(document[1].body).toContain(`【${beautyServiceTemplates[type].label}】`);
 expect(()=>validateCourseAgreementForPublish(d)).not.toThrow();
 expect(()=>validateCourseAgreementForPublish({...d,beautyServices:{...selection,content:{...selection.content,lashes:''}}})).toThrow('美睫');
 const {courseAgreementDraftSchema}=await import('@/lib/course-agreement');
 expect(courseAgreementDraftSchema.safeParse({...d,beautyServices:{...selection,selected:['massage','massage']}}).success).toBe(false);
 expect(courseAgreementDraftSchema.parse(draft())).not.toHaveProperty('beautyServices');
});
