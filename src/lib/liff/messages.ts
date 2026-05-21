/**
 * LIFF UI 文案集中表 (PR-C2)
 *
 * 規則（plan §4 + §9）：
 *   - `src/app/(liff)/**` 一律 `import { liffMessages }`，不寫 inline 中文字串
 *   - 文案使用顧客語言；禁止「綁定」「驗證身份」「session」等技術詞
 *   - 「聯繫店家」一律導 `contactStoreUrl`（PR-C2 階段全店共用，PR-E 後改 per-store）
 *
 * 不在此檔處理：
 *   - i18n / 多語系（目前全 zh-TW）
 *   - 任何邏輯流程 / state machine
 */

/**
 * PR-C2 階段：全店共用一個 LINE OA 連結；多店分流交給 PR-E
 * (Store.lineDestination 已存在，但 PR-C2 不動 schema/DB，待 PR-E 再 wire)
 */
export const contactStoreUrl = "https://line.me/R/ti/p/@steamfoot";

export const liffMessages = {
  shell: {
    welcomeTitle: "歡迎使用暖暖蒸足 LINE 會員服務",
    welcomeBody: "為了讓您查詢預約、剩餘堂數與接收服務提醒，請先確認您的會員資料。",
    welcomeCta: "開始使用",
    welcomeFootnote: "只需一次，完成後下次從 LINE 進入即可直接使用。",
    signedInTitle: "歡迎回來",
    signedInBody: "您已啟用暖暖蒸足 LINE 會員服務。",
    initializing: "正在連接 LINE…",
    exchanging: "正在確認您的會員資料…",
    comingSoon: {
      booking: "體驗預約（即將開放）",
      myBookings: "我的預約（即將開放）",
      remainingSessions: "剩餘堂數（即將開放）",
    },
    notInLineApp: {
      title: "請從 LINE 開啟此頁",
      body: "為了確認您的會員資料，請從 LINE 圖文選單或好友訊息開啟此頁。",
    },
  },
  onboarding: {
    title: "確認您的會員資料",
    body: "請輸入您在店內留下的姓名與手機號碼，我們會用手機確認您的會員資料。",
    nameLabel: "姓名",
    namePlaceholder: "請輸入姓名",
    phoneLabel: "手機號碼",
    phonePlaceholder: "0912 345 678",
    phoneHelp: "請輸入您在店內留下的手機號碼",
    submit: "確認會員資料",
    submitting: "處理中…",
    privacyNote: "手機號碼僅用於確認會員資料，不會公開顯示。",
    successTitle: "歡迎回來",
    successBody: "您的 LINE 會員服務已啟用。之後可以從 LINE 查詢預約、剩餘堂數與接收服務提醒。",
    successCta: "回到會員首頁",
    initializing: "正在連接 LINE…",
  },
  error: {
    invalidPhone: "手機格式不正確，請輸入 09 開頭共 10 碼的手機號碼。",
    missingName: "請輸入您的姓名。",
    missingPhone: "請輸入您的手機號碼。",
    boundOther: "這支手機目前需要店家協助確認，請透過 LINE 聯繫我們。",
    ambiguous: "我們需要協助您確認會員資料，請透過 LINE 聯繫我們。",
    expired: "登入已逾時，請重新從 LINE 開啟此頁。",
    serviceUnavailable: "目前服務暫時無法使用，請稍後再試，或透過 LINE 聯繫我們。",
    contactStoreCta: "聯繫店家",
    retryCta: "重新整理",
  },
} as const;
