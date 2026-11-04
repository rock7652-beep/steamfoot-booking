import type { CourseAgreementDraft } from './course-agreement';

/** Platform processing description, verified against the production architecture.
 * No fixed retention period or automatic deletion is promised by this template.
 */
export function platformAgreementPrivacyNotice(draft: CourseAgreementDraft): string {
  const beauty = draft.profile === 'BEAUTY';
  const person = beauty ? '顧客' : '學員';
  const collector = draft.entity || draft.brand || '【待填營業登記名稱】';
  const purpose = beauty ? '服務預約、服務提供、聯絡、契約管理及爭議處理' : draft.profile === 'FITNESS' ? '課程及指導服務安排、服務提供、聯絡、契約管理及爭議處理' : '課程安排、授課服務、聯絡、契約管理及爭議處理';
  return [
    `個人資料蒐集者為「${collector}」（品牌／店名：${draft.brand || '【待填店名】'}；負責人：${draft.responsible || '【待填負責人】'}），聯絡方式：${draft.contact || '【待填聯絡方式】'}。`,
    `為辦理${purpose}，蒐集${person}姓名、聯絡電話、成年／未成年身分、手寫簽名、約定書版本、閱讀確認、簽署時間及相關簽署紀錄；未成年者另蒐集法定代理人姓名、電話、關係及簽名。`,
    '資料由本店、受委託提供系統服務的蒸管家平台及必要的雲端服務供應商，在上述目的必要範圍內，以電子方式處理及利用。約定書與簽署資料主要保存於日本東京的 Supabase 雲端資料庫；網站及請求由 Vercel 提供雲端服務，必要的傳輸與處理可能涉及跨境。',
    '簽署資料於提供服務、契約管理、權益證明、爭議處理及依法應保存的必要期間內保存。保存或刪除申請由本店確認身分後依法處理；依法仍須保存者，會說明原因與限制。',
    `您可透過上述聯絡方式，向本店申請查詢、閱覽、取得複本、補充、更正、停止蒐集處理利用或刪除個人資料；本店將於確認身分後依法處理。`,
    '若不提供必要資料，將無法透過本系統完成線上簽署，可聯絡本店詢問其他簽署方式。本次簽署不包含公開行銷影像授權；額外用途應另行說明並依法取得必要同意。',
    ...(draft.privacySupplement?.trim() ? [`店家補充說明：${draft.privacySupplement.trim()}`] : []),
  ].join('\n\n');
}

/** Apply only to editable drafts. Never call when reading immutable evidence. */
export function withAgreementPrivacy(draft: CourseAgreementDraft): CourseAgreementDraft {
  if (draft.privacyNoticeMode === 'platform' || (draft.privacyNoticeMode === undefined && !draft.privacyNotice.trim())) {
    return { ...draft, privacyNoticeMode: 'platform', privacySupplement: draft.privacySupplement ?? '', privacyNotice: platformAgreementPrivacyNotice(draft) };
  }
  return draft;
}
