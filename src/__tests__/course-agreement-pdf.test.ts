import {expect,it} from 'vitest';
import {courseAgreementEvidenceFixture} from './fixtures/course-agreement-evidence';
import {verifiedAgreementReceipt} from '@/server/services/course-agreement-evidence';
import {createCourseAgreementPdf} from '@/server/services/course-agreement-pdf';
it('creates a real PDF with an embedded Unicode font and the signature image',async()=>{
 const value=verifiedAgreementReceipt(await courseAgreementEvidenceFixture());
 const bytes=await createCourseAgreementPdf(value),source=bytes.toString('latin1');
 expect(bytes.subarray(0,5).toString()).toBe('%PDF-');expect(source).toContain('/ToUnicode');expect(source).toMatch(/\/FontFile[23]/);expect(source).toContain('/Subtype /Image');expect(source).toContain('%%EOF');
},20000);
it('paginates long original text without truncating the document',async()=>{
 const value=verifiedAgreementReceipt(await courseAgreementEvidenceFixture(false));
 value.document=[{title:'長條款測試',body:'這是完整的合成長條款，不得截斷。'.repeat(300)},...value.document];
 const bytes=await createCourseAgreementPdf(value);const source=bytes.toString('latin1');
 expect((source.match(/\/Type \/Page\b/g)??[]).length).toBeGreaterThan(2);
},20000);
