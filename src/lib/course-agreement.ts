import { z } from 'zod';

const short = z.string().trim().max(200, '欄位最多 200 字');
const text = z.string().trim().max(4000, '欄位最多 4000 字');
export const courseAgreementDraftSchema = z.object({
  brand: short, entity: short, responsible: short, city: short,
  address: short, contact: short,
  business: z.enum(['pending', 'cram', 'fitness']),
  profile: z.enum(['MUSIC', 'FITNESS']).optional(),
  fitness: z.object({ activityDescription: text, intensity: text, specificRisks: text, participationLimits: text, emergencyProcedure: text, refundRule: text }).strict().optional(),
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
export type CourseAgreementClause = { title: string; body: string };
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
    if (!draft[field]) throw new Error(`請填寫${label}`);
  }
  if (draft.profile === 'FITNESS') {
    if (draft.business !== 'fitness') throw new Error('請確認運動課程範本適用性');
    for (const [field, label] of Object.entries(fitnessAgreementFields)) {
      if (!draft.fitness?.[field as keyof typeof fitnessAgreementFields]) throw new Error(`請填寫${label}`);
    }
  } else if (draft.business !== 'cram') throw new Error('目前範本限已確認適用短期補習班規範的店家；其他型態可先保存草稿');
  if (draft.leave.mode === 'custom' && !draft.leave.rule) throw new Error('請填寫自訂請假期限');
}

// Shared by preview and publication. Store the rendered clauses, not just inputs.
export function buildCourseAgreement(d: CourseAgreementDraft): CourseAgreementClause[] {
  if (d.profile === 'FITNESS') return buildFitnessCourseAgreement(d);
  const clause = (title: string, body: string) => ({ title, body });
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


export const fitnessAgreementFields = {
  activityDescription: '課程內容與類型', intensity: '運動強度與參與方式',
  specificRisks: '課程特有風險', participationLimits: '參與限制及注意事項',
  emergencyProcedure: '緊急處理方式', refundRule: '退費及解約規則',
} as const;

export function emptyFitnessCourseAgreement(brand = '', contact = '', address = '', leadMinutes = 1440): CourseAgreementDraft {
  return { ...emptyCourseAgreement(brand, contact, address, leadMinutes), profile: 'FITNESS',
    equipment: '請依指導員說明使用場地與設備；發現損壞或使用疑問時，請停止使用並通知指導員。正常使用耗損不由學員負擔。',
    fitness: { activityDescription: '', intensity: '', specificRisks: '', participationLimits: '', emergencyProcedure: '', refundRule: '' } };
}
export function courseAgreementTitle(profile?: 'MUSIC' | 'FITNESS') {
  return profile === 'FITNESS' ? '運動課程共同約定暨風險告知' : '課程服務約定書';
}
function buildFitnessCourseAgreement(d: CourseAgreementDraft): CourseAgreementClause[] {
  const f = d.fitness;
  return [{ title: '課程共同約定', body: [
    `本約定由學員與「${d.entity || '【待填營業登記名稱】'}」（品牌：${d.brand || '【待填店名】'}；負責人：${d.responsible || '【待填】'}）訂立，適用於學員在本店上課課程期間。服務地址：${d.city} ${d.address}；聯絡方式：${d.contact}。`,
    '首次簽署後，後續續購原則上沿用本版本；重要條款變更另行確認。每期費用、堂數、期間、開課日及課程內容，另依雙方確認並可保存的購買及課程紀錄辦理。本約定不取代每期依法應提供的交易資訊。',
    `課程內容與類型：${f?.activityDescription || '【待填】'}。單堂時間為 ${d.duration} 分鐘；時段與地點由雙方確認。`,
    `${courseAgreementLeaveText(d.leave)} 請假聯絡管道：${d.leaveChannel}。補課方式：${d.makeup || '【待填】'}。${d.groupRule} ${d.lateRule} 遇急病、事故等特殊情況，可聯絡本店說明並協商。`,
    '指導員因故無法授課時，本店應盡早通知學員並協調補課或其他安排；替代指導員應事先說明。因本店或指導員因素未提供的課程，不視為學員已使用。天災等情況依適用法令與主管機關公告處理。',
    `暫停課程：${d.pauseRule || '請透過本店指定管道申請，由雙方確認未使用課程及後續安排，不影響依法得行使的退費權利。'}`,
    `退費及解約：${f?.refundRule || '【待填】'}。應依本店實際服務型態、所在地主管機關規定及適用的定型化契約規範辦理，任何約定不得減損學員依法享有的權利。`,
    `${d.equipment} 如有設備損壞，依實際原因、責任與損害協商處理。學員與指導員應彼此尊重，共同維護安全的運動環境。`,
    ...(d.extra ? [`其他約定：${d.extra}`] : []),
    '影像使用：課堂拍攝應先取得相關人員同意；公開宣傳須另行取得獨立授權，本約定不授予行銷影像使用權，不同意不影響上課權益。',
    `個人資料告知：${d.privacyNotice || '【待填】'}`,
    '本店提供本文件供學員審閱及提問。簽署後保存本次版本、兩項確認紀錄、時間及一份手寫簽名，提供同一份 PDF 副本。草稿修改不影響已簽文件；爭議由本店受理協調。',
  ].join('\n\n') }, { title: '運動健康與風險告知', body: [
    `運動強度與參與方式：${f?.intensity || '【待填】'}。`,
    '運動可能造成肌肉痠痛、拉傷、扭傷、跌倒、碰撞或其他身體不適；風險會隨活動、強度、器材與個人狀況而不同。',
    `本課程特有風險：${f?.specificRisks || '【待填】'}。`,
    `參與限制及注意事項：${f?.participationLimits || '【待填】'}。`,
    '請依自身能力參與，遵守指導員安全說明，不勉強完成動作。若出現胸痛、呼吸困難、暈眩、劇烈疼痛或其他異常，應立即停止並通知指導員。',
    '本系統不蒐集完整病史。如有影響安全參與的身體狀況、傷勢、懷孕或醫療限制，請於上課前以適當方式向指導員說明必要資訊；狀況改變時應再次告知。有疑慮時先向醫療專業人員諮詢。',
    `緊急處理方式：${f?.emergencyProcedure || '【待填】'}。遇危急狀況應立即停止活動並聯繫 119，依現場情況提供適當協助。`,
    '本店及指導員仍應履行依法應負的安全、說明及注意義務。本告知不是概括免責聲明，不免除本店或指導員依法應負的責任；也不是醫療診斷、健康檢查或適合運動的認定。',
  ].join('\n\n') }];
}
