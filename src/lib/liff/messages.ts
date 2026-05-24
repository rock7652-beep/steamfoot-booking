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
export const contactStoreUrl = "https://line.me/R/ti/p/@083vmikb";

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
      booking: "體驗預約",
      // PR-D2：上線後 myBookings 從「即將開放」改 live 標題；保留 key 名減小 diff。
      myBookings: "我的預約",
      remainingSessions: "剩餘堂數（即將開放）",
    },
    notInLineApp: {
      title: "請從 LINE 開啟此頁",
      body: "為了確認您的會員資料，請從 LINE 圖文選單或好友訊息開啟此頁。",
    },
  },
  trialBooking: {
    // page header
    title: "預約體驗",
    body: "請選擇您方便到店體驗的日期與時段。",
    initializing: "正在連接 LINE…",

    // calendar
    monthPrev: "上個月",
    monthNext: "下個月",
    weekLabels: ["日", "一", "二", "三", "四", "五", "六"] as const,
    todayLabel: "今",
    closedDayLabel: "公休",
    monthEmpty: "本月沒有可預約的時段。",

    // slot list
    selectDatePrompt: "請先選擇日期",
    noSlotsForDay: "本日沒有可預約的時段。",
    slotsLoading: "載入時段中…",
    slotFullLabel: "已額滿",
    slotPastLabel: "已過",

    // submit
    submitPlaceholder: "請選擇日期與時段",
    submit: "確認預約",
    submitting: "預約中…",
    footnote: "店家會於現場收取體驗費用。",

    // success card
    successTitle: "體驗預約已建立 ✓",
    successFootnote: "店家會於現場收取體驗費用，期待您到店。",
    successDateLabel: "日期",
    successSlotLabel: "時段",
    successStoreLabel: "店家",
    successHomeCta: "回首頁",
    // PR-D4C-0：closing the loop — 體驗預約成立後，導顧客回我的預約確認新單。
    // 反映「lifecycle 已完整：看預約 → 取消 → 改時間 → 重訂 → 回查」。
    successMyBookingsCta: "查看我的預約",
    // PR-E1-1：SuccessCard LINE-green「聯絡店家」CTA，插在 myBookings 與 home 之間。
    // duplicate of bookings.contactStoreCta (per 拍板：不抽 shared)。
    contactStoreCta: "聯絡店家",

    // already_has_trial card
    existingTitle: "您目前已有體驗預約",
    existingBody: "如需調整請聯繫店家。",
    existingDateLabel: "日期",
    existingSlotLabel: "時段",
  },
  bookings: {
    // page header
    title: "我的預約",
    initializing: "正在連接 LINE…",
    loading: "載入預約中…",

    // tabs
    tabUpcoming: "即將到來",
    tabHistory: "歷史紀錄",

    // empty states
    emptyUpcomingTitle: "目前沒有即將到來的預約",
    emptyUpcomingBody: "從會員首頁可以建立體驗預約。",
    emptyHistoryTitle: "尚無歷史紀錄",
    emptyHistoryBody: "已完成的預約會出現在這裡。",

    // card labels — 顧客語言（不用 staff badge 字串）
    typeFirstTrial: "體驗預約",
    typePackage: "課程",
    typeSingle: "單次",
    typeMakeup: "補課",

    // card footer hint —「需改時間請聯絡店家」
    // PR-D2 的營運訊號收集器：顧客是否大量想改時間 → 決定 PR-D4 priority
    contactStoreHint: "需改時間請聯絡店家",

    // 回首頁
    backHomeCta: "回首頁",

    // 載入失敗 / no_customer
    loadFailed: "載入預約失敗，請稍後再試。",
    notSignedIn: "請從 LINE 重新進入會員首頁。",

    // PR-E1-1：upcoming non-cancelled card 上「聯絡店家」LINE-green CTA。
    // 與 error.contactStoreCta 同字串不同 namespace（per 拍板：duplicate 而非抽 shared，
    // 避免動到既有 3 個 error.contactStoreCta caller）。
    contactStoreCta: "聯絡店家",
  },
  // ── PR-D4A-1 顧客自助取消預約（D4A-2 wire UI 時消費）──
  cancelBooking: {
    // confirm modal (D4A-2，PR-D4B-1 擴：新增 rescheduleCta 為第三顆 primary 按鈕)
    confirmTitle: "確認取消此次預約？",
    // PR-D4B-1：body 微調為「可重新選擇新的時段」，與 rescheduleCta 路徑語意呼應。
    confirmBody: "取消後如需重新預約，可重新選擇新的時段。",
    confirmCta: "確認取消",
    dismissCta: "暫不取消",
    submitting: "處理中…",
    // PR-D4B-1：reschedule = cancel + redirect trial-booking。modal 內 primary 按鈕。
    // 顧客體感「我在改時間」，實作仍是 cancelLiffBooking → push trial-booking。
    rescheduleCta: "改時間",

    // booking card cta
    cardCta: "取消此次預約",
    // 與 cancelBooking action 內的 12 小時 cutoff 訊息一致；D4A 拍板沿用 web 12h
    cardHint: "開課前 12 小時可自行取消",

    // success
    successTitle: "預約已取消",
    successBody: "如需重新預約請從首頁建立。",

    // error states — 對應 cancelLiffBooking 的 status enum
    errorNotFound: "找不到此預約，可能已被取消或調整。",
    errorForbidden: "此預約無法由您取消。",
    errorCutoffBreach: "開課前 12 小時內無法自行取消，請聯繫店家協助。",
    errorStatusBlocked: "此預約目前狀態無法取消。",
    errorServiceUnavailable: "目前無法完成取消，請稍後再試。",
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

    // ── PR-D1B 體驗預約專用 ──
    selectDateFirst: "請先選擇日期。",
    selectSlotFirst: "請選擇時段。",
    slotFull: "該時段已額滿，請選擇其他時段。",
    slotUnavailable: "該時段目前無法預約，請選擇其他時段。",
    bookingLimitReached: "店家暫不接受新預約，請聯繫我們。",
    sessionLost: "登入狀態異常，請重新從 LINE 進入此頁。",
  },
} as const;
