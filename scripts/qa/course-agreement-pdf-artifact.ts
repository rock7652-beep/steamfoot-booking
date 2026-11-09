// Run with: node --conditions=react-server --import tsx scripts/qa/course-agreement-pdf-artifact.ts
// Synthetic data only; Poppler verifies readable Chinese, page structure and embedded fonts.
import {writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import type {Prisma} from '../../generated/course-client';
import {courseAgreementEvidenceFixture} from '../../src/__tests__/fixtures/course-agreement-evidence';
import {verifiedAgreementReceipt} from '../../src/server/services/course-agreement-evidence';
import {createCourseAgreementPdf} from '../../src/server/services/course-agreement-pdf';
async function main() {
const out='/workspace/reports/course-agreement-records';mkdirSync(out,{recursive:true});
const record=await courseAgreementEvidenceFixture();
const value=verifiedAgreementReceipt(record);
const bytes=await createCourseAgreementPdf(value),file=out+'/synthetic-agreement.pdf';writeFileSync(file,bytes);writeFileSync(out+'/synthetic-receipt.json',JSON.stringify(value));
const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});
for(const expected of ['合成音樂教室','課程服務約定書','合成學員','合成家長','母親','0911000002','2026-11-03 23:59','2026-11-03 00:00','法定代理人簽名',value.id,value.documentHash])if(!text.replace(/\s+/g,'').includes(expected.replace(/\s+/g,'')))throw Error('Missing PDF text: '+expected);
const fonts=execFileSync('pdffonts',[file],{encoding:'utf8'});if(!fonts.includes('yes'))throw Error('Font not embedded');
const info=execFileSync('pdfinfo',[file],{encoding:'utf8'}),pages=Number(info.match(/Pages:\s+(\d+)/)?.[1]);if(!pages)throw Error('Invalid page count');
execFileSync('pdftoppm',['-f','1','-l','1','-scale-to','1400','-png','-singlefile',file,out+'/pdf-first']);execFileSync('pdftoppm',['-f',String(pages),'-l',String(pages),'-scale-to','1400','-png','-singlefile',file,out+'/pdf-last']);
const long=await courseAgreementEvidenceFixture(false);
const longDocument=[{title:'長文字測試',body:'本段為隔離測試用的完整中文長條款，應完整保存且正確分頁。'.repeat(150)+'【長條款結尾標記】'},...value.document];
long.version.document=longDocument as unknown as Prisma.JsonValue;long.version.documentHash=createHash('sha256').update(JSON.stringify(longDocument)).digest('hex');
const longFile=out+'/synthetic-long-agreement.pdf';writeFileSync(longFile,await createCourseAgreementPdf(verifiedAgreementReceipt(long)));
const longText=execFileSync('pdftotext',['-layout',longFile,'-'],{encoding:'utf8'});if(!longText.includes('長條款結尾標記'))throw Error('Long text truncated');
const pageText=longText.split('\f').filter(p=>p.trim());for(const page of pageText){const lines=page.split('\n').map(s=>s.trim()).filter(Boolean);if(longDocument.some(c=>c.title===lines.at(-2)))throw Error('Orphan heading: '+lines.at(-2));}
writeFileSync(out+'/pdf-validation.json',JSON.stringify({synthetic:true,realBackend:false,pages,bytes:bytes.length,chineseText:true,guardian:true,taipeiTimes:true,embeddedFont:true,longTextComplete:true,noOrphanHeadings:true,longPages:pageText.length},null,2));console.log(JSON.stringify({pages,bytes:bytes.length,longPages:pageText.length,chineseText:true,guardian:true}));

}
main().catch(error => { console.error(error); process.exitCode = 1; });
