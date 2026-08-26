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
 * ⚠️ PR-E 起：以下 4 個常數降級為「fallback default」。
 *
 * 正解：LIFF page 應呼叫 `resolveStorePresentation(slug)`（src/lib/store-resolver.ts）
 * 取得 per-store 的 `{ liffId, contactUrl, address, mapUrl }`，以 props 傳給 client。
 *
 * 這些常數現在只剩 2 個合法用途：
 *   1. `resolveStorePresentation` 內部：某店 DB 欄位為 null 時的 fallback 值，
 *      確保任何時點 LIFF 不會空白（PR-E 安全網）。
 *   2. `src/app/(liff)/liff/error.tsx`：error boundary 拿不到 server-side props，
 *      只能 import 常數，這是規格認可的例外。
 *
 * 其他 client component **禁止** 直接 import 這些常數，請改吃 props.presentation.*。
 * 等 PR-E 完成 backfill + 第二家店上線後，這些值與「竹北實際值」可能不同——
 * 直接 import 會造成多店資料顯示錯誤（這正是 PR-E 要消滅的根因）。
 *
 * 為何不刪 / 不改名：
 *   - 不刪：error.tsx 與 fallback path 仍需要這些字面值
 *   - 不改名：減少 PR-E 的 diff scope，rename 留 P2 後續清理
 *
 * 各常數來源：
 *   - contactStoreUrl   = 竹北 LINE OA chat
 *   - storeAddress      = 竹北實體地址
 *   - storeMapUrl       = 竹北 Google Maps 短連結
 *   - healthFlowLiffUrl = HealthFlow AI 評估 LIFF（per spec 1.5：先維持共用，未來再 per-store）
 */
export const contactStoreUrl = "https://line.me/R/ti/p/@083vmikb";

/**
 * HealthFlow AI 健康評估 LIFF URL（外部獨立 LIFF App）— 共用常數（PR-E 未 per-store）。
 *
 * 為何不在 PR-E 改 per-store：
 *   - HealthFlow 是獨立 LIFF App，用自己的 LIFF ID 處理 LINE 身分
 *   - Steamfoot 不傳任何 identity 參數（customerId / storeId / lineUserId / phone / name）
 *   - 純導流入口，各店指同一入口在功能上正確
 *   - 後續若某店要不同 HealthFlow 入口，再加 ShopConfig.healthFlowUrl（nullable，fallback 此值）
 *
 * 為何用 liff.line.me URL 而非 www.healthflow-ai.com：
 *   - liff.line.me redirector 是 LINE 官方基礎設施，自動 handle LINE Login + LIFF context
 *   - 顧客在 LINE App 內無感登入；換用 web URL 會強迫顧客重新登入
 */
export const healthFlowLiffUrl = "https://liff.line.me/2009744225-9aSc04fR";

export const storeAddress = "302新竹縣竹北市中崙里科大一路80號";
export const storeMapUrl = "https://maps.app.goo.gl/EyqUvkAaHCxu6iWz5?g_st=ic";

export const liffMessages = {
  shell: {
    welcomeTitle: "歡迎使用暖暖蒸足 LINE 會員服務",
    welcomeBody: "為了讓您查詢預約、剩餘堂數與接收服務提醒，請先確認您的會員資料。",
    welcomeCta: "開始使用",
    welcomeFootnote: "只需一次，完成後下次從 LINE 進入即可直接使用。",
    signedInTitle: "歡迎回來",
    signedInBody: "您已啟用暖暖蒸足 LINE 會員服務。",
    memberHomeLabel: "會員中心",
    availableSessionsLabel: "目前可預約",
    availableSessionsSuffix: "堂",
    makeupAvailableLabel: "另有補課資格",
    serviceSectionTitle: "常用服務",
    serviceSectionHint: "需要的功能都在這裡",
    designPreviewName: "彥陸",
    designPreviewStoreName: "暖暖蒸足",
    // PR-E3：3 個 CTA 已全 live (E2b)，加 helper copy 一行讓顧客知道入口在做什麼。
    // 對應 3 顆 CTA：「快速預約」→體驗預約 / 「查詢預約」→我的預約 / 「剩餘堂數」→我的方案
    welcomeHomeHint: "快速預約、查詢預約與剩餘堂數。",
    // PR-F1A：HealthFlow AI 健康評估外部 LIFF 入口。
    // 文案避免「診斷 / 治療 / 保證改善」等醫療性語言，用「了解狀態」中性描述。
    // 不暗示 Steamfoot 已同步 HealthFlow 資料（提供給店家「參考」≠ Steamfoot 已收到）。
    healthAssessmentCta: "AI 健康評估",
    healthAssessmentHint: "了解目前身體狀態，完成後可提供給店家參考。",
    initializing: "正在連接 LINE…",
    exchanging: "正在確認您的會員資料…",
    comingSoon: {
      booking: "體驗預約",
      // PR-D2：上線後 myBookings 從「即將開放」改 live 標題；保留 key 名減小 diff。
      myBookings: "我的預約",
      // PR-E2b：上線後 remainingSessions 從「即將開放」改 live 標題；保留 key 名減小 diff。
      // 文案用「我的方案」對齊目的地 page header (liffMessages.wallets.title)，
      // 與 PR-D2 myBookings 同 pattern (home button label == destination page title)。
      remainingSessions: "我的方案",
      // PR-G4：會員有剩餘堂數 (totalAvailable > 0) 時 home 出「課程預約」dark primary 排第一；
      // 體驗預約降 outlined。totalAvailable=0 或無方案則 CTA 隱藏，體驗預約維持 primary。
      memberBooking: "課程預約",
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
  // ── PR-G3 會員方案預約（使用剩餘堂數）──
  // 從 /liff/wallets ReadyView「立即預約」進來；mirror trialBooking 結構但拿掉
  // already_has_trial / 體驗收費 footnote / SuccessCard 的 store label。
  // 主視覺差異：加 walletSummary 摘要列；submit label = 使用堂數預約；
  // SuccessCard 只兩顆 CTA（查看我的預約 / 回我的方案）。
  memberBooking: {
    // page header
    title: "使用堂數預約",
    body: "請選擇您要使用方案堂數預約的日期與時段。",
    initializing: "正在連接 LINE…",

    // wallet summary bar (read-only)
    /** 摘要列前綴 — e.g. "目前可預約" */
    walletSummaryPrefix: "目前可預約",
    /** 摘要列數字後綴 — e.g. "堂" */
    walletSummarySuffix: "堂",
    /** 多張方案時顯示 — e.g. "共 2 張方案" (with {count} placeholder) */
    walletSummaryMultiPlan: "共 {count} 張方案",

    // 預約人數（PR-NoShow-2：LIFF 也支援多人）
    peopleLabel: "預約人數",
    peopleHint: "（最多 4 人）",

    // makeup credit priority (PR-NoShow-2)
    /** 有足夠補課券時提示 — with {count}，e.g. "本次將使用 2 張補課資格" */
    makeupHint: "本次將使用 {count} 張補課資格",
    /** 補課券有效期限提示 — with {date} placeholder, e.g. "有效期限至 2026/06/15" */
    makeupHintExpiry: "有效期限至 {date}",
    /** 補課券不足以覆蓋人數 — with {need} / {have} */
    makeupInsufficient:
      "補課資格不足以覆蓋本次預約人數（需 {need} 張、目前 {have} 張），請改為 1 人預約，或使用方案堂數預約。",

    // calendar (mirror trialBooking)
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
    submit: "使用堂數預約",
    submitting: "預約中…",

    // success card — 只 date + slot；store label / footnote 文案柔化
    successTitle: "預約已建立 ✓",
    successFootnote: "感謝您的預約，期待您到店。",
    /** PR-NoShow-2b：本次使用補課券提示 — with {count} */
    successMakeupUsed: "已使用 {count} 張補課資格，本次不扣堂。",
    successDateLabel: "日期",
    successSlotLabel: "時段",
    /** SuccessCard primary CTA — 與 trialBooking 一致 */
    successMyBookingsCta: "查看我的預約",
    /** SuccessCard secondary CTA — 回方案頁 */
    successWalletsCta: "回我的方案",

    // no_wallet card — wallet 缺失 / 過期 / 不足 三種 reason
    noWalletTitle: "目前無法使用方案預約",
    noWalletNone: "您目前沒有可用的方案，請聯繫店家購買方案。",
    noWalletExpired: "您的方案已過期，請聯繫店家協助。",
    noWalletInsufficient: "方案剩餘堂數不足，請聯繫店家協助。",
    /** no_wallet card 上「回我的方案」secondary */
    backToWalletsCta: "回我的方案",
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
    // PR-E1-2：upcoming non-cancelled card 上「導航到店」Google-blue CTA。
    // 顧客出發前最自然位置；按下開 Google Maps 短網址 → iOS/Android 跳原生 Maps。
    navigateCta: "導航到店",
    // PR-E1-3 / hotfix #184：upcoming non-cancelled card 上「加入行事曆」outlined CTA。
    // 同頁導向 Google Calendar TEMPLATE URL（純 HTTP）。
    // 原 v1（PR #183）走 ICS data URI 但 LINE iOS webview dispatch 不穩，
    // 換成 HTTP URL 後 iOS/Android webview 都穩定。實作見 _helpers.ts: generateGoogleCalendarUrl。
    // 解 lifecycle 最後一塊：「不要忘記來」— 體驗客 forget rate 第一殺手。
    calendarCta: "加入行事曆",
  },
  // ── PR-H2 我的健康紀錄 ──
  // LIFF 顧客在 LINE 內看蒸管家原生健康摘要的唯讀頁。
  // 不取代 dashboard 端 health-summary / health-history（那些是後台店長視角）；
  // 本 namespace 是「顧客自己看的版本」，文案更友善、加醫療免責。
  // 不寫醫療性語言（不用「診斷 / 治療 / 預防」），用「保養 / 追蹤 / 觀察」。
  health: {
    // page header
    title: "我的健康紀錄",
    initializing: "正在連接 LINE…",
    loading: "載入健康資料中…",

    // 最近量測卡（PR-H2c：移除 self-computed score；scoreSuffix 留著但已不顯示）
    /** e.g. "最近量測" */
    lastMeasuredLabel: "最近量測",
    /** with placeholder {n} → "（3 天前）" */
    daysAgoSuffix: "（{n} 天前）",
    /** @deprecated PR-H2c 後不顯示 self-computed score；留 key 避免別處意外引用報錯 */
    scoreSuffix: "/ 100",
    /** PR-H2c：在最近量測卡底下提示「正式分數請至 HealthFlow」（fallback 用，當 HealthFlow API 沒回 official score 時顯示） */
    scoreOnHealthFlowHint: "完整健康分數與評估會直接顯示在蒸管家，不需前往外部網站。",
    /** PR feat/liff-health-official-score：官方分數卡底下資料來源歸屬 */
    officialScoreAttribution: "資料來源：蒸管家健康紀錄",

    // 指標 labels
    metric: {
      weight: "體重",
      bmi: "BMI",
      bodyFat: "體脂肪",
      muscleMass: "肌肉量",
      visceralFat: "內臟脂肪",
      bodyWater: "體水分",
    },

    // 趨勢摘要
    /** {n} = trend length，e.g. "近 5 次變化" */
    trendLabel: "近 {n} 次變化",

    // 尚無量測
    noMeasurementTitle: "尚無量測紀錄",
    noMeasurementBody:
      "目前還沒有任何量測資料。您可以直接在蒸管家新增紀錄，或下次到店時請店家協助量測。",

    // 未綁定 / 找不到對應帳號
    notLinkedTitle: "尚無健康紀錄",
    notLinkedUnlinkedBody:
      "您目前尚未建立健康評估資料。點擊下方按鈕，即可在蒸管家完成第一次量測。",
    notLinkedNotFoundBody:
      "目前查無對應的健康評估資料。您可以直接在蒸管家新增量測；若曾有舊紀錄但未顯示，請聯繫店家協助核對。",
    notLinkedErrorBody:
      "健康紀錄暫時無法載入，請稍後再試，或聯繫店家協助處理。",

    // CTAs
    /** primary CTA — 蒸管家站內量測 */
    startHealthFlowCta: "新增量測",
    /** CTA loading — 產生 SteamFoot signed bridge state */
    linkStartLoading: "正在前往 AI 健康評估…",
    /** CTA error — signed bridge state could not be created */
    linkStartFailed: "暫時無法前往 AI 健康評估，請稍後再試或聯繫店家協助。",
    /** outline CTA — 已綁定狀態下，查看蒸管家完整評估 */
    viewFullCta: "查看歷史與曲線",
    /** LINE-green CTA */
    contactStoreCta: "聯絡店家",
    /** outline CTA — 回 LIFF 首頁 */
    backHomeCta: "回首頁",

    // 載入失敗
    loadFailed: "健康資料暫時無法載入，請稍後再試。",

    // ── 醫療免責 disclaimer（所有狀態都顯示）──
    // 健康指標 (BMI / 體脂 / 內臟脂肪 / 風險等級) 涉及個資敏感類，
    // 必須明示「非醫療診斷」避免顧客誤解 AI 建議為醫療意見。
    medicalDisclaimer:
      "此評估僅供健康管理參考，不能取代醫療診斷或治療建議。如有健康疑慮，請諮詢專業醫療人員。",
  },
  // ── PR-E2 我的方案 / 剩餘堂數 ──
  // 文案策略 (per 拍板 A (c) LIFF-friendly 調整)：
  //   大字 hero = walletAvailableToBook（顧客最想知道「我還能約幾次」）
  //   下方拆分 = 方案剩餘 R/T + 待到店 / 已使用 / 已註銷（mirror /my-plans 細項）
  //   raw remainingSessions 不單獨出現 — 一定配「待到店」拆分避免顧客誤解
  wallets: {
    // page header
    title: "我的方案",
    initializing: "正在連接 LINE…",
    loading: "載入方案中…",

    // section headers
    activeSectionTitle: "有效方案",
    expiredSectionTitle: "已過期",
    historySectionTitle: "歷史方案",

    // makeup credits (PR-NoShow-2)
    /** 補課券區塊標題 — with {count} placeholder, e.g. "補課資格（2 張）" */
    makeupSectionTitle: "補課資格（{count} 張）",
    /** 單張補課券標題 */
    makeupCreditLabel: "補課資格",
    /** 補課券效期 — with {date} placeholder, e.g. "有效期限至 2026/06/15" */
    makeupExpiryLabel: "有效期限至 {date}",
    /** 補課券無期限 */
    makeupNoExpiryLabel: "無使用期限",
    /** 補課券不扣堂註記 */
    makeupNoDeductHint: "預約時自動優先使用，不扣方案堂數",

    // wallet card — hero (大字)
    /** e.g. "可預約 3 堂" — 主視覺，用 walletAvailableToBook 結果 */
    availableSuffix: "堂可預約",

    // wallet card — 拆分（小字）
    /** e.g. "方案剩餘 5 / 10 堂" — raw 揭露 + total 對標 */
    remainingLabel: "方案剩餘",
    sessionsUnit: "堂",
    /** "待到店 2"（已預約未到店的非補課堂數） */
    pendingLabel: "待到店",
    /** "已使用 3"（含 BACKFILLED 補登） */
    usedLabel: "已使用",
    /** "已註銷 1"（VOIDED；獨立呈現） */
    voidedLabel: "已註銷",

    // wallet card — footer
    /** e.g. "有效至 2026/05/24" — 有 expiryDate 時 */
    validUntilLabel: "有效至",
    /** expiryDate=null 時顯示 */
    noExpiryLabel: "無期限",
    /** 7 天內到期 badge */
    expiringSoonBadge: "即將到期",
    /** Expired section 卡片 badge */
    expiredBadge: "已過期",
    /** History section 卡片 badge（USED_UP / ACTIVE+0）*/
    usedUpBadge: "已用完",
    /** History section 卡片 badge（CANCELLED）*/
    cancelledBadge: "已取消",

    // empty state
    emptyTitle: "目前沒有可使用的方案",
    emptyBody: "若您已購買方案，請聯絡店家協助確認。",

    // PR-G3：「立即預約」CTA — 露在 ReadyView footer
    // 只有 active 加總 availableToBook > 0 才顯示；連到 /liff/member-booking
    ctaBookNow: "立即預約",

    // 回首頁
    backHomeCta: "回首頁",

    // error states
    loadFailed: "載入方案失敗，請稍後再試。",
    notSignedIn: "請從 LINE 重新進入會員首頁。",
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
  // ── PR-LIFF-profile 顧客資料頁（read-only）──
  // mirror trialBooking / memberBooking 的 namespace 結構。文案避免技術詞
  // （「綁定」「session」「authoritative」），用顧客友善語言。
  profile: {
    // page header
    pageTitle: "我的資料",
    initializing: "正在連接 LINE…",

    // field labels
    fieldName: "姓名",
    fieldPhone: "電話",
    fieldEmail: "Email",
    fieldLineStatus: "LINE 綁定狀態",
    fieldLineName: "LINE 顯示名稱",
    fieldStoreName: "所屬門市",

    // empty / unfilled values
    fieldUnfilled: "未填寫",
    lineNameEmpty: "未綁定或未填寫",

    // LINE 綁定狀態 3 態
    lineStatusLinked: "已綁定 LINE",
    lineStatusUnlinked: "尚未綁定 LINE",
    lineStatusNeedsHelp: "需店家協助確認",

    // navigation
    backToHomeCta: "回會員中心",

    // no_customer state — 通常代表 session 未建立 / 顧客已登出 / 跨店誤入
    // 文案中性，引導顧客重新整理或聯絡店家；不暴露技術原因
    noCustomerTitle: "找不到您的會員資料",
    noCustomerBody: "請重新從 LINE 圖文選單開啟此頁，或聯繫店家確認您的會員狀態。",

    // home 入口按鈕（出現在 WelcomeBack 的次要 utility 區塊，
    // 視覺刻意低調，不擠壓現有 4 顆核心 CTA）
    homeEntryCta: "我的資料",
  },
  error: {
    invalidPhone: "手機格式不正確，請輸入 09 開頭共 10 碼的手機號碼。",
    missingName: "請輸入您的姓名。",
    missingPhone: "請輸入您的手機號碼。",
    boundOther: "這支手機目前需要店家協助確認，請透過 LINE 聯繫我們。",
    ambiguous: "我們需要協助您確認會員資料，請透過 LINE 聯繫我們。",
    expired: "登入已逾時，請重新從 LINE 開啟此頁。",
    paymentPending: "此方案尚待店家確認付款，暫時無法預約，請聯繫店家確認。",
    serviceUnavailable: "目前服務暫時無法使用，請稍後再試，或透過 LINE 聯繫我們。",
    contactStoreCta: "聯繫店家",
    /** PR-E2：LIFF 頁拿不到 store context（x-store-slug header + store-slug cookie 皆無）時的安全提示。
     *  取代 PR-E2 前的「fallback 到 zhubei」靜默行為，避免多店環境下顧客誤看到竹北資料。 */
    cannotConfirmStore: "無法確認分店，請從 LINE 圖文選單或好友訊息開啟此頁。",
    /** PR-E2：storeSlug 在 URL 帶到，但 DB 查不到對應店家（typo / 已停業）。
     *  顯式 notFound() → (liff)/not-found.tsx；故意與 cannotConfirmStore /
     *  NotOpenForLiff 視覺區隔，讓顧客知道是 URL 錯誤而非 LIFF 服務問題。 */
    storeNotFound: "找不到您要前往的分店。",
    storeNotFoundHint: "請確認連結是否正確，或回到 LINE 圖文選單重新開啟。",
    retryCta: "重新整理",

    // ── PR-D1B 體驗預約專用 ──
    selectDateFirst: "請先選擇日期。",
    selectSlotFirst: "請選擇時段。",
    slotFull: "該時段已額滿，請選擇其他時段。",
    slotUnavailable: "該時段目前無法預約，請選擇其他時段。",
    bookingLimitReached: "店家暫不接受新預約，請聯繫我們。",
    sessionLost: "登入狀態異常，請重新從 LINE 進入此頁。",
    // PR-NoShow-2：補課券在併發/過期 race 下暫時無法使用。
    makeupUnavailable: "補課資格暫時無法使用，請重新整理後再試。",
  },
} as const;
