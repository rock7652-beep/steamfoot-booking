import { z } from 'zod';
import { beautyServiceTypes, beautyServiceTemplates } from './beauty-agreement-templates';

const short = z.string().trim().max(200, '欄位最多 200 字');
const text = z.string().trim().max(4000, '欄位最多 4000 字');
export const courseAgreementDraftSchema = z.object({
  brand: short, entity: short, responsible: short, city: short,
  address: short, contact: short,
  business: z.enum(['pending', 'cram', 'beauty']),
  profile: z.enum(['MUSIC', 'BEAUTY']).optional(),
  beauty: z.object({ serviceScope: text, productsAndMethods: text, specificRisks: text, precautions: text, aftercare: text, emergencyProcedure: text, refundRule: text }).strict().optional(),
  beautyServices: z.object({ selected: z.array(z.enum(beautyServiceTypes)).max(4).refine(items => new Set(items).size === items.length, '服務類型不可重複'), content: z.object({ massage: text.optional(), facial: text.optional(), nails: text.optional(), lashes: text.optional() }).strict() }).strict().optional(),
  duration: z.number().int().min(1).max(480),
  leave: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('hours'), hours: z.number().int().min(0).max(720) }).strict(),
    z.object({ mode: z.literal('deadline'), days: z.number().int().min(0).max(30), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '請填寫有效時間') }).strict(),
    z.object({ mode: z.literal('custom'), rule: text }).strict(),
  ]),
  leaveChannel: short, makeup: text, groupRule: text, lateRule: text,
  pauseRule: text, equipment: text, extra: text, privacyNotice: text,
}).strict();
export type CourseAgreementDraft = z.infer<typeof courseAgreementDraftSchema>;
export type CourseAgreementClause = { title: string; body: string; emphasis?: string[] };
export type CourseAgreementState = {
  storeId: string; revision: number; draft: CourseAgreementDraft;
  active: { id: string; version: number; documentHash: string } | null;
};
export type CourseAgreementPreview = CourseAgreementState & {
  document: CourseAgreementClause[]; documentHash: string;
};
export type CourseAgreementResult<T> = { success: true; data: T } | { success: false; error: string };

export function emptyCourseAgreement(brand = '', contact = '', address = '', leadMinutes = 1440): CourseAgreementDraft {
  return { brand, entity: '', responsible: '', city: '', address, contact, business: 'pending', duration: 50,
    leave: Number.isInteger(leadMinutes / 60) && leadMinutes <= 43200
      ? { mode: 'hours', hours: leadMinutes / 60 }
      : { mode: 'custom', rule: `請於課程開始前至少 ${leadMinutes} 分鐘通知本店。` },
    leaveChannel: '官方 LINE', makeup: '', groupRule: '', lateRule: '', pauseRule: '',
    equipment: '請愛惜樂器及設備，使用前如有疑問，請向老師或店家確認。正常使用耗損不由學員負擔。',
    extra: '', privacyNotice: '' };
}

export function courseAgreementLeaveText(leave: CourseAgreementDraft['leave']) {
  if (leave.mode === 'custom') return leave.rule;
  if (leave.mode === 'hours') return `請於課程開始前至少 ${leave.hours} 小時通知本店。`;
  const day = leave.days === 0 ? '上課當日' : leave.days === 1 ? '上課前一日' : `上課前 ${leave.days} 日`;
  return `最晚應於${day} ${leave.time} 前通知本店（以台灣時間為準）。${leave.days === 0 ? '若課程在截止時間前開始，最晚仍應於課程開始前通知。' : ''}`;
}

export function validateCourseAgreementForPublish(draft: CourseAgreementDraft) {
  for (const [field, label] of [
    ['brand', '品牌／店名'], ['entity', '營業登記名稱'], ['responsible', '負責人'],
    ['city', '所在縣市'], ['address', '地址'], ['contact', '聯絡方式'],
    ['leaveChannel', '請假聯絡管道'], ['makeup', '補課方式'], ['privacyNotice', '個人資料告知'],
  ] as const) {
    if (!draft[field]) throw new Error(`請填寫${draft.profile === 'BEAUTY' && field === 'makeup' ? '取消與改期處理' : draft.profile === 'BEAUTY' && field === 'leaveChannel' ? '取消改期聯絡管道' : label}`);
  }
  if (draft.profile === 'BEAUTY') {
    for (const type of draft.beautyServices?.selected ?? []) {
      if (!draft.beautyServices?.content[type]?.trim()) throw new Error(`請填寫${beautyServiceTemplates[type].label}風險與照護說明`);
    }
    if (draft.business !== 'beauty') throw new Error('請確認美業服務範本適用性');
    for (const [field, label] of Object.entries(beautyAgreementFields)) {
      if (!draft.beauty?.[field as keyof typeof beautyAgreementFields]) throw new Error(`請填寫${label}`);
    }
  } else if (draft.business !== 'cram') throw new Error('目前範本限已確認適用短期補習班規範的店家；其他型態可先保存草稿');
  if (draft.leave.mode === 'custom' && !draft.leave.rule) throw new Error(draft.profile === 'BEAUTY' ? '請填寫自訂取消改期期限' : '請填寫自訂請假期限');
}

// Long merchant paragraphs stay readable: emphasize their label, not an
// arbitrary truncated paragraph. The full wording remains in the document.
function labeledAgreementEmphasis(label: string, value: string) {
  const phrase = `${label}：${value || '【待填】'}`;
  return phrase.length <= 80 && !phrase.includes('\n') ? phrase : label;
}

function deadlineAgreementEmphasis(value: string): string[] {
  if (value.length <= 80 && !value.includes('\n')) return [value];
  const sentence = value.match(/^[^。；\n]*[。；]/)?.[0];
  return sentence && sentence.length <= 80 ? [sentence] : [];
}

// Shared by preview and publication. Store the rendered clauses, not just inputs.
export function buildCourseAgreement(d: CourseAgreementDraft): CourseAgreementClause[] {
  if (d.profile === 'BEAUTY') return buildBeautyAgreement(d);
  const musicEmphasis: Record<string, string[]> = {
    '雙方與適用範圍': ['重要條款變更另行確認', '不取代每期依法應提供的課程及交易資訊'],
    '上課與課程安排': [`單堂課程時間為 ${d.duration} 分鐘`, '由本店統一協調'],
    '請假與補課': [...deadlineAgreementEmphasis(courseAgreementLeaveText(d.leave)), labeledAgreementEmphasis('補課方式', d.makeup), ...(d.groupRule ? [labeledAgreementEmphasis('團體課補充規則', d.groupRule)] : [])],
    '老師請假與臨時停課': ['如涉及代課老師，應事先說明', '因本店或老師因素未提供的課程，不視為學員已使用'],
    '暫停課程': d.pauseRule ? (d.pauseRule.length <= 80 && !d.pauseRule.includes('\n') ? [d.pauseRule] : []) : ['不影響依法得行使之退費權利'],
    '退費方式': ['本店所在地直轄市、縣（市）政府之補習班管理自治法規', '地方另有更有利於消費者之規定者，從其規定', '於辦理解約手續後一個月內完成'],
    '影像與隱私': ['應另行取得獨立授權', '不同意不影響上課權益'],
    '版本、通知與副本': ['修改草稿不影響已簽署紀錄', '新版本須重新提供審閱及必要確認', '任何約定不得排除學員依法享有之權利'],
  };
  const clause = (title: string, body: string): CourseAgreementClause => ({ title, body,
    ...(musicEmphasis[title] ? { emphasis: musicEmphasis[title] } : {}) });
  return [
    clause('雙方與適用範圍', `本約定由學員與「${d.entity || '【待填營業登記名稱】'}」（品牌：${d.brand || '【待填店名】'}；負責人：${d.responsible || '【待填】'}）訂立，適用於學員在本店上課課程期間，包含個別課與團體課。首次簽署後，後續續購原則上沿用本版本；重要條款變更另行確認。此文件為共同服務約定，不取代每期依法應提供的課程及交易資訊。每期購買、費用、堂數、期間與開課日，另依雙方確認並可保存的課程紀錄辦理。服務地址：${d.city} ${d.address}；聯絡方式：${d.contact}。`),
    clause('上課與課程安排', `單堂課程時間為 ${d.duration} 分鐘；上課時段與地點由雙方確認。需要調課時，請透過 ${d.leaveChannel} 聯絡本店，由本店統一協調。${d.lateRule || '遲到或其他特殊情況，請盡早聯絡本店協調處理。'}`),
    clause('請假與補課', `${courseAgreementLeaveText(d.leave)} 請假聯絡管道：${d.leaveChannel}。補課方式：${d.makeup || '【待填】'}。${d.groupRule ? `團體課補充規則：${d.groupRule}` : '個別課與團體課如有不同安排，應於報名前另行告知並確認。'} 遇急病、事故等特殊情況，可聯絡本店說明並協商。`),
    clause('老師請假與臨時停課', '老師因故無法授課時，本店應盡早通知學員，協調補課或其他安排；如涉及代課老師，應事先說明。因本店或老師因素未提供的課程，不視為學員已使用。天災等情況依適用法令與主管機關公告處理，不減損學員依法享有之權益。'),
    clause('暫停課程', d.pauseRule || '如需暫停課程，請透過本店指定聯絡管道申請，由雙方確認未使用課程及後續安排，不影響依法得行使之退費權利。'),
    clause('退費方式', '退費依教育部《短期補習班設立及管理準則》及本店所在地直轄市、縣（市）政府之補習班管理自治法規辦理；地方另有更有利於消費者之規定者，從其規定。退款以現金或匯款方式辦理，於辦理解約手續後一個月內完成；主管機關另有更有利於消費者之規定者，從其規定。'),
    clause('課堂與設備使用', `${d.equipment} 如有設備損壞，依實際原因、責任與損害協商處理。學員與老師應彼此尊重，共同維護安全、適合學習的環境。`),
    ...(d.extra ? [clause('其他約定', d.extra)] : []),
    clause('影像與隱私', '課堂拍攝應先取得相關人員同意。學員照片或影片如需公開宣傳，應另行取得獨立授權；本約定不授予公開行銷之影像使用權，不同意不影響上課權益。'),
    clause('個人資料告知', d.privacyNotice || '【待填個人資料告知】'),
    clause('版本、通知與副本', '本店提供約定書供學員審閱及提問。簽署後保存本次文件版本、簽署時間及簽名，提供 PDF 副本。修改草稿不影響已簽署紀錄；新版本須重新提供審閱及必要確認。爭議由本店受理協調，不要求學員僅向個別老師處理。未盡事項依適用法令辦理，任何約定不得排除學員依法享有之權利。'),
  ];
}


export function courseAgreementTitle(profile?: 'MUSIC' | 'BEAUTY') {
  return profile === 'BEAUTY' ? '美業服務共同約定暨風險告知' : '課程服務約定書';
}

export const beautyAgreementFields = {
  serviceScope: '服務適用範圍', productsAndMethods: '產品與操作方式說明',
  specificRisks: '可能反應與服務風險', precautions: '事前溝通及注意事項',
  aftercare: '服務後照護與聯絡方式', emergencyProcedure: '不適反應與緊急處理', refundRule: '取消中止及退費規則',
} as const;
export function emptyBeautyAgreement(brand = '', contact = '', address = '', leadMinutes = 1440): CourseAgreementDraft {
  return { ...emptyCourseAgreement(brand, contact, address, leadMinutes), profile: 'BEAUTY',
    equipment: '服務人員應維持操作環境及器具清潔，並依實際服務進行必要的清潔、消毒及用品更換。',
    beauty: { serviceScope: '', productsAndMethods: '', specificRisks: '', precautions: '', aftercare: '', emergencyProcedure: '', refundRule: '' } };
}
function buildBeautyAgreement(d: CourseAgreementDraft): CourseAgreementClause[] {
  const b = d.beauty;
  return [{ title: '服務共同約定', body: [
    `本約定由顧客與「${d.entity || '【待填營業登記名稱】'}」（品牌：${d.brand || '【待填店名】'}；負責人：${d.responsible || '【待填】'}）訂立，適用於顧客在本店接受一般非醫療美業服務期間。服務地址：${d.city} ${d.address}；聯絡方式：${d.contact}。`,
    `服務適用範圍：${b?.serviceScope || '【待填】'}。各次服務項目、部位、產品、操作方式、時間及費用，依服務前雙方確認並可保存的預約、購買或服務紀錄辦理，不限定單一項目或固定服務時間。`,
    '首次簽署後，後續服務原則上沿用本版本。重要條款或風險變更應另行告知確認；本約定不代表顧客已同意所有未說明的項目、產品或操作，也不取代依法須另外提供的資訊與文件。',
    `預約取消或改期：${courseAgreementLeaveText(d.leave).replaceAll('課程開始', '預約服務開始').replaceAll('上課', '預約服務')} 聯絡管道：${d.leaveChannel}。取消或改期處理：${d.makeup || '【待填】'}。${d.lateRule}`,
    '如因本店或服務人員因素無法提供服務，本店應盡早通知並協調改期、退款或其他適當安排；未提供的服務不視為顧客已使用。',
    `暫停或中止服務：${d.pauseRule || '顧客如感到不適或希望中止，可隨時向服務人員提出；後續處理由雙方依實際情況及適用法令確認。'}`,
    `取消中止及退費：${b?.refundRule || '【待填】'}。依本店實際服務型態、所在地主管機關規定及適用的定型化契約規範辦理，任何約定不得減損顧客依法享有的權利。`,
    d.equipment,
    ...(d.extra ? [`其他約定：${d.extra}`] : []),
    '影像與宣傳：拍攝前應取得同意；照片或影片若需公開或行銷使用，應另行取得獨立授權。本約定不包含公開行銷影像授權，拒絕不影響服務權益。',
    `個人資料告知：${d.privacyNotice || '【待填】'}`,
    '顧客可保留足夠時間審閱及向店家提問；簽署後提供同一份 PDF 副本，保存本次版本、分項確認與一份手寫簽名。草稿修改不會改寫已簽署文件。',
  ].join('\n\n'), emphasis: ['未提供的服務不視為顧客已使用', '應另行取得獨立授權', '拒絕不影響服務權益', '草稿修改不會改寫已簽署文件', '重要條款或風險變更應另行告知確認', '不代表顧客已同意所有未說明的項目、產品或操作', ...deadlineAgreementEmphasis(courseAgreementLeaveText(d.leave).replaceAll('課程開始', '預約服務開始').replaceAll('上課', '預約服務')), labeledAgreementEmphasis('取消或改期處理', d.makeup), labeledAgreementEmphasis('取消中止及退費', b?.refundRule || ''), '任何約定不得減損顧客依法享有的權利'] },
  { title: '服務風險與注意事項告知', body: [
    `產品與操作方式：${b?.productsAndMethods || '【待填】'}。每次服務前，本店應說明當次項目、使用產品及操作方式；更換項目或產品時應再次確認。`,
    '皮膚接觸、產品或操作可能造成短暫泛紅、刺激、敏感、疼痛或其他不適；實際反應因產品、操作與個人狀況而異。事前測試或過往未出現不適，不代表本次一定不會有反應。',
    `本店服務特有風險：${b?.specificRisks || '【待填】'}。`,
    `事前溝通及注意事項：${b?.precautions || '【待填】'}。本系統不要求填寫完整病史；如有可能影響安全服務的過敏、皮膚狀況、近期處置或其他限制，請於服務前以適當方式向服務人員說明必要資訊，狀況改變時應再次告知。`,
    '服務中若出現灼熱、持續疼痛、明顯紅腫或其他異常，請立即告知並停止操作。本店及服務人員應依實際情況調整、中止服務或協助尋求醫療專業評估，不以本約定代替醫療判斷。',
    `服務後照護：${b?.aftercare || '【待填】'}。反應持續、惡化或有疑慮時，應聯絡本店並尋求醫療專業協助。`,
    `不適反應與緊急處理：${b?.emergencyProcedure || '【待填】'}。遇呼吸困難、意識異常或其他緊急情況應立即聯繫 119。`,
    ...(d.beautyServices?.selected ?? []).map(type => `【${beautyServiceTemplates[type].label}】\n${d.beautyServices?.content[type] || '【待填】'}`),
    '本告知不是概括免責聲明，不免除本店或服務人員依法應負的安全、說明、注意及其他責任。簽署不代表放棄申訴、求償或其他依法享有的權利，也不代表店家保證特定美容效果。',
  ].join('\n\n'), emphasis: [...(d.beautyServices?.selected ?? []).map(type => `【${beautyServiceTemplates[type].label}】`), '泛紅、刺激、敏感、疼痛或其他不適', labeledAgreementEmphasis('本店服務特有風險', b?.specificRisks || ''), '更換項目或產品時應再次確認', '請立即告知並停止操作', labeledAgreementEmphasis('服務後照護', b?.aftercare || ''), '緊急情況應立即聯繫 119', '不免除本店或服務人員依法應負的安全、說明、注意及其他責任', '不代表放棄申訴、求償或其他依法享有的權利'] }];
}
