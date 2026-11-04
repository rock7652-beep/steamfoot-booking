import 'server-only';
import { courseAgreementTitle } from '@/lib/course-agreement';
import { courseAgreementTextRuns } from '@/lib/course-agreement-emphasis';
import PDFDocument from 'pdfkit';
import { join } from 'node:path';
import { formatTWDateTime } from '@/lib/date-utils';
import type { CourseAgreementReceipt } from '@/lib/course-agreement-signing';
/** Private in-memory rendering: no remote fonts, browser service or temporary personal files. */
export async function createCourseAgreementPdf(value: CourseAgreementReceipt): Promise<Buffer> {
  const font = join(process.cwd(), 'assets/course-agreements/NotoSansCJKtc-Regular.otf');
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, font,
    info: { Title: `${value.brand}｜${courseAgreementTitle(value.profile)}`, Author: value.brand, Subject: `已簽署版本 v${value.version}.0` } });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
  try {
    const width = doc.page.width - 96;
    const ensure = (height: number) => { if (doc.y + height > doc.page.height - 48) doc.addPage(); };
    doc.fontSize(19).fillColor('#234139').text(`${value.brand}｜${courseAgreementTitle(value.profile)}`);
    doc.moveDown(.5).fontSize(10).fillColor('#52635c').text(`已簽署文件 · v${value.version}.0`);
    for (const clause of value.document) {
      doc.fontSize(12);
      ensure(doc.heightOfString(clause.title, { width }) + 50);
      doc.moveDown(.7).fillColor('#234139').text(clause.title, { width });
      doc.moveDown(.3).fontSize(10).fillColor('#26352e');
      if (!clause.emphasis?.length) doc.text(clause.body, { width, lineGap: 4 });
      else {
        const lines: ReturnType<typeof courseAgreementTextRuns>[] = [[]];
        for (const run of courseAgreementTextRuns(clause)) {
          run.text.split('\n').forEach((text, index) => {
            if (index) lines.push([]);
            if (text) lines.at(-1)!.push({ text, emphasized: run.emphasized });
          });
        }
        // Reset the left edge at each explicit newline; continued text is only for inline spans.
        // Fill + a fine stroke emboldens the embedded CJK glyphs without another font download.
        doc.lineWidth(.18).strokeColor('#26352e');
        for (const runs of lines) {
          if (!runs.length) { doc.moveDown(); continue; }
          runs.forEach((run, index) => {
            const options = { width, lineGap: 4, continued: index < runs.length - 1, underline: run.emphasized, stroke: run.emphasized, fill: true };
            if (index === 0) doc.text(run.text, 48, doc.y, options);
            else doc.text(run.text, options);
          });
        }
        doc.lineWidth(1);
      }
    }
    const signer = value.signer;
    const evidence = [
      `學員：${signer.name}　聯絡電話：${signer.phone}`,
      `身分：${signer.minor ? '未成年學員，由法定代理人簽署' : '成年學員'}`,
      ...(signer.minor ? [`法定代理人：${signer.guardian.name}　關係：${signer.guardian.relation}`, `法定代理人電話：${signer.guardian.phone}`] : []),
      `提供記錄：${formatTWDateTime(new Date(value.deliveredAt))}（台灣時間）`,
      `簽署時間：${formatTWDateTime(new Date(value.signedAt))}（台灣時間）`,
      `文件識別碼：${value.id}`,
      ...(value.fitnessAcknowledgement ? [
        `課程共同約定：已確認（${formatTWDateTime(new Date(value.fitnessAcknowledgement.courseAcknowledgedAt))}，台灣時間）`,
        `運動健康與風險告知：已確認（${formatTWDateTime(new Date(value.fitnessAcknowledgement.riskAcknowledgedAt))}，台灣時間）`,
        '同一份手寫簽名適用於以上兩部分；時間為系統收到確認的時間。',
      ] : []),
      '簽署者已確認閱讀約定書與個資告知，並同意使用電子文件與手寫電子簽名。',
    ];
    doc.fontSize(10);
    ensure(evidence.reduce((height, text) => height + doc.heightOfString(text, { width, lineGap: 3 }) + 3, 0) + 175);
    doc.moveDown().fontSize(12).fillColor('#234139').text('簽署紀錄');
    doc.moveDown(.3).fontSize(10).fillColor('#26352e');
    for (const text of evidence) { doc.text(text, { width, lineGap: 3 }); doc.moveDown(.2); }
    doc.text(signer.minor ? '法定代理人簽名：' : '學員簽名：');
    doc.image(Buffer.from(value.signatureDataUrl.split(',')[1], 'base64'), doc.x, doc.y, { fit: [240, 72] });
    doc.y += 80;
    doc.fontSize(8).text(`內容 SHA-256：${value.documentHash}`, { width });
    const pages = doc.bufferedPageRange();
    for (let page = pages.start; page < pages.start + pages.count; page++) {
      doc.switchToPage(page);
      const margin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(8).fillColor('#64746c').text(`第 ${page + 1} 頁／共 ${pages.count} 頁`, 48, doc.page.height - 30, { width, align: 'center', lineBreak: false });
      doc.page.margins.bottom = margin;
    }
    doc.end();
  } catch (error) {
    // The writable document may not have finished. Do not leave its promise pending.
    doc.destroy(error instanceof Error ? error : new Error('PDF render failed'));
  }
  return completed;
}
