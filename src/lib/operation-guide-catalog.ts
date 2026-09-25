import type { OperationGuide, GuideCategory } from "./operation-guide-types";

/** Source-reviewed content; draft updates and interaction verification remain separate. */
export const guideCategories: GuideCategory[] = [
  {
    "id": "start",
    "label": "開始使用",
    "routes": [
      "/dashboard"
    ]
  },
  {
    "id": "booking",
    "label": "預約與到店",
    "routes": [
      "/dashboard/bookings"
    ]
  },
  {
    "id": "hours",
    "label": "營業與時段",
    "routes": [
      "/dashboard/settings/hours",
      "/dashboard/settings/duty"
    ]
  },
  {
    "id": "customers",
    "label": "顧客與登入",
    "routes": [
      "/dashboard/customers",
      "/dashboard/member-link-reviews"
    ]
  },
  {
    "id": "plans",
    "label": "方案與堂數",
    "routes": [
      "/dashboard/plans"
    ]
  },
  {
    "id": "money",
    "label": "收款與現金",
    "routes": [
      "/dashboard/revenue",
      "/dashboard/transactions",
      "/dashboard/payments",
      "/dashboard/reconciliation",
      "/dashboard/service-fee-calculator",
      "/dashboard/cashbook",
      "/dashboard/cash-drawer"
    ]
  },
  {
    "id": "care",
    "label": "通知與顧客關懷",
    "routes": [
      "/dashboard/reminders",
      "/dashboard/trial-follow-up"
    ]
  },
  {
    "id": "staff",
    "label": "人員與權限",
    "routes": [
      "/dashboard/staff",
      "/dashboard/duty"
    ]
  },
  {
    "id": "analysis",
    "label": "經營分析",
    "routes": [
      "/dashboard/reports",
      "/dashboard/advanced-reports",
      "/dashboard/data-export",
      "/dashboard/store-revenue"
    ]
  },
  {
    "id": "settings",
    "label": "門市與分店",
    "routes": [
      "/dashboard/settings"
    ]
  },
  {
    "id": "health",
    "label": "健康紀錄",
    "routes": [
      "/dashboard/health",
      "/dashboard/customers/*/health"
    ]
  },
  {
    "id": "digital",
    "label": "數位管家",
    "routes": [
      "/dashboard/settings/digital-butler",
      "/dashboard/digital-butler"
    ]
  },
  {
    "id": "spa",
    "label": "服務排程",
    "routes": [
      "/dashboard/spa-schedule",
      "/dashboard/spa-staff",
      "/dashboard/spa-resources"
    ]
  },
  {
    "id": "support",
    "label": "疑難排解",
    "routes": [
      "/dashboard/system-status",
      "/dashboard/device-preview"
    ]
  }
];

export const additionalGuides: OperationGuide[] = [
  {
    "id": "S01",
    "category": "start",
    "title": "第一次使用，要先設定什麼？",
    "summary": "先完成營業時間、方案與收款設定，再安排人員和提醒；設定後用測試資料走一次預約流程。",
    "path": "設定 → 店務設定／營運設定",
    "steps": [
      "先確認頂欄門市正確，再到「設定」確認營業與預約時間。",
      "設定店內方案、付款資訊與服務人員，再檢查提醒管理。",
      "使用測試顧客走一次預約、到店與收款流程，再開放給顧客。"
    ],
    "important": "試走流程也可能建立交易或發出通知，請使用隔離測試店及測試收件人。",
    "success": "",
    "keywords": "新手 開店 初次 初始化",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "先完成營業時間、方案與收款設定，再安排人員和提醒；設定後用測試資料走一次預約流程。"
  },
  {
    "id": "S02",
    "category": "start",
    "title": "首頁的待處理事項，要從哪裡開始？",
    "summary": "先處理需要確認的收款，再查看要回訪的顧客；首頁列出待辦，不代表已完成收款或聯繫。",
    "path": "首頁 → 今天待處理",
    "steps": [
      "先看「今天待處理」，確認收款或回訪項目。",
      "點該筆旁的操作，核對顧客與紀錄後處理。",
      "返回首頁查看更新結果；看不完可點「查看全部」。"
    ],
    "important": "顯示待確認收款不代表款項已入帳，請先核對。",
    "success": "",
    "keywords": "首頁 儀表板 待辦",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "先處理需要確認的收款，再查看要回訪的顧客；首頁列出待辦，不代表已完成收款或聯繫。"
  },
  {
    "id": "S03",
    "category": "start",
    "title": "系統顯示上一個營業日尚未閉店怎麼辦？",
    "summary": "要先完成上一個營業日的現金核對與閉店，才能接續開店。請核對畫面上的營業日。",
    "path": "首頁 → 今日開店檢查 → 查看現金抽屜",
    "steps": [
      "點「查看現金抽屜」，先確認未閉店的營業日。",
      "核對該日現金收支、提領、補入與實際點到金額。",
      "完成前一筆閉店後，再處理今日開店點錢。"
    ],
    "important": "不要用今天的現金金額代填過去營業日。",
    "success": "",
    "keywords": "開店 跨日 尚未閉店",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "cashDrawer.read",
    "feature": "cash_drawer",
    "sources": [
      "src/app/(dashboard)/dashboard/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "要先完成上一個營業日的現金核對與閉店，才能接續開店。請核對畫面上的營業日。"
  },
  {
    "id": "A04",
    "category": "booking",
    "title": "如何替顧客新增預約？",
    "summary": "新增預約時先選對顧客，再選日期、人數與可用時段。",
    "path": "預約管理 → 新增預約",
    "steps": [
      "先找到正確顧客，避免為既有顧客重複建檔。",
      "選日期、人數及可用時段，核對方案或體驗資訊。",
      "確認資料後送出，回到當日清單核對顧客、時間與人數。"
    ],
    "important": "人數變更後若原時段容量不足，需要重新選時段。",
    "success": "當日清單出現正確的預約，沒有重複新增。",
    "keywords": "代約 新預約 新增",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "booking.create",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx",
      "src/app/(dashboard)/dashboard/bookings/new/booking-form.tsx",
      "src/app/(dashboard)/dashboard/bookings/no-show-modal.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "新增預約時先選對顧客，再選日期、人數與可用時段。"
  },
  {
    "id": "A05",
    "category": "booking",
    "title": "怎麼查看今天或其他日期的預約？",
    "summary": "在預約管理切換日期即可查看當天預約，不必回首頁重新進入。",
    "path": "預約管理",
    "steps": [
      "在日期區選今天或要查看的日期。",
      "查看該日清單，點開預約確認顧客與狀態。",
      "若找不到資料，先確認門市、日期及目前篩選。"
    ],
    "important": "畫面上的日期與門市會影響清單範圍。",
    "success": "",
    "keywords": "月曆 今天 明天 查詢",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "booking.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx",
      "src/app/(dashboard)/dashboard/bookings/new/booking-form.tsx",
      "src/app/(dashboard)/dashboard/bookings/no-show-modal.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "在預約管理切換日期即可查看當天預約，不必回首頁重新進入。"
  },
  {
    "id": "A06",
    "category": "booking",
    "title": "服務完成前，要核對哪些資料？",
    "summary": "完成服務會影響堂數與收款紀錄。送出前要核對顧客、實際到店人數、方案與付款狀態。",
    "path": "預約管理 → 預約明細",
    "steps": [
      "核對顧客、實際到店人數、方案與到期日。",
      "檢查本次的付款方式、收款金額或扣堂說明。",
      "確認無誤再完成服務，回查預約狀態及收款／堂數紀錄。"
    ],
    "important": "完成服務可能影響收款與堂數，送出失敗時先核對紀錄，不要重複建立交易。",
    "success": "",
    "keywords": "完成 結帳 報到",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "booking.update",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx",
      "src/app/(dashboard)/dashboard/bookings/new/booking-form.tsx",
      "src/app/(dashboard)/dashboard/bookings/no-show-modal.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "完成服務會影響堂數與收款紀錄。送出前要核對顧客、實際到店人數、方案與付款狀態。"
  },
  {
    "id": "A08",
    "category": "booking",
    "title": "顧客沒來，如何標記未到？",
    "summary": "未到可選「扣堂」或「扣堂並給 7 日補課資格」；補課預約未到不會再扣一次堂數或再發補課券。",
    "path": "預約管理 → 預約明細 → 標記未到",
    "steps": [
      "在預約管理點開該筆預約，核對顧客、日期與預約人數。",
      "點「未到」，依本次處理方式選「扣堂」或「扣堂並給 7 日補課資格」。",
      "確認提示中的扣堂與補課安排後送出，再核對預約狀態。"
    ],
    "important": "補課預約未到僅標記未到，不再扣方案堂數或產生新的補課資格。",
    "success": "預約顯示未到，結果符合確認時選擇的處理方式。",
    "keywords": "缺席 爽約 補課",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "booking.update",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/bookings/no-show-modal.tsx",
      "src/server/actions/booking.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "未到可選「扣堂」或「扣堂並給 7 日補課資格」；補課預約未到不會再扣一次堂數或再發補課券。"
  },
  {
    "id": "A09",
    "category": "booking",
    "title": "同行預約只來一部分的人，怎麼處理？",
    "summary": "部分同行者未到時，原預約保留的方案堂數仍會扣除；缺席者是否取得補課資格，依本次選擇處理。",
    "path": "預約管理 → 預約明細 → 實際到店",
    "steps": [
      "點開預約，核對原預約人數與實際到店人數。",
      "完成服務時填入實際到店人數，核對缺席者的補課安排。",
      "確認後送出，再核對實際到店紀錄、扣堂與補課結果。"
    ],
    "important": "原預約保留的方案堂數仍會扣除，不是只扣實際到店人數。補課券另有期限。",
    "success": "實際到店與未到人數合計符合原預約。",
    "keywords": "兩人 一人 同行 部分未到",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "booking.update",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx",
      "src/server/actions/booking.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "部分同行者未到時，原預約保留的方案堂數仍會扣除；缺席者是否取得補課資格，依本次選擇處理。"
  },
  {
    "id": "A10",
    "category": "booking",
    "title": "操作後沒看到更新，要再按一次嗎？",
    "summary": "先確認上一次是否已成功，再決定要不要重送，避免產生兩筆預約或收款。",
    "path": "預約管理 → 更新狀態",
    "steps": [
      "先看是否仍在儲存或顯示錯誤，保留未儲存內容。",
      "完成後使用清單的手動更新，重新核對該筆預約。",
      "若仍不一致，記下日期、顧客及操作時間再聯繫支援。"
    ],
    "important": "畫面未更新不代表送出失敗；先查紀錄，避免重複預約或收款。",
    "success": "",
    "keywords": "刷新 重新整理 卡住 更新",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "booking.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx",
      "src/app/(dashboard)/dashboard/bookings/new/booking-form.tsx",
      "src/app/(dashboard)/dashboard/bookings/no-show-modal.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "先確認上一次是否已成功，再決定要不要重送，避免產生兩筆預約或收款。"
  },
  {
    "id": "B01",
    "category": "hours",
    "title": "每週固定營業時間怎麼設定？",
    "summary": "固定每週的開放時間在營業與預約時間設定；單日例外另外調整。",
    "path": "設定 → 預約開放設定 → 每週固定時段",
    "steps": [
      "展開每週固定時段，選要調整的星期。",
      "設定營業與服務時間，檢查開放時段預覽。",
      "確認套用範圍後儲存，再選未來日期查看。"
    ],
    "important": "每週規則與單日特殊設定不同，修改前先確認套用範圍。",
    "success": "未來日期呈現預期的開放時段。",
    "keywords": "每週 平日 營業時間",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "business_hours.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/settings/hours/schedule-manager.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "固定每週的開放時間在營業與預約時間設定；單日例外另外調整。"
  },
  {
    "id": "B02",
    "category": "hours",
    "title": "中午休息或一天分兩段營業怎麼設定？",
    "summary": "一天可以分成多段服務時間，兩段之間的空檔就能保留作為午休。",
    "path": "設定 → 預約開放設定 → 選日期 → 服務時間",
    "steps": [
      "選日期，在服務時間設定多段起訖時間。",
      "讓休息時間落在兩段服務時間之間，檢查預覽。",
      "核對儲存前確認，儲存後再看該日。"
    ],
    "important": "重新設定服務時間會清除套用日期原有的臨時時段調整；既有預約不會自動取消。",
    "success": "休息區間沒有開放新預約時段。",
    "keywords": "午休 分段 休息",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "business_hours.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/settings/hours/schedule-manager.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "一天可以分成多段服務時間，兩段之間的空檔就能保留作為午休。"
  },
  {
    "id": "B03",
    "category": "hours",
    "title": "某天臨時休息，怎麼停止新預約？",
    "summary": "將指定日期設為休息，可以停止新預約；原本已成立的預約仍需另行安排。",
    "path": "設定 → 預約開放設定 → 選日期",
    "steps": [
      "選需要休息的日期，調整當日狀態。",
      "確認是只改當天，還是套用其他日期。",
      "儲存後檢查時段，另外處理當天已存在的預約。"
    ],
    "important": "關閉營業不會自動取消既有預約，也不會更動既有收款與扣堂。",
    "success": "當天不再開放新預約，既有顧客另行安排完成。",
    "keywords": "公休 進修 休假 停業",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "business_hours.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/settings/hours/schedule-manager.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "將指定日期設為休息，可以停止新預約；原本已成立的預約仍需另行安排。"
  },
  {
    "id": "B04",
    "category": "hours",
    "title": "臨時增開、關閉或重開時段怎麼做？",
    "summary": "當日時段管理可增開或調整單一時段，不必為一天的變動修改整週設定。",
    "path": "預約管理 → 當日時段管理",
    "steps": [
      "選要處理的日期，開啟當日時段管理。",
      "選擇新增時段，或對既有時段關閉／重新開放；需要調整名額時可用加減按鈕或輸入數字。",
      "核對已調整標記、時間、已預約人數與名額，儲存後回到當日清單確認。"
    ],
    "important": "這是時段供應的調整；已存在的預約仍需另外處理。",
    "success": "當日時段開放狀態符合設定。",
    "keywords": "加開 增開 關閉 重開 當日時段 已調整 名額 0 已額滿",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "business_hours.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/bookings/day-slot-manager.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "當日時段管理可增開或調整單一時段，不必為一天的變動修改整週設定。"
  },
  {
    "id": "B06",
    "category": "hours",
    "title": "單一時段想多接幾位，在哪裡調整？",
    "summary": "可在指定日期調整單一時段的名額。增加名額前，先確認當班人力與服務容量。",
    "path": "預約管理 → 當日時段管理；或設定 → 預約開放設定 → 單一時段開放與名額",
    "steps": [
      "在預約管理選日期並開啟當日時段管理，核對目前已約人數與名額。",
      "對開放中的時段輸入 0～99 的整數名額，或使用加減按鈕；名額不能低於已有預約人數。",
      "核對草稿後儲存；也可回設定的單一時段開放與名額處理或回復預設。"
    ],
    "important": "名額 0 仍保留時段，顧客端顯示已額滿，不等於關閉時段。已有預約不會自動取消。",
    "success": "時段顯示更新後的名額。",
    "keywords": "名額 人數 容量 單日 加減 0 已額滿 不能低於已約",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "business_hours.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/settings/hours/schedule-manager.tsx",
      "src/app/(dashboard)/dashboard/bookings/day-slot-manager.tsx",
      "src/server/actions/business-hours.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "預約管理可直接調整指定日期的單一時段名額；名額 0 表示已額滿，增加前先確認現場人力與容量。"
  },
  {
    "id": "B10",
    "category": "hours",
    "title": "明明還有空位，為什麼顧客約不到？",
    "summary": "有剩餘名額仍可能無法預約：日期未開放、時段已過、值班不足或方案不適用都可能影響。",
    "path": "預約管理／設定 → 預約開放設定",
    "steps": [
      "確認日期已開放、時段尚未過時且未被關閉。",
      "核對同行人數是否超過剩餘名額，以及值班聯動設定。",
      "再查顧客有效方案、可預約堂數與到期日。"
    ],
    "important": "有空位不代表該顧客一定符合預約條件；先查限制，不要直接加堂數。",
    "success": "",
    "keywords": "不能預約 約不到 空位",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "business_hours.view",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/settings/hours/schedule-manager.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "有剩餘名額仍可能無法預約：日期未開放、時段已過、值班不足或方案不適用都可能影響。"
  },
  {
    "id": "C01",
    "category": "customers",
    "title": "怎麼找到顧客，避免重複建檔？",
    "summary": "輸入姓名、電話或 LINE 名稱查看即時候選，明確選定並核對紀錄後再操作。",
    "path": "顧客管理",
    "steps": [
      "輸入姓名、電話或 LINE 名稱，等待即時候選清單顯示。",
      "點選正確候選；只輸入文字或在搜尋框按 Enter 不會自動選第一位顧客。",
      "核對顧客資料、舊預約與方案是否屬於本人。",
      "確定查無資料時，才使用新增顧客。"
    ],
    "important": "同名不代表同一人；不要只憑姓名修改別人的資料。",
    "success": "",
    "keywords": "即時搜尋 姓名 電話 LINE 名稱 中文選字 Enter 同名 重複",
    "details": [
      "候選只限目前門市及登入者可查看的顧客；切換門市、返回頁面或資料更新後會重新載入。",
      "大量顧客時系統會接續查詢其餘資料；顯示載入失敗時先重試，不要直接建立同名顧客。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "customer.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/page.tsx",
      "src/components/customer-instant-search.tsx",
      "src/app/api/customers/search-index/route.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "輸入姓名、電話或 LINE 名稱查看即時候選，明確選定並核對紀錄後再操作。"
  },
  {
    "id": "C03",
    "category": "customers",
    "title": "顧客姓名或電話填錯，怎麼修正？",
    "summary": "顧客基本資料可以編輯，但修改姓名或電話不會自動更換 LINE 綁定。",
    "path": "顧客管理 → 顧客資料 → 編輯",
    "steps": [
      "找到顧客，先核對目前的姓名與電話。",
      "進入編輯，修改需要更正的欄位後儲存。",
      "返回顧客資料確認新內容。"
    ],
    "important": "更正聯絡資料不等於重新綁定 LINE；若遇到電話衝突，保留提示再處理。",
    "success": "資料頁顯示正確的姓名與電話。",
    "keywords": "名字 手機 更正 編輯",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "customer.update",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "顧客基本資料可以編輯，但修改姓名或電話不會自動更換 LINE 綁定。"
  },
  {
    "id": "C04",
    "category": "customers",
    "title": "哪裡可以看顧客的預約與消費紀錄？",
    "summary": "顧客資料頁分開列出預約與消費紀錄；消費可依期間、類型、付款方式及文字篩選。",
    "path": "顧客管理 → 顧客資料 → 過往紀錄",
    "steps": [
      "打開顧客資料，找到過往紀錄。",
      "切換預約紀錄或消費紀錄；消費頁可選期間、消費類型、付款方式或輸入品項文字。",
      "核對篩選後的筆數與合計，再查看方案、零售、服務、退款或其他收入明細。",
      "需要更多資訊時，開啟對應預約、交易或現金收支明細。"
    ],
    "important": "預約次數與消費筆數不同；只有已關聯此顧客的店內收入才會出現在消費紀錄。",
    "success": "",
    "keywords": "歷史 歷次 消費 紀錄 篩選 合計 方案 零售 服務 退款 付款方式",
    "details": [
      "方案交易、退款與店內手動收入會依各自日期合併排序；支出不列為顧客消費。",
      "店內收入若未選關聯顧客，不會事後依姓名或備註猜測歸戶。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "customer.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/page.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/records/page.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/records/customer-consumption-filters.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "顧客資料頁分開列出預約與消費紀錄；消費可依期間、類型、付款方式及文字篩選。"
  },
  {
    "id": "C05",
    "category": "customers",
    "title": "店內備註和本次預約備註有什麼不同？",
    "summary": "店內／服務備註用來保留長期需求；本次預約備註只記錄這一次的交代。",
    "path": "顧客資料／預約明細",
    "steps": [
      "長期服務需求放在顧客的店內／服務備註。",
      "僅本次服務要注意的事情，放在預約的本次備註。",
      "修改後確認儲存結果，避免把一次性事項留在長期備註。"
    ],
    "important": "例如「今天晚到」適合本次備註；不要把敏感資訊寫進不必要的欄位。",
    "success": "",
    "keywords": "註記 長期 晚到 備註",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "customer.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "explanation",
    "answer": "店內／服務備註用來保留長期需求；本次預約備註只記錄這一次的交代。"
  },
  {
    "id": "C07",
    "category": "customers",
    "title": "顧客登入後看不到原本方案，先查什麼？",
    "summary": "先核對門市與顧客身分，並展開「已過期／歷史方案」；看不到方案不一定是資料消失。",
    "path": "顧客管理 → 顧客資料 → LINE 與通知設定",
    "steps": [
      "確認顧客開啟的是正確門市入口。",
      "請顧客進入方案頁；若有「已過期」或「歷史方案」標題，點標題展開，再核對方案名稱與期限。",
      "用原本電話查找舊資料，核對預約、方案與 LINE 綁定。",
      "若疑似登入另一身分，保留錯誤畫面與時間，交由有權限的人員核對。"
    ],
    "important": "不要先新增同名顧客或重發方案，避免把資料分散到另一個身分。",
    "success": "",
    "keywords": "登入 找不到 舊資料 LINE 綁定 已有會員 重新註冊 暫時無法使用 登入逾時 已過期 歷史方案 收合 展開",
    "details": [
      "方案頁的「已過期」與「歷史方案」預設收合，標題旁顯示該區筆數；沒有該類方案時不顯示區塊。展開只是查看，不會恢復效期、增加堂數或改變扣堂規則。",
      "顯示「您已有會員帳號」時，請使用原本的 LINE 登入方式，或聯繫店家核對；不要另建帳號。",
      "顯示「會員資料需要店家協助確認」屬於身分核對，不需要重新註冊或解除 LINE 綁定。",
      "顯示「服務暫時無法使用」不代表是新客；保留畫面與時間，稍後再試或聯繫店家。只有「登入已逾時」才依提示重新從 LINE 開啟。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "customer.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/page.tsx",
      "src/app/customer-login-form.tsx",
      "src/app/(liff)/liff/onboarding/onboarding-form.tsx",
      "src/app/(liff)/liff/wallets/wallets-list.tsx",
      "src/lib/liff/messages.ts",
      "src/server/services/verified-line-customer.ts"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "先核對門市與顧客身分，並展開「已過期／歷史方案」；看不到方案不一定是資料消失。"
  },
  {
    "id": "C08",
    "category": "customers",
    "title": "顧客換 LINE 或綁定有衝突怎麼辦？",
    "summary": "LINE 綁定衝突要先確認本人及原資料，再由有權限的人員處理，不能只憑同名就合併或重綁。",
    "path": "顧客管理 → 顧客資料 → 管理 LINE 綁定",
    "steps": [
      "先核對顧客本人、電話及目前綁定紀錄。",
      "由具 LINE 重新綁定權限的人員查看申請與診斷資訊。",
      "依畫面處理；無法唯一確認身分時，整理資料請支援協助。"
    ],
    "important": "不能因為同名就直接移轉身分；重新綁定不等於新建會員。",
    "success": "",
    "keywords": "換帳號 重綁 衝突 會員資料需要店家協助確認 通知綁定 登入身分",
    "details": [
      "登入身分與接收通知的 LINE 綁定不一定是同一件事。開通通知不能用來覆蓋原有登入帳號。",
      "若顯示「您的會員資料需要店家協助確認」，請聯繫店家，不需要重新註冊或解除 LINE 綁定；不要把身分衝突當成暫時連線問題反覆重試。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "customer.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/page.tsx",
      "src/server/actions/customer-auth.ts",
      "src/server/services/bind-line-to-customer.ts",
      "src/lib/liff/messages.ts"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "LINE 綁定衝突要先確認本人及原資料，再由有權限的人員處理，不能只憑同名就合併或重綁。"
  },
  {
    "id": "D02",
    "category": "plans",
    "title": "顧客買了方案，如何登記？",
    "summary": "從顧客資料指派方案並選付款狀態；尚待確認的款項，要確認入帳後才發放方案。",
    "path": "顧客管理 → 顧客資料 → 指派課程方案",
    "steps": [
      "選方案與付款方式，核對款項狀態。",
      "選方案預設期限、自訂期限或指定到期日，確認金額。",
      "送出後核對交易、方案到期日與發放狀態。"
    ],
    "important": "「尚待確認」需確認入帳後才發放堂數；不可把未入帳款項當已收款。",
    "success": "顧客資料能查到正確方案與款項狀態。",
    "keywords": "買課 開卡 指派 購買",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "wallet.create",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/assign-plan-form.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/extend-wallet-expiry-form.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/adjust-wallet-form.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "從顧客資料指派方案並選付款狀態；尚待確認的款項，要確認入帳後才發放方案。"
  },
  {
    "id": "D03",
    "category": "plans",
    "title": "在哪裡看剩餘堂數與到期日？",
    "summary": "剩餘堂數不一定全都能再預約，還要扣除已被預約保留的堂數，並確認到期日。",
    "path": "顧客管理 → 顧客資料 → 方案",
    "steps": [
      "找到顧客目前方案，核對方案名稱。",
      "分別查看方案剩餘、已預約、可再預約與到期日。",
      "有多張方案時逐張核對，不只看合計。"
    ],
    "important": "已預約堂數占用可預約額度；畫面提示明細不一致時先查紀錄。",
    "success": "",
    "keywords": "剩餘 可用 可預約 效期",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "wallet.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/assign-plan-form.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/extend-wallet-expiry-form.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/adjust-wallet-form.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "剩餘堂數不一定全都能再預約，還要扣除已被預約保留的堂數，並確認到期日。"
  },
  {
    "id": "D04",
    "category": "plans",
    "title": "方案到期日填錯，怎麼修改？",
    "summary": "可用「編輯到期日」修正日期並留下原因；這個操作不會更改收款金額或剩餘堂數。",
    "path": "顧客資料 → 方案 → 編輯到期日",
    "steps": [
      "點「編輯到期日」，選新的日期。",
      "填寫必填的修改原因，確認是提前或延後。",
      "點「儲存到期日」，核對更新提示與新日期。"
    ],
    "important": "需填寫修改原因；新日期不可早於今天。無期限方案不使用這個日期編輯入口。",
    "success": "看到方案到期日已更新，且日期正確。",
    "keywords": "展延 延長 提前 到期",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "wallet.adjust",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/extend-wallet-expiry-form.tsx",
      "src/server/actions/wallet.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "可用「編輯到期日」修正日期並留下原因；這個操作不會更改收款金額或剩餘堂數。"
  },
  {
    "id": "D07",
    "category": "plans",
    "title": "方案過期或可用堂數不足怎麼查？",
    "summary": "先查效期，再查可用與已預約堂數；取消預約會釋放保留堂數，但不會延長原方案期限。",
    "path": "顧客管理 → 顧客資料 → 方案",
    "steps": [
      "逐張確認方案期限與狀態。",
      "核對已預約占用的堂數及這次同行人數。",
      "依實際購買或更正情況處理，完成後重新查詢。"
    ],
    "important": "取消預約釋放堂數，不會自動延長原方案期限。",
    "success": "",
    "keywords": "過期 不足 扣堂",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "wallet.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/assign-plan-form.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/extend-wallet-expiry-form.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/adjust-wallet-form.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "先查效期，再查可用與已預約堂數；取消預約會釋放保留堂數，但不會延長原方案期限。"
  },
  {
    "id": "D09",
    "category": "plans",
    "title": "堂數記錄不符，如何核對與更正？",
    "summary": "先查明差額原因，再輸入調整後應有的堂數；「調整為幾堂」不是本次要增加幾堂。",
    "path": "顧客資料 → 方案與堂數明細",
    "steps": [
      "先比對方案堂數明細、已預約及已完成紀錄，確認差額原因。",
      "需更正時點「調整堂數」，在「調整為幾堂」輸入更正後的數量，並記下原因。",
      "核對輸入的最終數量後點「確認」，回到方案資料確認堂數。"
    ],
    "important": "補登紙本已使用紀錄時，應使用「補登已使用堂數」，保留實際使用日期與原因。",
    "success": "出現「堂數已更新」，方案顯示調整後的堂數。",
    "keywords": "補堂 調整 錯誤 堂數",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "wallet.adjust",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/adjust-wallet-form.tsx",
      "src/server/actions/wallet.ts"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "先查明差額原因，再輸入調整後應有的堂數；「調整為幾堂」不是本次要增加幾堂。"
  },
  {
    "id": "E01",
    "category": "money",
    "title": "顧客說已匯款，如何確認收款？",
    "summary": "店家需先查到實際入帳，再確認系統收款；顧客說已匯款不等於款項已核實。",
    "path": "首頁待處理收款 → 付款確認工作台 → 確認已入帳",
    "steps": [
      "從首頁待處理收款開啟交易，核對顧客、方案、金額與轉帳後四碼。",
      "先以銀行實際入帳紀錄核對，再點「確認已入帳」。後四碼是顧客自填資訊，不能單獨證明入帳。",
      "確認視窗內容無誤後，點「確認已入帳並開通」；看到成功提示，再核對交易與顧客方案。"
    ],
    "important": "確認收款可能發放堂數並計入營收；不要重複指派方案。",
    "success": "交易不再待確認，對應方案狀態正確。",
    "keywords": "核帳 入帳 轉帳 匯款 後四碼 待確認收款 付款確認工作台",
    "details": [
      "此題說明蒸足方案的待確認收款；SPA 請查看「SPA 服務完成後，怎麼收款或扣方案？」。",
      "送出購買申請時還不會開通堂數。確認失敗或顯示已處理時，先查原交易及方案，不要重新指派或再建訂單。"
    ],
    "modules": ["steamfoot"],
    "permission": "transaction.create",
    "feature": null,
    "sources": [
      "src/server/queries/store-todos.ts",
      "src/app/(dashboard)/dashboard/payments/page.tsx",
      "src/app/(dashboard)/dashboard/payments/confirm-button.tsx",
      "src/server/actions/transaction.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "店家需先查到實際入帳，再確認系統收款；顧客說已匯款不等於款項已核實。"
  },
  {
    "id": "E06",
    "category": "money",
    "title": "收款資料登記錯誤，從哪裡修正？",
    "summary": "可從原交易修正備註、付款方式或歸屬店長；這些操作不會直接改變交易金額。",
    "path": "營運 → 營運明細 → 原交易 → ⋯",
    "steps": [
      "找到原交易，核對顧客、金額與交易狀態，點「⋯」開啟明細。",
      "依錯誤欄位修改備註，或使用「更正付款方式」「更正歸屬店長」。",
      "更正付款方式或歸屬店長時填寫原因，儲存後重新核對交易。"
    ],
    "important": "金額登錯、重複登記或實際退款，不能只用更正付款方式處理。",
    "success": "原交易資料或對應修正紀錄能查到。",
    "keywords": "更正 付款方式 作廢",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "transaction.void",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/transactions/_components/TransactionDrawer.tsx",
      "src/server/actions/transaction.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "可從原交易修正備註、付款方式或歸屬店長；這些操作不會直接改變交易金額。"
  },
  {
    "id": "E07",
    "category": "money",
    "title": "取消預約後，款項也會自動退嗎？",
    "summary": "不會。取消預約處理的是名額與預約狀態；已收款項需要另外處理退款，也不會自動匯回顧客帳戶。",
    "path": "營運 → 交易詳情",
    "steps": [
      "先查原交易是否已收款，以及預約是否已取消。",
      "若有實際收款，再依該模組的退款流程核對可退金額、剩餘權益與退款原因。",
      "另外完成實際退還款項，保留退款紀錄供雙方核對。"
    ],
    "important": "請勿把取消預約當成已退款，或因重複操作而退還兩次。",
    "success": "",
    "keywords": "退費 退款 取消",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "transaction.refund",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/revenue/page.tsx",
      "src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "explanation",
    "answer": "不會。取消預約處理的是名額與預約狀態；已收款項需要另外處理退款，也不會自動匯回顧客帳戶。"
  },
  {
    "id": "E08",
    "category": "money",
    "title": "要登記收入或支出，從哪裡操作？",
    "summary": "三個模組共用同一組記帳欄位；收入可選關聯顧客與消費項目，支出則填分類。",
    "path": "營運 → 現金抽屜 → 記一筆收支",
    "steps": [
      "開啟現金抽屜，點「記一筆收支」；需要補登其他日期時，先選正確日期。",
      "選收入或支出並填金額；收入可搜尋並選擇關聯顧客，再填消費項目，支出則填分類。",
      "選實際付款方式、填必要備註後儲存，再於明細及顧客消費紀錄核對。"
    ],
    "important": "非現金收支與抽屜現金不同，付款方式要如實填寫；只輸入顧客姓名但未選候選，不會建立關聯。",
    "success": "收支明細出現正確紀錄。",
    "keywords": "支出 收入 記帳 操作視窗 現金抽屜 關聯顧客 消費項目 零售分類 補登日期",
    "details": [
      "收入的消費項目以「零售-」開頭會納入零售分析；其餘手動收入列入其他收入。",
      "已結帳日期補登現金異動須依提示確認；補紀錄不會重算原本的關帳快照。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "cashbook.create",
    "feature": "cashbook",
    "sources": [
      "src/app/(dashboard)/dashboard/revenue/page.tsx",
      "src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace.tsx",
      "src/app/(dashboard)/dashboard/cashbook/_components/cashbook-entry-fields.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "三個模組共用同一組記帳欄位；收入可選關聯顧客與消費項目，支出則填分類。"
  },
  {
    "id": "E09",
    "category": "money",
    "title": "開店與閉店怎麼核對現金？",
    "summary": "開店與閉店都要填實際點到的現金；若有差額，記錄原因後再確認。",
    "path": "營運 → 現金抽屜 → 今日現金狀態",
    "steps": [
      "開店時輸入實際點到金額；若與帳面不同，填寫原因。",
      "營業中登錄收支、提領與補入現金。",
      "在今日現金狀態點「閉店點錢」，核對系統應有與實際金額，再完成閉店。"
    ],
    "important": "閉店後當日現金異動會鎖定，先完成登錄再閉店。",
    "success": "閉店實點、差額與下次開店起點均可查。",
    "keywords": "點錢 開店 閉店 對帳",
    "details": [],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "cashDrawer.read",
    "feature": "cash_drawer",
    "sources": [
      "src/app/(dashboard)/dashboard/revenue/page.tsx",
      "src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "開店與閉店都要填實際點到的現金；若有差額，記錄原因後再確認。"
  },
  {
    "id": "E10",
    "category": "money",
    "title": "提領現金、補入現金和支出有何不同？",
    "summary": "提領與補入記錄現金移動；店內費用則記為支出。提領現金本身不代表發生費用。",
    "path": "現金抽屜 → 日常操作 → 記一筆收支／提領現金／補入現金",
    "steps": [
      "店內費用使用「記一筆收支」登記支出。",
      "把現金從抽屜拿走使用「提領」。",
      "放入找零金或備用金使用「補入現金」，核對紀錄。"
    ],
    "important": "提領不算店內支出，補入也不等於服務營收。",
    "success": "",
    "keywords": "備用金 找零 提領 補入",
    "details": [],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "cashDrawer.entry",
    "feature": "cash_drawer",
    "sources": [
      "src/app/(dashboard)/dashboard/revenue/page.tsx",
      "src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "explanation",
    "answer": "提領與補入記錄現金移動；店內費用則記為支出。提領現金本身不代表發生費用。"
  },
  {
    "id": "E11",
    "category": "money",
    "title": "閉店金額填錯，可以重做嗎？",
    "summary": "店長或管理員可在下一個營業日尚未開店前撤銷閉店，再重新核對；已接續開店時不能直接撤銷。",
    "path": "現金抽屜 → 已完成今日結帳 → 撤銷閉店",
    "steps": [
      "確認錯誤營業日，並確認下一個營業日尚未開店。",
      "由店長或管理員開啟該筆閉店紀錄，選「撤銷閉店」並填寫原因。",
      "撤銷後重新核對實際現金與差額，再完成閉店。"
    ],
    "important": "下一個營業日已開店時不能直接撤銷；原閉店及撤銷紀錄會保留。",
    "success": "新的閉店實點與差額正確，保留原因。",
    "keywords": "撤銷閉店 差額 填錯",
    "details": [],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "cashDrawer.close",
    "feature": "cash_drawer",
    "sources": [
      "src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "店長或管理員可在下一個營業日尚未開店前撤銷閉店，再重新核對；已接續開店時不能直接撤銷。"
  },
  {
    "id": "F01",
    "category": "care",
    "title": "顧客提醒與店長通知在哪裡分開設定？",
    "summary": "顧客提醒與店長通知分開設定，修改其中一邊不代表另一邊也已開啟。",
    "path": "設定 → 提醒管理",
    "steps": [
      "切到「顧客提醒」設定傳給顧客的訊息。",
      "切到「店長通知」設定店務通知與收件人。",
      "修改後儲存，再確認開關與收件對象。"
    ],
    "important": "顧客與店長是不同收件對象；開啟前先核對，避免傳錯人。",
    "success": "各分頁的設定符合預期。",
    "keywords": "LINE 通知 開關 提醒",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "business_hours.manage",
    "feature": "line_reminder",
    "sources": [
      "src/app/(dashboard)/dashboard/reminders/page.tsx",
      "src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "顧客提醒與店長通知分開設定，修改其中一邊不代表另一邊也已開啟。"
  },
  {
    "id": "F03",
    "category": "care",
    "title": "當日臨時預約，要怎麼通知店長？",
    "summary": "當日預約的店長通知需開啟對應設定，並確認收件店長已完成 LINE 綁定。",
    "path": "提醒管理 → 店長通知",
    "steps": [
      "找到當日預約相關通知設定。",
      "核對通知開關與要接收通知的人員。",
      "儲存後查看設定，後續由發送紀錄核對結果。"
    ],
    "important": "接收人需完成相應 LINE 綁定；不要把測試訊息發給正式顧客。",
    "success": "開關與收件人正確，能追查通知結果。",
    "keywords": "當天 臨時預約 店長通知",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "business_hours.manage",
    "feature": "line_reminder",
    "sources": [
      "src/app/(dashboard)/dashboard/reminders/page.tsx",
      "src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "當日預約的店長通知需開啟對應設定，並確認收件店長已完成 LINE 綁定。"
  },
  {
    "id": "F04",
    "category": "care",
    "title": "LINE 沒收到通知，先檢查什麼？",
    "summary": "先找發送紀錄：沒有紀錄時查是否符合觸發條件；有失敗紀錄時依錯誤原因處理。",
    "path": "提醒管理 → 發送紀錄",
    "steps": [
      "用發送紀錄確認該訊息是成功、失敗還是尚未發送。",
      "核對通知規則是否啟用、發送時間與收件身分。",
      "若失敗，保留原因，檢查綁定與官方帳號狀態後處理。"
    ],
    "important": "沒有紀錄與發送失敗不是同一件事；不要直接重複發送。",
    "success": "",
    "keywords": "收不到 漏發 失敗 紀錄 體驗預約 通知尚未完成 LINE 通知已連結",
    "details": [
      "公開體驗完成頁的「體驗預約成功」與 LINE 通知狀態是兩件事。若預約已成功但通知尚未完成，不要重複預約；先依 F12 核對完成頁顯示的狀態。",
      "加入官方 LINE、送出電話或開啟設定連結都不等於通知已成功。以完成頁的「LINE 通知已連結」、LINE 回覆「通知設定完成」及後續發送紀錄分別核對。",
      "若 LINE 對話當時正在回答數位管家問題，電話格式正確但選單不接受輸入時，系統會改回報綁定結果；不要因原選單錯誤就反覆送出電話。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "business_hours.manage",
    "feature": "line_reminder",
    "sources": [
      "src/app/(dashboard)/dashboard/reminders/page.tsx",
      "src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx",
      "src/app/api/line/webhook/route.ts",
      "src/app/pricing/experience/zhubei/book/zhubei-trial-booking-form.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "先找發送紀錄：沒有紀錄時查是否符合觸發條件；有失敗紀錄時依錯誤原因處理。"
  },
  {
    "id": "F06",
    "category": "care",
    "title": "如何啟用體驗後自動關懷？",
    "summary": "啟用並儲存後，符合條件的新完成體驗才會進入關懷流程；不會補發所有歷史體驗。",
    "path": "提醒管理 → 顧客提醒 → 體驗客後續關懷",
    "steps": [
      "打開整組關懷，檢查每一階段的開關。",
      "設定體驗後天數、傳送時間與訊息內容，閱讀卡片預覽。",
      "確認文案並啟用，再查看已儲存狀態。"
    ],
    "important": "只處理啟用後新完成的體驗，不補發歷史體驗。",
    "success": "畫面顯示整組已啟用與設定已儲存。",
    "keywords": "隔日 四天 自動 回訪 體驗 關懷",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "business_hours.manage",
    "feature": "line_reminder",
    "sources": [
      "src/app/(dashboard)/dashboard/reminders/page.tsx",
      "src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "啟用並儲存後，符合條件的新完成體驗才會進入關懷流程；不會補發所有歷史體驗。"
  },
  {
    "id": "F07",
    "category": "care",
    "title": "關懷文案與時間可以自己調整嗎？",
    "summary": "每階段可調整天數、時間與文案，階段之間至少相隔 3 天；預覽不會實際發送訊息。",
    "path": "體驗客後續關懷 → 展開階段",
    "steps": [
      "展開要調整的階段，修改天數與時間。",
      "輸入文案，可插入顧客姓名與店名，檢查預覽。",
      "點「儲存設定」，確認未儲存提示消失。"
    ],
    "important": "各階段至少間隔三天；卡片預覽不會實際發送訊息。",
    "success": "顯示設定已儲存，重新查看仍為新內容。",
    "keywords": "修改文案 姓名 時間 模板",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "business_hours.manage",
    "feature": "line_reminder",
    "sources": [
      "src/app/(dashboard)/dashboard/reminders/page.tsx",
      "src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "每階段可調整天數、時間與文案，階段之間至少相隔 3 天；預覽不會實際發送訊息。"
  },
  {
    "id": "F08",
    "category": "care",
    "title": "顧客已購買或預約，還會收到體驗邀請嗎？",
    "summary": "已購買或已有預約會略過後續邀請；蒸足套票申請待核帳也會略過，但不代表已付款。第一階段關心不受這些條件影響。",
    "path": "體驗客後續關懷 → 發送規則與避免打擾",
    "steps": [
      "查看該顧客的購買及預約紀錄，確認是否已完成購買或已有預約。",
      "在體驗關懷發送紀錄確認是哪一階段，以及是否被略過。"
    ],
    "important": "第一階段關心與後續邀請的條件不同；關閉整組關懷、單一階段或停止個別顧客也會影響發送。",
    "success": "",
    "keywords": "買課 預約 停止 打擾 待核帳 待確認付款 購買申請",
    "details": [
      "後續邀請階段會檢查購買與預約條件。第一階段仍依其他啟用、時間及停止關懷條件判斷。",
      "蒸足顧客已有本店套票購買申請、仍待核帳時，也會略過後續邀請；這不代表已付款或已開通堂數。",
      "已略過的階段不補發。訂單取消後，尚未到發送時間的階段仍依當時狀態判斷；SPA 使用自己的購買與預約紀錄，不套用蒸足待核帳訂單規則。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "business_hours.manage",
    "feature": "line_reminder",
    "sources": [
      "src/lib/trial-care.ts",
      "src/server/services/trial-care.ts",
      "src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "explanation",
    "answer": "已購買或已有預約會略過後續邀請；蒸足套票申請待核帳也會略過，但不代表已付款。第一階段關心不受這些條件影響。"
  },
  {
    "id": "F09",
    "category": "care",
    "title": "顧客退訂關懷，預約提醒會一起停嗎？",
    "summary": "不會一起停。停止體驗關懷只影響該流程，預約提醒仍依自己的設定處理。",
    "path": "體驗關懷卡片／最近關懷紀錄",
    "steps": [
      "先確認停止的是體驗關懷這類訊息。",
      "核對該顧客關懷狀態。",
      "預約提醒仍到顧客提醒的對應設定核對。"
    ],
    "important": "停止體驗關懷不影響預約通知，不代表封鎖所有 LINE 訊息。",
    "success": "",
    "keywords": "退訂 不再接收 停止",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "business_hours.manage",
    "feature": "line_reminder",
    "sources": [
      "src/app/(dashboard)/dashboard/reminders/page.tsx",
      "src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "explanation",
    "answer": "不會一起停。停止體驗關懷只影響該流程，預約提醒仍依自己的設定處理。"
  },
  {
    "id": "F10",
    "category": "customers",
    "title": "如何找到久未到店或需要續約關心的顧客？",
    "summary": "顧客經營會整理久未到店、建議回店與建議續約名單，讓店家找出需要關心的人。",
    "path": "顧客經營",
    "steps": [
      "打開顧客經營，選「好久不見」「建議安排回店」或「建議續約」。",
      "查看名單，再打開顧客資料核對近期紀錄。",
      "依實際狀況聯絡並記錄追蹤情形。"
    ],
    "important": "名單是經營參考，不代表已自動完成聯絡。",
    "success": "",
    "keywords": "留存 久未到店 續約 回訪",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "customer.read",
    "feature": "customer_care",
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "顧客經營會整理久未到店、建議回店與建議續約名單，讓店家找出需要關心的人。"
  },
  {
    "id": "G01",
    "category": "staff",
    "title": "新增服務人員時，要準備什麼？",
    "summary": "新增帳號前，準備人員姓名、手機與初始密碼，再依工作需求設定角色與權限。",
    "path": "人員管理 → 新增人員",
    "steps": [
      "點「＋ 新增人員」，填寫真實姓名、顯示名稱、手機與初始密碼。",
      "核對輸入內容後建立人員，再確認人員列表與角色。",
      "依工作需要另行確認權限，請本人登入確認。"
    ],
    "important": "建立人員與設定可操作權限不同，須另外核對授權範圍。",
    "success": "人員列表能看到正確資料與角色。",
    "keywords": "新增員工 教練 芳療師 帳號",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "staff.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/staff/staff-workspace.tsx",
      "src/lib/permissions.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "新增帳號前，準備人員姓名、手機與初始密碼，再依工作需求設定角色與權限。"
  },
  {
    "id": "G03",
    "category": "staff",
    "title": "員工看不到某個功能，是系統壞了嗎？",
    "summary": "功能是否出現會受角色權限、門市模組與方案開通狀態影響，先依序核對這三項。",
    "path": "人員管理／設定",
    "steps": [
      "確認登入者身分及目前門市。",
      "核對該功能的員工權限與門市開通狀態。",
      "請有管理權限的人員調整；未開通功能需先確認方案。"
    ],
    "important": "有選單不代表有修改權限；操作指南不會代替權限授權。",
    "success": "",
    "keywords": "沒有按鈕 權限 看不到",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "staff.view",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/staff/staff-workspace.tsx",
      "src/lib/permissions.ts"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "功能是否出現會受角色權限、門市模組與方案開通狀態影響，先依序核對這三項。"
  },
  {
    "id": "G04",
    "category": "staff",
    "title": "員工忘記密碼或離職，怎麼處理？",
    "summary": "忘記密碼可重設；離職則停用帳號，保留既有服務及交易紀錄。",
    "path": "人員管理 → 人員基本資料",
    "steps": [
      "選正確人員，核對手機與角色。",
      "忘記密碼時，由可操作的人員使用重設密碼；離職則使用停用。",
      "核對成功提示與帳號狀態，再通知本人或管理者。"
    ],
    "important": "不刪除歷史紀錄來處理離職；不同角色可管理的人員範圍不同。",
    "success": "人員狀態或密碼重設結果可確認。",
    "keywords": "忘記密碼 停用 離職",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "staff.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/staff/staff-workspace.tsx",
      "src/lib/permissions.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "忘記密碼可重設；離職則停用帳號，保留既有服務及交易紀錄。"
  },
  {
    "id": "H01",
    "category": "analysis",
    "title": "怎麼查看本月或其他期間的營收？",
    "summary": "先用日期篩選看摘要，再分開核對營業額、收入結構、退款、支出與固定近六個月趨勢。",
    "path": "分析 → 營運分析",
    "steps": [
      "選擇今日、本月或自訂期間，先確認目前門市。",
      "查看儲值方案、零售、其他收入、待收款、退款、已記錄支出及收支結餘；點明細連結追查。",
      "下方近六個月趨勢可切換營業額、收支結餘、各收入與支出；需要核對摘要時使用上方相同日期範圍。"
    ],
    "important": "營業額是退款後、支出前；收支結餘再扣已記錄支出，仍不是含商品成本與應付帳款的會計淨利。",
    "success": "",
    "keywords": "月報 營收 報表 營業額 營收結構 儲值方案 零售 其他收入 退款 支出 收支結餘 近六個月",
    "details": [
      "營收結構摘要依上方日期篩選；近六個月圖固定從本月往前六個月，本月只統計至今天，不跟著摘要區間縮短。",
      "零售依手動現金帳的「零售-」分類辨識；提款不算支出，待確認收款不算已收營業額。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "report.read",
    "feature": "basic_reports",
    "sources": [
      "src/app/(dashboard)/dashboard/reports/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "先用日期篩選看摘要，再分開核對營業額、收入結構、退款、支出與固定近六個月趨勢。"
  },
  {
    "id": "H03",
    "category": "analysis",
    "title": "體驗、到場與買方案，要怎麼看？",
    "summary": "體驗來源以專屬預約連結記錄，預約、到店與方案指派是不同階段，應分開查看。",
    "path": "分析 → 營運分析",
    "steps": [
      "選期間後查看 LINE、Messenger、Google 地圖、Instagram 與其他／未記錄的預約組數及占比。",
      "分開核對預約人數、完成服務、到店率、已指派方案及方案轉換率；點來源可查看預約明細。",
      "回原預約核對來源、狀態與顧客，再以交易或方案紀錄確認後續結果。"
    ],
    "important": "來源來自入口連結，不是登入方式；指派方案不等於已確認收款，不能把方案轉換率當成收款率。",
    "success": "",
    "keywords": "開卡率 體驗率 轉換 新生 人數 組數 體驗來源 LINE Messenger Google 地圖 Instagram 來源占比 到店率",
    "details": [
      "來源占比以預約組數計算；到店率以完成服務人次除以預約人數。取消與未到保留在預約分母，但不列入到店。",
      "無來源參數與歷史舊資料歸入其他／未記錄；轉傳入口連結會沿用原連結標籤。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "report.read",
    "feature": "basic_reports",
    "sources": [
      "src/app/(dashboard)/dashboard/reports/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "體驗來源以專屬預約連結記錄，預約、到店與方案指派是不同階段，應分開查看。"
  },
  {
    "id": "H09",
    "category": "analysis",
    "title": "報表跟預約清單數字不同，怎麼核對？",
    "summary": "先對齊門市、日期、狀態及統計單位；預約筆數、服務人次與不重複顧客數本來就可能不同。",
    "path": "分析／營運／預約管理",
    "steps": [
      "先把門市、期間與篩選調成一致。",
      "確認比較的是人次、筆數、收款還是服務完成。",
      "找差異顧客，核對取消、未到、退款及付款狀態。"
    ],
    "important": "不要為了讓報表相同就修改原始交易；先查統計口徑。",
    "success": "",
    "keywords": "對不上 數字 差異 分析",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "report.read",
    "feature": "basic_reports",
    "sources": [
      "src/app/(dashboard)/dashboard/reports/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "先對齊門市、日期、狀態及統計單位；預約筆數、服務人次與不重複顧客數本來就可能不同。"
  },
  {
    "id": "I02",
    "category": "settings",
    "title": "店家匯款帳號與 LINE 連結在哪設定？",
    "summary": "銀行收款資料與店家 LINE 連結在付款設定管理，儲存前逐項核對內容。",
    "path": "設定 → 付款設定",
    "steps": [
      "進入付款設定，核對銀行名稱、代碼與帳號。",
      "確認官方 LINE 連結屬於本店，儲存修改。",
      "到本店對應購買頁確認顯示內容。"
    ],
    "important": "修改會影響顧客看到的付款資訊，請逐碼核對。",
    "success": "顧客端呈現正確的本店付款資訊。",
    "keywords": "銀行 帳號 匯款 轉帳",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "plans.edit",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/settings/page.tsx",
      "src/components/store-view-mode-switcher.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "銀行收款資料與店家 LINE 連結在付款設定管理，儲存前逐項核對內容。"
  },
  {
    "id": "I03",
    "category": "settings",
    "title": "體驗價格或可調整範圍在哪裡改？",
    "summary": "體驗價格及可調整範圍由體驗課設定控制，是否可修改也取決於帳號權限。",
    "path": "設定 → 體驗課設定",
    "steps": [
      "確認體驗單功能狀態。",
      "修改預設體驗價與是否允許調整價格。",
      "核對可調整範圍，儲存後重新查看。"
    ],
    "important": "更改預設值不代表既有交易會重新計價。",
    "success": "設定頁顯示新的體驗價與範圍。",
    "keywords": "體驗價 價格",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "trial.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/settings/page.tsx",
      "src/components/store-view-mode-switcher.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "體驗價格及可調整範圍由體驗課設定控制，是否可修改也取決於帳號權限。"
  },
  {
    "id": "I05",
    "category": "settings",
    "title": "切換分店後，為什麼只能查看？",
    "summary": "切換分店是查看模式，供你閱讀該店資料；修改、收款與完成服務仍由該店有權限的帳號操作。",
    "path": "左側門市切換 → 查看分店",
    "steps": [
      "核對頂欄目前正在查看的門市。",
      "要操作自己的店時，從門市選單切回「我的店」；分店資料需由該店有權限的帳號處理。"
    ],
    "important": "",
    "success": "",
    "keywords": "串接 多店 分店 查看 唯讀",
    "details": [
      "查看分店不會取得該店的修改權限；教學入口也不會改變這項限制。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "",
    "feature": "multi_store",
    "sources": [
      "src/components/store-view-mode-switcher.tsx",
      "src/server/actions/store-view-mode.ts",
      "src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "explanation",
    "answer": "切換分店是查看模式，供你閱讀該店資料；修改、收款與完成服務仍由該店有權限的帳號操作。"
  },
  {
    "id": "I09",
    "category": "settings",
    "title": "目前用什麼方案？為什麼有些功能沒開？",
    "summary": "成長方案中心顯示目前方案與開通功能；方案有包含的功能，仍可能需要相應員工權限才能使用。",
    "path": "設定 → 成長方案中心",
    "steps": [
      "先確認目前門市與方案名稱。",
      "查看已開通功能與對應方案資訊。",
      "若功能與預期不同，提供店名與功能名稱請管理者核對。"
    ],
    "important": "員工權限與門市功能開通是兩個條件，都符合才可操作。",
    "success": "",
    "keywords": "加購 方案 展店版 專業版 功能",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/settings/page.tsx",
      "src/components/store-view-mode-switcher.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "explanation",
    "answer": "成長方案中心顯示目前方案與開通功能；方案有包含的功能，仍可能需要相應員工權限才能使用。"
  },
  {
    "id": "M01",
    "category": "health",
    "title": "如何查看顧客最近量測與歷史曲線？",
    "summary": "顧客健康紀錄可查看最近量測與歷史曲線，先確認正在查看的是本人資料。",
    "path": "顧客管理 → 顧客資料 → 健康紀錄",
    "steps": [
      "找到正確顧客並進入健康紀錄。",
      "查看最近量測、完整數據與歷史曲線。",
      "需要查全店時，點「本店健康總覽」再依條件篩選。"
    ],
    "important": "健康紀錄的可見範圍受門市開通與身分驗證影響。",
    "success": "",
    "keywords": "體重 體脂 健康 曲線 最近健康變化 較上次 量測日期 尚無量測紀錄",
    "details": [
      "顧客使用 LINE 會員首頁時，已開通健康功能的門市可由「最近健康變化」或底部「健康」進入；這是顧客自己的紀錄入口，不是店家後台的健康總覽。",
      "首頁若顯示「較上次」差值，旁邊會列出前後兩次量測日期（台灣時間）；請連同日期、項目與單位核對，不把單一差值當作健康改善或惡化的結論。",
      "沒有可比較的變化時，首頁可能顯示「查看最近量測紀錄」或「尚無量測紀錄」。這不等於歷史資料被刪除，應進入紀錄頁再查；返回 LINE 會員首頁可用底部「首頁」。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "customer.read",
    "feature": "ai_health_summary",
    "sources": [
      "src/app/(dashboard)/dashboard/health/page.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/health/page.tsx",
      "src/app/(liff)/liff/liff-shell.tsx",
      "src/app/(liff)/liff/layout.tsx",
      "src/app/(liff)/liff/liff-bottom-nav.tsx",
      "src/app/(liff)/liff/health/health-view.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "顧客健康紀錄可查看最近量測與歷史曲線，先確認正在查看的是本人資料。"
  },
  {
    "id": "M02",
    "category": "health",
    "title": "怎麼找某段期間或特定項目的量測？",
    "summary": "健康總覽可用日期、顧客與量測項目縮小範圍，再進入個別紀錄查看。",
    "path": "本店健康總覽",
    "steps": [
      "用顧客、日期與量測項目篩選。",
      "查看列表中的日期、顧客及數值。",
      "點顧客進入完整健康紀錄；要重查可清除篩選。"
    ],
    "important": "先確認單位與日期，避免把不同指標當成同一數據比較。",
    "success": "",
    "keywords": "體重 BMI 體脂 篩選 歷史",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "customer.read",
    "feature": "ai_health_summary",
    "sources": [
      "src/app/(dashboard)/dashboard/health/page.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/health/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "健康總覽可用日期、顧客與量測項目縮小範圍，再進入個別紀錄查看。"
  },
  {
    "id": "M03",
    "category": "health",
    "title": "健康歷史不見了，要先查什麼？",
    "summary": "先檢查身分、門市與日期篩選；沒有查到紀錄時，不要先假設資料已刪除。",
    "path": "顧客資料 → 健康紀錄",
    "steps": [
      "確認門市、姓名、電話與登入身分是否一致。",
      "清除日期篩選，確認是否仍有最近量測。",
      "提供最後看見紀錄的日期及目前畫面請支援核對。"
    ],
    "important": "不要重複建會員或以猜測數字補登；跨店歷史僅在符合驗證與權限時可見。",
    "success": "",
    "keywords": "遺失 不見 舊紀錄 同步",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "customer.read",
    "feature": "ai_health_summary",
    "sources": [
      "src/app/(dashboard)/dashboard/health/page.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/health/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "先檢查身分、門市與日期篩選；沒有查到紀錄時，不要先假設資料已刪除。"
  },
  {
    "id": "N01",
    "category": "digital",
    "title": "數位管家草稿怎麼修改與發布？",
    "summary": "先修改草稿並預覽，再發布；只儲存草稿不會更換顧客正在使用的流程。",
    "path": "設定 → 數位管家流程",
    "steps": [
      "選流程並編輯內容。",
      "先儲存草稿，核對目前正式版與要發布的內容。",
      "確認後再發布，核對正式版狀態。"
    ],
    "important": "儲存草稿不會影響已發布版本；發布才會影響顧客互動流程。",
    "success": "草稿與正式版狀態能清楚區分。",
    "keywords": "LINE 自動回覆 流程 草稿 發布",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "plans.edit",
    "feature": "digital_butler",
    "sources": [
      "src/app/(dashboard)/dashboard/settings/digital-butler/flow-editor.tsx",
      "src/app/(dashboard)/dashboard/digital-butler/leads/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "先修改草稿並預覽，再發布；只儲存草稿不會更換顧客正在使用的流程。"
  },
  {
    "id": "N02",
    "category": "digital",
    "title": "顧客留言轉真人後，在哪裡追蹤？",
    "summary": "轉真人的需求會列在數位管家名單，可指派負責人與更新狀態；更新狀態不代表已回覆顧客。",
    "path": "數位管家名單",
    "steps": [
      "查看顧客需求與目前處理狀態。",
      "開啟名單核對顧客，指派負責人並更新進度。",
      "處理後回查狀態，避免不同人重複跟進。"
    ],
    "important": "名單狀態不代表已完成實際對話，仍需確認聯絡結果。",
    "success": "",
    "keywords": "轉真人 名單 需求 跟進",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "customer.read",
    "feature": "digital_butler",
    "sources": [
      "src/app/(dashboard)/dashboard/settings/digital-butler/flow-editor.tsx",
      "src/app/(dashboard)/dashboard/digital-butler/leads/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "轉真人的需求會列在數位管家名單，可指派負責人與更新狀態；更新狀態不代表已回覆顧客。"
  },
  {
    "id": "J01",
    "category": "spa",
    "title": "服務名稱、價格與時間在哪裡設定？",
    "summary": "療程的售價、服務時間與整理時間在方案管理設定；排程會把整理時間一起納入占用。",
    "path": "方案管理 → 療程 → 設定",
    "steps": [
      "選療程，修改名稱、規格、售價與服務時間。",
      "設定整理時間及需要的專業項目。",
      "確認是否開放顧客自行預約，再儲存。"
    ],
    "important": "整理時間不顯示給顧客，但會占用排程；儲值金與堂數權益另行管理。",
    "success": "療程列表顯示正確售價、顧客時間與實際占用。",
    "keywords": "療程 服務 整理時間 價格",
    "details": [],
    "modules": [
      "spa"
    ],
    "permission": "plans.edit",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/spa-schedule/workspace.tsx",
      "src/app/(dashboard)/dashboard/spa-resources/workspace.tsx",
      "src/app/(dashboard)/dashboard/plans/_components/treatment-workspace.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "療程的售價、服務時間與整理時間在方案管理設定；排程會把整理時間一起納入占用。"
  },
  {
    "id": "J03",
    "category": "spa",
    "title": "美容床、美甲桌或服務位置怎麼新增？",
    "summary": "服務位置用來管理美容床或美甲桌等資源，新增後要設定可提供的療程。",
    "path": "服務位置 → 新增位置",
    "steps": [
      "輸入可辨識的位置名稱。",
      "設定啟用狀態與適用療程。",
      "儲存後回查位置列表及適用療程。"
    ],
    "important": "停用後不再提供新預約選用，既有預約仍保留。",
    "success": "服務位置與適用療程正確列出。",
    "keywords": "床位 房間 美甲桌 位置",
    "details": [],
    "modules": [
      "spa"
    ],
    "permission": "business_hours.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/spa-schedule/workspace.tsx",
      "src/app/(dashboard)/dashboard/spa-resources/workspace.tsx",
      "src/app/(dashboard)/dashboard/plans/_components/treatment-workspace.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "服務位置用來管理美容床或美甲桌等資源，新增後要設定可提供的療程。"
  },
  {
    "id": "J04",
    "category": "spa",
    "title": "怎麼看芳療師當日排程與空檔？",
    "summary": "排程按人員顯示預約與空檔；15／30 分鐘是畫面刻度，不是療程固定長度。",
    "path": "預約排程",
    "steps": [
      "選排程日期，依需要切換 15 或 30 分鐘間隔。",
      "查看服務人員的預約與空白時段。",
      "點預約看摘要；新增前先核對服務與可承接人員。"
    ],
    "important": "時間顯示間隔與療程實際占用時間不同。",
    "success": "",
    "keywords": "芳療師 時刻表 排程 空檔",
    "details": [],
    "modules": [
      "spa"
    ],
    "permission": "booking.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/spa-schedule/workspace.tsx",
      "src/app/(dashboard)/dashboard/spa-resources/workspace.tsx",
      "src/app/(dashboard)/dashboard/plans/_components/treatment-workspace.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "explanation",
    "answer": "排程按人員顯示預約與空檔；15／30 分鐘是畫面刻度，不是療程固定長度。"
  },
  {
    "id": "J07",
    "category": "spa",
    "title": "多人同行選不同服務，怎麼安排？",
    "summary": "多人同行可以逐位安排不同服務；整組有衝突時不會只建立其中一部分。",
    "path": "預約排程 → 新增預約",
    "steps": [
      "選顧客與時間，逐位設定需要的服務。",
      "分別核對服務人員、位置與整組摘要。",
      "整組送出；若有衝突，保留內容調整後再試。"
    ],
    "important": "整組有衝突時不會建立半套預約，不要另補一筆造成重複。",
    "success": "整組每位顧客的服務與排程均正確。",
    "keywords": "多人 同行 不同服務 整組",
    "details": [],
    "modules": [
      "spa"
    ],
    "permission": "booking.create",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/spa-schedule/workspace.tsx",
      "src/app/(dashboard)/dashboard/spa-resources/workspace.tsx",
      "src/app/(dashboard)/dashboard/plans/_components/treatment-workspace.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "多人同行可以逐位安排不同服務；整組有衝突時不會只建立其中一部分。"
  },
  {
    "id": "J08",
    "category": "spa",
    "title": "人員或服務位置衝突時怎麼處理？",
    "summary": "系統會檢查人員、位置及整段服務占用時間，空白格不一定足夠容納服務與整理時間。",
    "path": "預約排程 → 預約面板",
    "steps": [
      "讀取衝突提示，確認是人員還是服務位置。",
      "核對服務與整理時間所占用的完整區間。",
      "改用可用的人員、位置或時段後，重新核對摘要再送出。"
    ],
    "important": "空白格不一定足以容納整段服務時間，不應忽略衝突提示。",
    "success": "",
    "keywords": "撞期 衝突 床位 重疊",
    "details": [],
    "modules": [
      "spa"
    ],
    "permission": "booking.create",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/spa-schedule/workspace.tsx",
      "src/app/(dashboard)/dashboard/spa-resources/workspace.tsx",
      "src/app/(dashboard)/dashboard/plans/_components/treatment-workspace.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "系統會檢查人員、位置及整段服務占用時間，空白格不一定足夠容納服務與整理時間。"
  },
  {
    "id": "J09",
    "category": "spa",
    "title": "服務人員請假，怎麼調整？",
    "summary": "在人員的日期班表調整當天班別，整天請假可選「整天休息」；變更必須先避開既有預約。",
    "path": "人員管理 → 選擇排班人員 → 日期排班",
    "steps": [
      "選擇排班人員，點開要調整的日期。",
      "部分時段休息時修改或移除班別；整天請假則點「整天休息」。",
      "核對日期與班別後點「套用至 1 天」。若提示班別未涵蓋既有預約，先安排那些預約再重新儲存。"
    ],
    "important": "班表調整不會自動取消既有預約。發生衝突時整批不會儲存。",
    "success": "日期班表顯示新的班別或休息，重新開啟該日仍可看到儲存結果。",
    "keywords": "請假 代班 換班 臨時加班",
    "details": [
      "一天可設定多段班別，中間空檔不接受預約。",
      "多選日期會把相同班別套用到所選日期，取代各日原班表。"
    ],
    "modules": [
      "spa"
    ],
    "permission": "duty.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/spa-staff/workspace.tsx",
      "src/server/actions/spa-resources.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "在人員的日期班表調整當天班別，整天請假可選「整天休息」；變更必須先避開既有預約。"
  },
  {
    "id": "L01",
    "category": "support",
    "title": "找不到按鈕或畫面跟教學不同怎麼辦？",
    "summary": "先核對門市模組、帳號權限與目前紀錄狀態，再比對教學；不同模組不一定有相同按鈕。",
    "path": "操作指南／目前功能頁",
    "steps": [
      "確認使用的是時段預約、SPA 服務或課程模組。",
      "核對門市、登入角色、方案及目前紀錄狀態。",
      "若仍不同，保留畫面與功能名稱請支援核對。"
    ],
    "important": "不同模組不能共用所有操作步驟；未開放功能不會因教學而取得權限。",
    "success": "",
    "keywords": "沒有按鈕 教學不同 操作問題",
    "details": [],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "",
    "feature": null,
    "sources": [
      "src/lib/permissions.ts",
      "src/lib/mvp-hidden-features.ts"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "先核對門市模組、帳號權限與目前紀錄狀態，再比對教學；不同模組不一定有相同按鈕。"
  },
  {
    "id": "L02",
    "category": "support",
    "title": "畫面一直讀取或儲存失敗怎麼辦？",
    "summary": "先保留未儲存內容，並查明剛才是否已送出成功，再決定是否重新操作。",
    "path": "目前操作頁",
    "steps": [
      "先保留未儲存文字與錯誤提示。",
      "到紀錄頁核對是否已成功，避免連續重複按送出。",
      "確認網路後重試；持續失敗時記下門市、時間及操作步驟。"
    ],
    "important": "收款、發訊息或預約請先核對結果，再決定是否重送。",
    "success": "",
    "keywords": "卡住 讀取中 失聯 儲存失敗",
    "details": [],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "",
    "feature": null,
    "sources": [
      "src/lib/permissions.ts",
      "src/lib/mvp-hidden-features.ts"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "先保留未儲存內容，並查明剛才是否已送出成功，再決定是否重新操作。"
  },
  {
    "id": "L03",
    "category": "support",
    "title": "要請客服協助，提供什麼資訊最快？",
    "summary": "提供發生在哪家店、哪個功能、操作時間及重現步驟，客服就能更快定位問題。",
    "path": "目前操作頁 → 聯繫支援",
    "steps": [
      "整理店名、發生時間、功能名稱與預期結果。",
      "附錯誤訊息及去除不必要個資的畫面。",
      "說明是否已送出、是否重試，以及紀錄目前的狀態。"
    ],
    "important": "不要提供密碼、驗證碼、完整銀行資料或不相關的顧客資訊。",
    "success": "",
    "keywords": "客服 求助 回報 錯誤",
    "details": [],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "",
    "feature": null,
    "sources": [
      "src/lib/permissions.ts",
      "src/lib/mvp-hidden-features.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "提供發生在哪家店、哪個功能、操作時間及重現步驟，客服就能更快定位問題。"
  },
  {
    "id": "D01",
    "category": "plans",
    "title": "新方案要怎麼新增或修改？",
    "summary": "先在方案管理建立方案，再從顧客資料指派；方案設定與顧客已持有的方案紀錄分開管理。",
    "path": "方案管理 → 新增方案／編輯方案",
    "steps": [
      "點「新增方案」，或打開要修改的方案。",
      "填寫名稱、類別、售價、堂數與有效期限，核對是否上架及提供顧客購買。",
      "新增時點「新增」；修改時點「儲存變更」。"
    ],
    "important": "",
    "success": "方案列表顯示儲存後的內容。",
    "keywords": "新方案要怎麼新增或修改？ 先在方案管理建立方案，再從顧客資料指派；方案設定與顧客已持有的方案紀錄分開管理。",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "plans.edit",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/plans/_components/plan-form-drawer.tsx",
      "src/server/actions/plan.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "先在方案管理建立方案，再從顧客資料指派；方案設定與顧客已持有的方案紀錄分開管理。"
  },
  {
    "id": "D05",
    "category": "plans",
    "title": "不想讓顧客購買，應下架還是關閉公開購買？",
    "summary": "「僅後台指派」仍可由店家登記；「已下架」停止新增使用，但既有顧客錢包不受影響。",
    "path": "方案管理 → 方案列表",
    "steps": [
      "只想停止顧客自行購買時，將「顧客可購買」切換為「僅後台指派」。",
      "要停止新增使用時，將「上架中」切換為「已下架」，再核對列表狀態。"
    ],
    "important": "下架也會關閉公開購買。",
    "success": "",
    "keywords": "不想讓顧客購買，應下架還是關閉公開購買？ 「僅後台指派」仍可由店家登記；「已下架」停止新增使用，但既有顧客錢包不受影響。",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "plans.edit",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/plans/plan-publish-toggle.tsx",
      "src/app/(dashboard)/dashboard/plans/plan-active-toggle.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "explanation",
    "answer": "「僅後台指派」仍可由店家登記；「已下架」停止新增使用，但既有顧客錢包不受影響。"
  },
  {
    "id": "D06",
    "category": "plans",
    "title": "紙本舊客的剩餘堂數，怎麼轉進系統？",
    "summary": "使用「紙本舊客轉入」登記原方案及已使用堂數，不會新增當期營收、現金收支或推薦獎勵。",
    "path": "顧客管理 → 顧客資料 → 紙本舊客轉入",
    "steps": [
      "核對本人及紙本紀錄，選對應方案。",
      "填入原購買金額、總堂數、已使用堂數與到期日，並記錄必要備註。",
      "檢查預覽中的剩餘堂數與期限，再點「確認送出」。"
    ],
    "important": "需由店長或管理員且具堂數調整權限的帳號操作；勿再當成新購買重複收款。",
    "success": "顧客方案顯示轉入的剩餘堂數與期限。",
    "keywords": "紙本舊客的剩餘堂數，怎麼轉進系統？ 使用「紙本舊客轉入」登記原方案及已使用堂數，不會新增當期營收、現金收支或推薦獎勵。",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "wallet.adjust",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/migrate-paper-plan-dialog.tsx",
      "src/server/actions/wallet.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "使用「紙本舊客轉入」登記原方案及已使用堂數，不會新增當期營收、現金收支或推薦獎勵。"
  },
  {
    "id": "D08",
    "category": "plans",
    "title": "已建好的方案，漏記紙本已使用堂數怎麼辦？",
    "summary": "用「補登已使用堂數」留下使用日期與原因；這項補登不會新增預約、營收或教練業績。",
    "path": "顧客管理 → 顧客資料 → 方案 → 補登已使用堂數",
    "steps": [
      "核對方案與紙本使用紀錄，點「補登已使用堂數」。",
      "輸入補登堂數、使用日期與原因，檢查剩餘堂數預覽。",
      "點「確認補登」，再查看補登提示與方案明細。"
    ],
    "important": "只能使用尚可用的堂數，不會動到預約保留堂數；日期須介於方案開始日與今天。",
    "success": "出現已補登堂數及剩餘堂數提示。",
    "keywords": "已建好的方案，漏記紙本已使用堂數怎麼辦？ 用「補登已使用堂數」留下使用日期與原因；這項補登不會新增預約、營收或教練業績。",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "wallet.adjust",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/backfill-used-sessions-form.tsx",
      "src/server/actions/wallet.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "用「補登已使用堂數」留下使用日期與原因；這項補登不會新增預約、營收或教練業績。"
  },
  {
    "id": "E03",
    "category": "money",
    "title": "方案還有剩餘堂數，怎麼登記退款？",
    "summary": "退款會保留原交易，另新增退款紀錄並處理剩餘權益；實際退還款項仍由店家完成。",
    "path": "營運 → 營運明細 → 方案購買交易 → ⋯",
    "steps": [
      "找到已成功收款的方案購買交易，核對顧客與原金額。",
      "選全額退款或退剩餘堂數，檢查試算中的已使用、已預約、可退堂數及金額。",
      "填入退款原因，確認金額後點「確認退款」，再核對退款紀錄。"
    ],
    "important": "有未完成預約保留堂數時，須先處理相關預約；已使用或補登使用的方案不能當作全未使用退款。",
    "success": "原交易仍保留，並出現對應退款紀錄。",
    "keywords": "方案還有剩餘堂數，怎麼登記退款？ 退款會保留原交易，另新增退款紀錄並處理剩餘權益；實際退還款項仍由店家完成。",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "transaction.refund",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/transactions/_components/TransactionDrawer.tsx",
      "src/server/actions/transaction.ts",
      "src/lib/refund-plan.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "退款會保留原交易，另新增退款紀錄並處理剩餘權益；實際退還款項仍由店家完成。"
  },
  {
    "id": "H04",
    "category": "analysis",
    "title": "上個月體驗、這個月買方案，算在哪個月？",
    "summary": "購買方案歸在實際購買月份；本月購買再區分本月體驗與過往體驗追蹤，不能把兩者都算成本月體驗轉換。",
    "path": "分析 → 營運分析",
    "steps": [
      "選實際購買的月份，查看本月開卡相關指標。",
      "分別核對本月體驗開卡與過往體驗追蹤開卡，再比對原交易日期。"
    ],
    "important": "",
    "success": "",
    "keywords": "上個月體驗、這個月買方案，算在哪個月？ 購買方案歸在實際購買月份；本月購買再區分本月體驗與過往體驗追蹤，不能把兩者都算成本月體驗轉換。",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "report.read",
    "feature": "basic_reports",
    "sources": [
      "src/app/(dashboard)/dashboard/reports/page.tsx",
      "src/server/queries/conversion-metrics.ts"
    ],
    "verification": "source-reviewed",
    "kind": "explanation",
    "answer": "購買方案歸在實際購買月份；本月購買再區分本月體驗與過往體驗追蹤，不能把兩者都算成本月體驗轉換。"
  },
  {
    "id": "J10",
    "category": "spa",
    "title": "多天班表一樣，能一次設定嗎？",
    "summary": "可以。多選日期會套用同一組班別；複製上一週則會連休息日一起取代本週班表。",
    "path": "人員管理 → 選擇排班人員 → 日期班表",
    "steps": [
      "選「多選日期」，勾選日期後點「設定選取日期」。",
      "設定班別或整天休息，逐項核對所選日期。",
      "點「套用至 N 天」。如果任一天與既有預約衝突，整批都不會儲存。"
    ],
    "important": "會取代所選日期的原班表。",
    "success": "重新查看各選取日期，班別與設定相符。",
    "keywords": "多天班表一樣，能一次設定嗎？ 可以。多選日期會套用同一組班別；複製上一週則會連休息日一起取代本週班表。",
    "details": [
      "要複製上一週，先點開本週日期，再選「此週套用上一週班表」。逐日核對預覽七天後，點「確認套用這七天」。"
    ],
    "modules": [
      "spa"
    ],
    "permission": "duty.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/spa-staff/workspace.tsx",
      "src/server/actions/spa-resources.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "可以。多選日期會套用同一組班別；複製上一週則會連休息日一起取代本週班表。"
  },
  {
    "id": "J11",
    "category": "spa",
    "title": "SPA 服務完成後，怎麼收款或扣方案？",
    "summary": "從預約明細進入結帳，核對服務與付款方式後才完成；使用方案或儲值金需核對本人可用權益。",
    "path": "預約排程 → 預約明細 → 完成並結帳",
    "steps": [
      "點開預約，核對顧客與實際服務，選「完成並結帳」。",
      "選付款方式；使用方案或儲值金時核對適用服務、可用次數或餘額。",
      "確認實際收款或扣款／扣次後，勾選確認欄並送出結帳。"
    ],
    "important": "整組現金、刷卡或匯款可依畫面處理；各人使用方案或儲值金需逐人結帳。",
    "success": "預約顯示完成，結帳資料與所選付款或權益相符。",
    "keywords": "SPA 服務完成後，怎麼收款或扣方案？ 從預約明細進入結帳，核對服務與付款方式後才完成；使用方案或儲值金需核對本人可用權益。",
    "details": [],
    "modules": [
      "spa"
    ],
    "permission": "booking.update",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/spa-schedule/workspace.tsx",
      "src/app/(dashboard)/dashboard/spa-schedule/checkout-panel.tsx",
      "src/server/actions/spa-checkout.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "從預約明細進入結帳，核對服務與付款方式後才完成；使用方案或儲值金需核對本人可用權益。",
    "additionalPermissions": [
      "transaction.create"
    ]
  },
  {
    "id": "H05",
    "category": "analysis",
    "title": "營運資料如何匯出 Excel？",
    "summary": "選擇資料類型、期間與狀態，下載 Excel。",
    "path": "營運 → 匯出資料",
    "steps": [
      "點「匯出資料」，選要下載的資料類型。",
      "選本月、上月或自訂期間，需要時再選狀態。",
      "核對門市與期間，點「匯出 Excel」，開啟下載檔確認範圍。"
    ],
    "important": "匯出內容不含健康評估、內部備註、LINE／Messenger ID 或憑證。",
    "success": "下載到 Excel 檔，內容符合所選類型與期間。",
    "keywords": "匯出 Excel 報表 下載 交易 預約 方案",
    "details": [
      "若有顧客匯出權限，也可選顧客資料；此時日期指顧客建立期間，不是到店或消費期間。"
    ],
    "modules": [
      "steamfoot"
    ],
    "permission": "report.export",
    "feature": "data_export",
    "sources": [
      "src/app/(dashboard)/dashboard/revenue/page.tsx",
      "src/app/(dashboard)/dashboard/data-export/page.tsx",
      "src/app/(dashboard)/dashboard/data-export/data-export-client.tsx",
      "src/lib/data-export-gate.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "資料匯出可選交易、預約或方案明細，依期間與狀態下載 Excel；需開通匯出功能及相應權限。"
  },
  {
    "id": "D10",
    "category": "plans",
    "title": "每一堂是預約中、已使用還是被註銷，在哪裡查？",
    "summary": "方案的「堂數明細」可逐堂查看狀態及日期；紙本補登顯示「已使用（補登）」，不會有對應預約。",
    "path": "顧客管理 → 顧客資料 → 方案 → 管理 → 堂數明細",
    "steps": [
      "找到正確顧客與方案，展開「管理」；唯讀畫面則展開「堂數明細」。",
      "逐堂核對「可使用」「已預約」「已使用」「已註銷」與「已使用（補登）」狀態。",
      "有疑問時比對預約日期、來店日期或註銷原因，確認原因後再決定是否更正。"
    ],
    "important": "",
    "success": "",
    "keywords": "每一堂是預約中、已使用還是被註銷，在哪裡查？ 方案的「堂數明細」可逐堂查看狀態及日期；紙本補登顯示「已使用（補登）」，不會有對應預約。",
    "details": [
      "「已預約」表示該堂已保留給預約使用，不能同時拿去另約。",
      "舊方案若尚未建立逐堂明細，畫面會提示；請保留方案資訊交由支援核對，不要重複建立方案。"
    ],
    "modules": [
      "steamfoot"
    ],
    "permission": "wallet.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/page.tsx",
      "src/components/wallet-session-detail.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "方案的「堂數明細」可逐堂查看狀態及日期；紙本補登顯示「已使用（補登）」，不會有對應預約。"
  },
  {
    "id": "D11",
    "category": "plans",
    "title": "只想作廢一堂未使用的堂數，怎麼處理？",
    "summary": "可在堂數明細註銷單一可使用堂數。註銷會立即減少剩餘堂數，不會自動產生退款。",
    "path": "顧客管理 → 顧客資料 → 方案 → 管理 → 堂數明細",
    "steps": [
      "核對方案與堂次，確認該堂狀態為「可使用」。",
      "點「註銷此堂」，填寫註銷原因。",
      "確認堂次、方案及減少堂數的影響後，點「確認註銷」。"
    ],
    "important": "註銷不可復原。已有預約保留、已使用或已註銷的堂數不能直接註銷；需要退款時請使用相應退款流程，避免先註銷後失去可退堂數。",
    "success": "出現「已註銷第 N 堂」，明細顯示註銷狀態、日期與原因。",
    "keywords": "只想作廢一堂未使用的堂數，怎麼處理？ 可在堂數明細註銷單一可使用堂數。註銷會立即減少剩餘堂數，不會自動產生退款。",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "wallet.adjust",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/void-session-button.tsx",
      "src/components/wallet-session-detail.tsx",
      "src/server/actions/wallet.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "可在堂數明細註銷單一可使用堂數。註銷會立即減少剩餘堂數，不會自動產生退款。"
  },
  {
    "id": "F11",
    "category": "care",
    "title": "關懷紀錄顯示「已略過」，需要重新發送嗎？",
    "summary": "不一定。「已略過」通常代表沒有符合發送條件；先看紀錄中的原因，不要直接重複發送。",
    "path": "提醒管理 → 顧客提醒 → 體驗客後續關懷 → 最近關懷紀錄",
    "steps": [
      "找到顧客與對應階段，核對時間、狀態與原因。",
      "若因已購買、購買申請待核帳、已預約或顧客停止接收而略過，依原因處理，不另補相同邀請。",
      "若顯示階段關閉或錯過發送時間，確認目前已儲存的設定；重新啟用不會補發歷史體驗。"
    ],
    "important": "",
    "success": "",
    "keywords": "已略過 重送 待核帳 購買申請待核帳 略過本次邀請 發送失敗",
    "details": [
      "「今日已有體驗關懷」代表當天已發過此類關懷。",
      "「購買申請待核帳，略過本次邀請」表示蒸足套票訂單尚待確認；先核對原訂單，不要另建購買或補發同一階段邀請。",
      "「發送失敗」與「已略過」不同；失敗時保留顧客、階段、時間及錯誤文字供支援核對。",
      "第一階段關心與後續邀請適用的條件不同，請一併查看「顧客已購買或預約，還會收到體驗邀請嗎？」。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "business_hours.manage",
    "feature": "line_reminder",
    "sources": [
      "src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx",
      "src/lib/trial-care.ts"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "不一定。「已略過」通常代表沒有符合發送條件；先看紀錄中的原因，不要直接重複發送。"
  },
  {
    "id": "J12",
    "category": "spa",
    "title": "顧客有 SPA 方案，為什麼結帳時不能扣次？",
    "summary": "方案必須屬於本店及該顧客、狀態有效、日期適用、可用次數足夠，且適用這筆預約的全部服務，才會列為可扣次方案。",
    "path": "預約排程 → 預約明細 → 完成並結帳",
    "steps": [
      "先核對預約顧客與門市，確認使用的是該顧客的方案。",
      "核對方案的開始日與到期日，同時涵蓋預約日和今天；再查是否已被其他預約保留次數。",
      "確認方案適用這筆預約的所有療程；不符合時，先與顧客確認其他可用付款方式。"
    ],
    "important": "多人同行使用各自方案或儲值金時，需逐人結帳，不能把其中一人的權益當成整組付款來源。",
    "success": "",
    "keywords": "顧客有 SPA 方案，為什麼結帳時不能扣次？ 方案必須屬於本店及該顧客、狀態有效、日期適用、可用次數足夠，且適用這筆預約的全部服務，才會列為可扣次方案。",
    "details": [],
    "modules": [
      "spa"
    ],
    "permission": "booking.update",
    "feature": null,
    "sources": [
      "src/server/spa-checkout-credit.ts",
      "src/app/(dashboard)/dashboard/spa-schedule/checkout-panel.tsx",
      "src/server/actions/spa-checkout.ts"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "方案必須屬於本店及該顧客、狀態有效、日期適用、可用次數足夠，且適用這筆預約的全部服務，才會列為可扣次方案。",
    "additionalPermissions": [
      "transaction.create"
    ]
  },
  {
    "id": "J13",
    "category": "spa",
    "title": "SPA 結帳顯示餘額不足或已經扣款，怎麼辦？",
    "summary": "先核對該筆預約的付款與扣款結果，再處理差額；不要為了略過錯誤另建一筆相同預約。",
    "path": "預約排程 → 預約明細 → 完成並結帳",
    "steps": [
      "保存錯誤提示，核對顧客、預約與所選方案或儲值帳戶。",
      "餘額不足或帳戶停用時，與顧客確認其他付款方式；堂數已變更時，重新開啟結帳核對可用次數。",
      "若提示已有扣款或收款紀錄，先查看原預約及帳務結果；仍不一致時，把時間與錯誤內容交給支援。"
    ],
    "important": "連線失敗不代表一定沒入帳；重新操作前先確認結果。",
    "success": "",
    "keywords": "SPA 結帳顯示餘額不足或已經扣款，怎麼辦？ 先核對該筆預約的付款與扣款結果，再處理差額；不要為了略過錯誤另建一筆相同預約。",
    "details": [],
    "modules": [
      "spa"
    ],
    "permission": "booking.update",
    "feature": null,
    "sources": [
      "src/server/spa-checkout-credit.ts",
      "src/server/actions/spa-checkout.ts",
      "src/app/(dashboard)/dashboard/spa-schedule/checkout-panel.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "先核對該筆預約的付款與扣款結果，再處理差額；不要為了略過錯誤另建一筆相同預約。",
    "additionalPermissions": [
      "transaction.create"
    ]
  },
  {
    "id": "I06",
    "category": "settings",
    "title": "分店選單為什麼沒有我想看的店？",
    "summary": "目前只有已開通多店功能的母店店長可查看所屬下層店舖；分店帳號與一般員工不會自動取得整個體系的查看權限。",
    "path": "頂欄 → 門市選單",
    "steps": [
      "核對登入帳號是否為母店店長，以及目前門市是否已開通多店功能。",
      "核對目標店是否在該母店的下層組織內，且店舖狀態允許存取。",
      "若組織歸屬有誤，提供母店與目標店名稱請支援核對；不要共用其他店家的登入帳號。"
    ],
    "important": "下層範圍包含再往下的店舖，不只直屬第一層；查看不等於可修改。",
    "success": "",
    "keywords": "分店選單為什麼沒有我想看的店？ 目前只有已開通多店功能的母店店長可查看所屬下層店舖；分店帳號與一般員工不會自動取得整個體系的查看權限。",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "",
    "feature": "multi_store",
    "sources": [
      "src/lib/store.ts",
      "src/server/actions/store-view-mode.ts",
      "src/components/store-view-mode-switcher.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "目前只有已開通多店功能的母店店長可查看所屬下層店舖；分店帳號與一般員工不會自動取得整個體系的查看權限。"
  },
  {
    "id": "D12",
    "category": "plans",
    "title": "顧客從關懷訊息購買方案，轉帳後怎麼開通？",
    "summary": "蒸足顧客可從本店方案卡送出轉帳購買申請；填寫後四碼只代表送單，需店家核對入帳後才開通堂數。",
    "answer": "蒸足顧客可從本店方案卡送出轉帳購買申請；填寫後四碼只代表送單，需店家核對入帳後才開通堂數。",
    "path": "顧客收到關懷 → 查看本店方案 → 購買此方案 → 送出購買申請",
    "steps": [
      "請顧客核對卡片上的門市、方案、金額與期限，再點「購買此方案」，依畫面登入或完成本店顧客資料。",
      "確認購買頁的銀行帳號與金額，轉帳完成後填入匯出帳號後四碼，點「送出購買申請」。",
      "成功頁顯示「待店家確認」。需要補充時可點「複製付款資訊」及「開啟本店 LINE」，自行貼上傳送給店長。",
      "店家確認實際入帳後，依「顧客說已匯款，如何確認收款？」完成核帳；顧客再回「我的方案」查看。"
    ],
    "important": "送單不等於已付款或已開通。請勿重複匯款、重複送單，或另指派同一份方案。",
    "success": "申請先顯示待店家確認；核帳成功後才顯示已確認付款並可核對方案。",
    "keywords": "線上購買 轉帳 後四碼 購買此方案 待店家確認 複製付款資訊 沒有購買按鈕",
    "details": [
      "本流程限蒸足；SPA 公開方案卡仍由顧客聯繫店長，不套用此轉帳購買教學。",
      "卡片只列本店上架且開放顧客購買的套票；店家未設定轉帳帳號時不顯示購買按鈕。無公開方案時請聯繫店長。",
      "LINE 通知依店家設定發送。複製資料或開啟 LINE 不等於已把訊息送給店長。",
      "已存在同方案待核帳申請或送出結果不明時，先提供訂單編號請店家查詢，不要直接重做。"
    ],
    "modules": ["steamfoot"],
    "permission": "customer.read",
    "feature": null,
    "sources": [
      "src/server/services/trial-care-plans.ts",
      "src/app/(liff)/liff/wallets/shop/[planId]/page.tsx",
      "src/app/(customer)/book/shop/[planId]/checkout/purchase-button.tsx",
      "src/components/purchase-receipt.tsx",
      "src/server/actions/wallet.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto"
  },
  {
    "id": "I07",
    "category": "settings",
    "title": "分店串接費怎麼算？開通額度就會扣款嗎？",
    "summary": "串接費按實際已串接的分店間數分段計算，不按可串接額度計費；設定額度不會自動扣款。",
    "answer": "串接費按實際已串接的分店間數分段計算，不按可串接額度計費；設定額度不會自動扣款。",
    "path": "設定 → 方案設定 → 展店版說明",
    "steps": [
      "先核對總部的展店版及實際串接分店數，不把「可串接幾間」當成已串接間數。",
      "首間分店免串接費，第 2～5 間每間 $500／月，第 6～15 間每間 $300／月，分段計算；16 間起另行報價。",
      "增加串接額度或超過 15 間時，聯繫平台確認費用及開通安排。各分店系統月費另計。"
    ],
    "important": "展店版的功能全含適用於購買展店版的總部店，不會自動把同樣功能開給所有分店。",
    "success": "",
    "keywords": "分店串接費 展店版 額度 已串接 自動扣款 500 300 分段計算",
    "details": [
      "例：串接 6 間，串接費為 4 × $500 ＋ 1 × $300 ＝ $2,300／月；加上目前總部展店版 $4,990，共 $7,290／月，未包含各分店系統月費。",
      "已開通可串接 10 間、實際只串接 3 間時，串接費按 3 間計算，即 $1,000／月；本頁試算不是自動扣款。"
    ],
    "modules": ["steamfoot", "spa"],
    "permission": "plans.edit",
    "feature": null,
    "sources": [
      "src/lib/alliance-subscription.ts",
      "src/app/(dashboard)/dashboard/settings/plan/page.tsx",
      "src/app/hq/dashboard/stores/organization/store-organization-manager.tsx",
      "src/components/plan-package-notes.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "explanation"
  },
  {
    "id": "C09",
    "category": "customers",
    "title": "會員首頁改版後，預約、方案與個人資料在哪裡？",
    "summary": "LINE 會員頁用底部導覽切換；「方案」頁內可直接切到消費紀錄，不必再往下找。",
    "answer": "LINE 會員頁用底部導覽切換；「方案」頁內可直接切到消費紀錄，不必再往下找。",
    "path": "顧客的 LINE 會員首頁 → 底部會員功能導覽",
    "steps": [
      "先確認正確門市與顧客已登入；本題說明 LINE 會員頁，不把其他網頁會員入口的版面視為相同。",
      "點底部「預約」查預約，「方案」查堂數與消費，「我的」看個人資料；要回會員首頁，點底部「首頁」。",
      "進入「方案」後，在頁首切換「我的方案／消費紀錄」；消費列會顯示項目、日期、付款方式、狀態及金額。",
      "在「預約」的即將到來分頁沒有預約時，可點「立即預約」進入預約流程；歷史分頁沒有紀錄時不會顯示這個按鈕。",
      "想找舊方案時，進入「方案」並展開「已過期」或「歷史方案」；找不到資料再依登入排錯教學核對。"
    ],
    "important": "導覽或「立即預約」只是入口，不表示已完成預約，也不會略過方案資格、可約時段或既有扣堂規則。",
    "success": "可由底部切換會員功能，查看正確門市的資料；本教學不要求新增預約或發送訊息。",
    "keywords": "會員首頁 底部導覽 回首頁 回會員中心 我的資料 我的方案 消費紀錄 立即預約 空預約 分享店家給好友 找不到按鈕",
    "details": [
      "「健康」僅在門市模組支援且已開通健康功能時顯示；沒有這個入口，不應直接判定帳號故障。",
      "底部導覽用於會員首頁及預約、方案、健康、我的等主要頁面。預約表單、購買內頁、加入會員與工作流程不會一律顯示相同導覽；請依該頁既有返回方式操作。",
      "主要頁面已移除重複的頁尾返回按鈕，改用底部「首頁」；SPA 網頁會員專區仍依自己的入口與返回連結操作，不套用 LINE 頁面的所有位置。",
      "消費紀錄只顯示已歸戶的方案購買及店內收入；沒有紀錄不代表系統會依備註或姓名自動推測歸戶。",
      "首頁若有「分享店家給好友」，會開啟 LINE 分享選擇；開啟選單或取消不等於成功傳送。顯示「暫時無法分享，請稍後再試」時，保留錯誤資訊，不需要重新建立會員。"
    ],
    "modules": ["steamfoot", "spa"],
    "permission": "customer.read",
    "feature": null,
    "sources": [
      "src/app/(liff)/liff/liff-bottom-nav.tsx",
      "src/app/(liff)/liff/layout.tsx",
      "src/app/(liff)/liff/liff-shell.tsx",
      "src/app/(liff)/liff/bookings/_components/ready-view.tsx",
      "src/app/(liff)/liff/bookings/bookings-list.tsx",
      "src/app/(liff)/liff/profile/profile-view.tsx",
      "src/app/(liff)/liff/liff-store-share-card.tsx",
      "src/app/(liff)/liff/wallets/wallets-list.tsx",
      "src/server/actions/liff-consumption.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto"
  },
  {
    "id": "A11",
    "category": "booking",
    "title": "怎麼搜尋本月某位顧客的預約？",
    "summary": "預約管理上方搜尋會列出目前月份的符合預約；點選結果才會開啟預約明細。",
    "answer": "輸入姓名或手機部分文字，系統會在目前月份及現有篩選條件內列出非取消預約。",
    "path": "預約管理 → 上方搜尋",
    "steps": [
      "先切到要查的月份，再輸入顧客姓名或手機的部分文字。",
      "需要時搭配教練、狀態或服務篩選；搜尋結果不含已取消預約。",
      "核對日期、時間、服務與狀態後點選正確結果，才會開啟預約明細。"
    ],
    "important": "搜尋範圍是目前月份，不是全部歷史；找不到時先切換月份或清除其他篩選。",
    "success": "搜尋結果顯示正確顧客、日期及狀態，點選後開啟同一筆預約。",
    "keywords": "搜尋本月預約 姓名 電話 手機 預約結果 清空搜尋 向下捲動 最後一筆",
    "details": [
      "結果沿用已載入的月份資料，不會跨店查詢；清單過長時可在結果區向下捲動。",
      "搜尋框不會自動打開第一筆，必須點選明確結果。"
    ],
    "modules": ["steamfoot"],
    "permission": "booking.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/bookings/bookings-manager.tsx",
      "src/lib/booking-month-search.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto"
  },
  {
    "id": "C10",
    "category": "customers",
    "title": "即時搜尋顧客時，為什麼按 Enter 不會自動選人？",
    "summary": "這是防止中文選字或同名誤選；輸入後要點候選，或先用方向鍵聚焦再按 Enter。",
    "answer": "搜尋框的 Enter 不會自動選第一位顧客；請明確選擇候選，再核對姓名與電話。",
    "path": "顧客管理／健康資料／現金收支 → 顧客搜尋",
    "steps": [
      "輸入姓名、電話或 LINE 名稱，等待候選顯示。",
      "直接點選正確候選；使用鍵盤時先按向下鍵聚焦候選，再按 Enter。",
      "選取後核對姓名與電話；若繼續修改搜尋文字，系統會解除原選取，需重新選人。"
    ],
    "important": "只輸入文字不代表已選顧客；不要因 Enter 沒開啟第一筆就重複建檔。",
    "success": "欄位顯示選定顧客，後續明細或篩選只使用該顧客 ID。",
    "keywords": "即時顧客搜尋 Enter 中文選字 注音 自動選第一位 姓名 電話 LINE 名稱 方向鍵",
    "details": [
      "候選只會使用目前門市及登入者可查看的範圍；同名仍要用電話核對。",
      "載入失敗可點重試；切換門市或資料更新後會重新取得搜尋資料。"
    ],
    "modules": ["steamfoot", "course"],
    "permission": "customer.read",
    "feature": null,
    "sources": [
      "src/components/customer-instant-search.tsx",
      "src/app/(dashboard)/dashboard/health/health-customer-search.tsx",
      "src/components/admin/course-customer-picker.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "explanation"
  },
  {
    "id": "E12",
    "category": "money",
    "title": "店內收入如何顯示在顧客消費紀錄？",
    "summary": "新增收入時要從候選選擇關聯顧客；儲存後才會出現在該顧客的消費紀錄。",
    "answer": "在「記一筆收支」選收入並明確選定關聯顧客，填消費項目及付款方式後儲存。",
    "path": "營運 → 現金抽屜 → 記一筆收支 → 關聯顧客",
    "steps": [
      "選收入並輸入金額，於關聯顧客搜尋姓名、電話或 LINE 名稱。",
      "點選正確候選，確認畫面顯示「已關聯」，再填消費項目、付款方式與備註。",
      "儲存後到顧客資料的消費紀錄，以日期、類型或文字核對該筆收入。"
    ],
    "important": "關聯顧客是選填，但未選候選就不會歸戶；支出不會顯示為顧客消費。",
    "success": "收支明細與顧客消費紀錄顯示相同日期、項目、付款方式及金額。",
    "keywords": "關聯顧客 消費紀錄 店內收入 手動收入 零售 現場消費 沒有顯示 已關聯",
    "details": [
      "只有同店顧客可選；系統不會依備註或相似姓名自動補關聯。",
      "以「零售-」開頭的消費項目會納入零售分析，其餘手動收入列為其他收入。"
    ],
    "modules": ["steamfoot", "spa", "course"],
    "permission": "cashbook.create",
    "additionalPermissions": ["customer.read"],
    "feature": "cashbook",
    "sources": [
      "src/app/(dashboard)/dashboard/cashbook/_components/cashbook-entry-fields.tsx",
      "src/server/actions/cashbook.ts",
      "src/app/(dashboard)/dashboard/customers/[id]/records/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto"
  },
  {
    "id": "H10",
    "category": "analysis",
    "title": "LINE、Google 地圖與 IG 的體驗預約怎麼分開統計？",
    "summary": "各入口使用自己的來源連結；營運分析依預約建立時的來源標籤計算占比與後續轉換。",
    "answer": "分別使用 LINE、Messenger、Google 地圖、Instagram 或其他來源連結，不能共用同一條無標籤網址。",
    "path": "分析 → 營運分析 → 體驗預約來源",
    "steps": [
      "替每個公開入口使用對應的來源連結，並保留正確門市網址；不要把同一來源連結貼到所有平台。",
      "選期間查看各來源的預約組數、占比、預約人數、完成服務、到店率與方案轉換率。",
      "點來源名稱進入唯讀預約清單，再開啟原預約核對來源與後續狀態。"
    ],
    "important": "來源標籤只能表示顧客使用哪條連結，不能證明他實際在哪個平台看到店家；轉傳仍沿用原標籤。",
    "success": "不同入口的預約分開列示，總來源占比為 100%，明細可回到原預約。",
    "keywords": "體驗預約來源 LINE Messenger Google 地圖 Google商家 IG Instagram 其他 未記錄 來源連結 占比 轉換率",
    "details": [
      "無來源參數、無法辨識的參數及歷史舊資料列為「其他／未記錄」，系統不會用登入方式或 LINE 綁定反推來源。",
      "來源按預約建立日歸入期間；後續完成服務與方案指派會更新到店及轉換結果。"
    ],
    "modules": ["steamfoot"],
    "permission": "report.read",
    "feature": "basic_reports",
    "sources": [
      "docs/trial-booking-source-analytics.md",
      "src/app/(dashboard)/dashboard/reports/page.tsx",
      "src/app/(dashboard)/dashboard/bookings/source/page.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto"
  },
  {
    "id": "I08",
    "category": "settings",
    "title": "怎麼用裝置預覽檢查課程後台的平板與桌機畫面？",
    "summary": "課程店可從側邊選單開啟裝置預覽；預設 iPad 尺寸，也可切換桌機及工作頁面。",
    "answer": "進入裝置預覽後，先選課程工作頁，再切換平板或桌機尺寸核對目前門市資料。",
    "path": "側邊選單 → 裝置預覽",
    "steps": [
      "從課程店後台側邊選單開啟裝置預覽，確認目前門市；系統預設 768 × 1024 平板。",
      "從頁面選單切換課表、顧客、課程、教室、人員、方案、營運、現金帳、分析或設定。",
      "需要時切換 1440 × 900 桌機，核對視窗、欄位與捲動；離開前確認沒有誤送出操作。"
    ],
    "important": "裝置預覽使用目前門市資料，操作仍可能生效；它不是靜態圖片或隔離資料庫。",
    "success": "預覽維持正確課程頁面，切換平板／桌機不會跳回課表或開啟第二個操作指南入口。",
    "keywords": "裝置預覽 課程後台 iPad 平板 桌機 768 1024 1440 900 課表不跳回",
    "details": [
      "預覽工具本身不能再嵌套開啟裝置預覽；框內側邊選單會隱藏同一入口。",
      "裝置尺寸只協助檢查排版，不代表已完成真實 iPad、瀏覽器或觸控驗收。"
    ],
    "modules": ["steamfoot", "course"],
    "permission": "booking.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/device-preview/page.tsx",
      "src/components/device-preview/device-preview.tsx",
      "src/lib/device-preview.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto"
  },
  {
    "id": "F12",
    "category": "care",
    "title": "體驗預約成功，但 LINE 通知尚未完成怎麼辦？",
    "summary": "先保留已成功的預約，再依完成頁顯示的通知狀態處理；通知未完成不代表時段沒有保留。",
    "answer": "先保留已成功的預約，再依完成頁顯示的通知狀態處理；通知未完成不代表時段沒有保留。",
    "path": "公開體驗預約完成頁 → LINE 通知狀態",
    "steps": [
      "先確認完成頁顯示「體驗預約成功」，並記下日期、時間、人數與門市；不要為了補通知重新預約。",
      "若顯示「LINE 通知已連結」，不必再輸入電話；請顧客保持該門市官方 LINE 為好友且未封鎖。",
      "若顯示通知尚未完成並提供「開啟 LINE 完成通知設定」，請顧客在 24 小時內用自己的手機開啟，送出自動帶入的驗證訊息；看到「通知設定完成」才算完成。",
      "若畫面要求聯繫門市，或 LINE 回覆連結失效、身分衝突、暫時無法完成，保留畫面與預約資料，由店家核對；不要解除既有綁定或新建同名顧客。"
    ],
    "important": "專屬通知設定連結只能由顧客本人使用，不可轉傳。預約提醒及體驗後關懷仍受店家開關、發送時間、好友與封鎖狀態影響。",
    "success": "完成頁顯示已連結，或 LINE 回覆「通知設定完成」；預約資料仍維持原日期與時段。",
    "keywords": "體驗預約成功 通知尚未完成 LINE 通知已連結 通知設定完成 24 小時 專屬連結 不用再輸入電話 身分衝突",
    "details": [
      "竹北、新竹與台中的已設定 LINE 體驗入口，會在驗證門市與 LINE 身分後回傳明確通知狀態；電話仍在表單填一次，不需再到官方 LINE 輸入。一般公開表單仍可預約，但只有加入好友或填電話，不足以證明通知綁定完成。",
      "一次性 24 小時設定連結只在系統判定可安全設定時提供。既有顧客尚未綁定或身分不一致時，系統不會只憑電話產生可覆蓋綁定的連結，而是顯示需要門市協助。",
      "連結失效、已使用或不適用本店時，若先前已看到通知設定完成，不必重做；否則請店家核對。LINE 已屬於其他顧客時，原綁定不會被改寫。",
      "通知設定成功不等於訊息已發送。實際提醒與隔日關懷需另外查看店家設定、觸發條件及發送紀錄；不要為測試單一顧客而啟動全店群發。"
    ],
    "modules": ["steamfoot"],
    "permission": "business_hours.manage",
    "feature": "line_reminder",
    "sources": [
      "src/app/(liff)/liff/public-trial/public-trial-liff-bridge.tsx",
      "src/app/pricing/experience/zhubei/book/zhubei-trial-booking-form.tsx",
      "src/server/actions/public-trial-booking.ts",
      "src/server/services/trial-notification-binding.ts",
      "src/app/api/line/webhook/route.ts"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting"
  },
  {
    "id": "J14",
    "category": "start",
    "title": "SPA 第一次開放預約，要先完成哪些設定？",
    "summary": "先備妥療程、人員、班表與服務位置，再核對會員可選時段。",
    "answer": "先備妥療程、人員、班表與服務位置，再核對會員可選時段。",
    "path": "方案管理 → 療程；人員管理；服務位置",
    "keywords": "新手 首次 開店 初始化 設定順序",
    "steps": [
      "在方案管理設定療程、售價、服務與整理時間，核對是否開放顧客自行預約。",
      "由店長從本店會員加入服務人員，設定可提供服務及班表；建立啟用的服務位置並勾選適用療程。",
      "核對會員入口的服務及可選時段；完整試約與結帳請在隔離測試店進行。"
    ],
    "important": "只新增療程或人員還不會自動產生可預約時段。",
    "details": [
      "每個設定頁仍需對應權限；人員管理由店長處理。",
      "首次設定可依序參考服務設定、位置、人員連結與排班教學。"
    ],
    "success": "會員能看到正確服務，且可選時段符合店內班表。",
    "permission": "",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/plans/_components/treatment-workspace.tsx",
      "src/app/(dashboard)/dashboard/spa-staff/workspace.tsx",
      "src/app/(dashboard)/dashboard/spa-resources/workspace.tsx",
      "src/server/actions/spa-customer-booking.ts"
    ]
  },
  {
    "id": "J15",
    "category": "spa",
    "title": "怎麼讓本店會員成為服務人員？",
    "summary": "從本店會員加入或連結既有人員，接著設定服務與班表。",
    "answer": "從本店會員加入或連結既有人員，接著設定服務與班表。",
    "path": "店長後台 → 人員管理 → 新增人員／連結會員",
    "keywords": "新增人員 會員連結 LINE 技師 芳療師 工作權限",
    "steps": [
      "由店長開啟人員管理，點「＋新增人員」；已有排班人員但尚未連結時，選該人員再點「連結會員」。",
      "輸入會員姓名或手機搜尋，核對遮罩電話、LINE 綁定與既有人員狀態，再選正確會員。",
      "加入後設定「可提供服務」及日期班表，請本人重新登入本店前台查看「我的工作」。"
    ],
    "important": "找不到會員時先確認本店會員註冊及 LINE 綁定；不要另建同名人員來略過身分核對。",
    "details": [
      "加入人員不會自動開放接單。",
      "停用工作權限不等於刪除會員身分或方案。"
    ],
    "success": "人員顯示會員已連結，且本人可查看自己的工作。",
    "permission": "duty.manage",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/spa-staff/new-person.tsx",
      "src/app/(dashboard)/dashboard/spa-staff/workspace.tsx",
      "src/app/(dashboard)/dashboard/spa-staff/page.tsx",
      "src/app/(liff)/liff/spa-work/staff-work-screen.tsx"
    ]
  },
  {
    "id": "J16",
    "category": "spa",
    "title": "療程已上架，為什麼會員還是找不到可約時段？",
    "summary": "可約時段需同時滿足療程、人員資格與班表、位置以及完整占用時間。",
    "answer": "可約時段需同時滿足療程、人員資格與班表、位置以及完整占用時間。",
    "path": "方案管理／人員管理／服務位置 → 會員預約",
    "keywords": "沒有時段 無法預約 不指定 空檔 整理時間 上架",
    "steps": [
      "確認療程開放顧客預約、日期在可預約範圍內，並重新查詢該日。",
      "由店長核對可提供此療程的人員與當日班表，再確認啟用位置適用所有選取療程。",
      "檢查既有預約及服務加整理時間；改選日期或服務後重新選時段與人員。"
    ],
    "important": "畫面空白不代表足夠容納整段服務；選「不指定」也不會略過資格或衝突檢查。",
    "details": [],
    "success": "符合條件的日期出現可選時段；仍無時段時能指出需調整的條件。",
    "permission": "booking.read",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(customer)/book/new/spa-customer-booking-form.tsx",
      "src/server/actions/spa-customer-booking.ts",
      "src/app/(dashboard)/dashboard/spa-staff/workspace.tsx"
    ]
  },
  {
    "id": "J17",
    "category": "spa",
    "title": "如何引導會員自行預約 SPA 療程？",
    "summary": "會員依序選服務、日期時間、人員，再核對摘要送出。",
    "answer": "會員依序選服務、日期時間、人員，再核對摘要送出。",
    "path": "會員專區 → 立即預約",
    "keywords": "會員預約 顧客前台 指定人員 不指定 自動安排 服務位置",
    "steps": [
      "會員登入正確門市，點立即預約，選取需要的服務，再選日期及上午、下午或晚上的可用時段。",
      "選指定服務人員，或點「不指定（由系統安排）」。",
      "核對日期時間、服務、人員、預估時間與價格，再送出；成功後查看我的 SPA 預約。"
    ],
    "important": "這個會員表單沒有手選位置步驟，系統會安排可用位置；實際安排可在成功後的預約卡查看。",
    "details": [
      "修改服務或日期後需重新選時段與人員。",
      "送出有衝突時先閱讀提示並重選；不確定是否成功時先查已有預約。"
    ],
    "success": "預約卡顯示正確服務、人員、位置與日期時間。",
    "permission": "booking.read",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(customer)/book/new/spa-customer-booking-form.tsx",
      "src/server/actions/spa-customer-booking.ts",
      "src/app/(customer)/book/page.tsx"
    ]
  },
  {
    "id": "J18",
    "category": "spa",
    "title": "會員怎麼取消 SPA 預約？為什麼不能取消？",
    "summary": "在預約卡確認取消；目前自行取消限制為服務開始前至少 12 小時。",
    "answer": "在預約卡確認取消；目前自行取消限制為服務開始前至少 12 小時。",
    "path": "會員預約頁 → 我的 SPA 預約 → 取消這筆預約",
    "keywords": "會員取消 取消截止 十二小時 12 小時 退費 釋放",
    "steps": [
      "核對本店、日期時間及服務，點「取消這筆預約」。",
      "閱讀確認內容後點「確認取消」；若保留原安排則點「保留預約」。",
      "確認卡片顯示已取消；距離開始不足 12 小時或狀態不允許時，請聯繫店家協助。"
    ],
    "important": "取消預約不等於退款；已付費款項另由店家核對。",
    "details": [
      "成功取消會保留歷史並釋放人員、位置及該筆預約的保留權益。",
      "這是 SPA 會員自行取消規則，不套用課程模組的取消設定。"
    ],
    "success": "原預約顯示已取消，或清楚顯示需聯繫店家的原因。",
    "permission": "booking.read",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(customer)/book/new/spa-customer-booking-form.tsx",
      "src/server/actions/spa-customer-booking.ts"
    ]
  },
  {
    "id": "J19",
    "category": "spa",
    "title": "會員在哪裡查 SPA 剩餘次數與預約保留？",
    "summary": "從會員專區查看我的療程，分別核對剩餘、已預約及可用次數。",
    "answer": "從會員專區查看我的療程，分別核對剩餘、已預約及可用次數。",
    "path": "會員專區 → 我的療程",
    "keywords": "剩餘次數 保留 可用次數 過期 歷史療程 扣次",
    "steps": [
      "會員先確認門市及登入身分，再打開我的療程。",
      "核對療程名稱、期限、剩餘次數及已預約保留；需要時查看過期與歷史區。",
      "若有剩餘卻不能結帳扣次，請店家核對適用服務、有效期及保留紀錄。"
    ],
    "important": "可用次數會扣除已預約保留；預約保留不代表服務已完成或款項已結清。",
    "details": [
      "目前會員單一服務預約會在有適用權益時保留一次；多服務組合不可一律推論會自動保留。",
      "本頁讀取 SPA 療程權益，不會把蒸足方案或課程額度合併。"
    ],
    "success": "能對應療程期限、剩餘與保留數量，異常交由店家查原紀錄。",
    "permission": "customer.read",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(customer)/book/page.tsx",
      "src/app/(liff)/liff/wallets/wallets-list.tsx",
      "src/server/actions/spa-liff-member.ts",
      "src/server/actions/spa-customer-booking.ts"
    ]
  },
  {
    "id": "J20",
    "category": "spa",
    "title": "SPA 服務人員怎麼查看我的工作與備註？",
    "summary": "切到我的工作，選日期並展開預約查看服務明細及預約備註。",
    "answer": "切到我的工作，選日期並展開預約查看服務明細及預約備註。",
    "path": "會員專區 → 我的工作",
    "keywords": "服務人員 我的工作 月曆 藍點 休假 備註 完成服務",
    "steps": [
      "以已連結的本店會員登入，切到「我的工作」。",
      "選月曆日期；藍點表示有預約，休假日另有標示，可用「回到今天」返回。",
      "點開預約卡，核對顧客、時間、服務位置、服務與整理時間及預約備註。"
    ],
    "important": "此工作頁目前提供查看，沒有課程教練的點名、更正出席或編輯備註按鈕；完成服務與結帳由有權限者在後台處理。",
    "details": [
      "工作頁只列本人被指派的預約，取消的預約不列入。",
      "當日無預約不代表已開放接單，仍以店內班表為準。"
    ],
    "success": "選取日期的本人行程與展開明細一致。",
    "permission": "booking.read",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(liff)/liff/spa-work/staff-work-screen.tsx",
      "src/server/actions/spa-liff-staff-work.ts",
      "src/components/spa-identity-mode-switcher.tsx"
    ]
  },
  {
    "id": "J21",
    "category": "spa",
    "title": "服務人員看不到我的工作，怎麼排查？",
    "summary": "先區分工作權限不足與暫時無法讀取，再核對本人及門市連結。",
    "answer": "先區分工作權限不足與暫時無法讀取，再核對本人及門市連結。",
    "path": "我的工作 → 提示訊息；店長後台 → 人員管理",
    "keywords": "尚未取得本店工作權限 無法讀取 會員綁定 重新登入",
    "steps": [
      "確認正在正確門市，且以店長連結的那個會員身分登入。",
      "顯示「尚未取得本店工作權限」時，請店長核對本店會員與服務人員連結；剛設定完成可重新登入。",
      "顯示「目前無法讀取工作資料」時先重新整理；持續失敗請提供時間與畫面請店家協助。"
    ],
    "important": "暫時讀取失敗不能直接當作沒有預約，也不要重建會員或分享他人的登入帳號。",
    "details": [],
    "success": "恢復顯示本人工作，或明確確認需修正的連結／讀取問題。",
    "permission": "booking.read",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(liff)/liff/spa-work/staff-work-screen.tsx",
      "src/server/actions/spa-liff-staff-work.ts",
      "src/app/(dashboard)/dashboard/spa-staff/new-person.tsx"
    ]
  },
  {
    "id": "J22",
    "category": "spa",
    "title": "店長如何修改或取消原本的 SPA 預約？",
    "summary": "從原預約修改日期、服務、人員或位置，避免另外新增造成重複。",
    "answer": "從原預約修改日期、服務、人員或位置，避免另外新增造成重複。",
    "path": "預約排程 → 原預約",
    "keywords": "改期 改時間 換人員 換位置 取消 預約備註",
    "steps": [
      "點開原預約並核對顧客、日期、服務及狀態。",
      "要調整時修改必要欄位與備註，核對可用人員、位置及摘要後點「儲存修改」。",
      "要取消時點「取消預約」再確認；完成後重查原預約狀態。"
    ],
    "important": "只有待確認、已預約且具修改權限的預約可操作；已完成或取消的預約不能用此方式重改。",
    "details": [
      "提示預約已變更時，重新開啟原預約讀取最新內容後再決定。",
      "備註最多 500 字，可在服務人員工作明細看到；取消不等於退款。"
    ],
    "success": "原紀錄呈現新安排或已取消，沒有新增重複預約。",
    "permission": "booking.update",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/spa-schedule/workspace.tsx",
      "src/server/actions/spa-booking.ts",
      "src/app/(liff)/liff/spa-work/staff-work-screen.tsx"
    ]
  },
  {
    "id": "J23",
    "category": "spa",
    "title": "SPA 預約成功卻沒收到 LINE，應該重約嗎？",
    "summary": "先查系統內預約紀錄；畫面同步成功不能當作 LINE 已送達。",
    "answer": "先查系統內預約紀錄；畫面同步成功不能當作 LINE 已送達。",
    "path": "會員我的預約／店長預約排程",
    "keywords": "LINE 沒通知 未送達 預約成功 重複預約 同步",
    "steps": [
      "會員先查看自己的 SPA 預約，店長核對同日期與服務的原紀錄。",
      "已有預約時保留該筆，確認服務人員工作畫面是否列入；另核對本店 LINE 綁定及通知紀錄。",
      "沒有通知或查詢失敗時記下時間與提示請店家查明，不要用重新預約來測試通知。"
    ],
    "important": "會員表單的「店長與服務人員會同步看到」是系統行程同步，不是 LINE 送達保證。",
    "details": [
      "是否發通知仍須依實際使用入口、通知設定與發送結果查核；不能套用展示預覽流程的通知承諾。"
    ],
    "success": "能區分預約已建立、工作可見與 LINE 通知結果。",
    "permission": "booking.read",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(customer)/book/new/spa-customer-booking-form.tsx",
      "src/server/actions/spa-customer-booking.ts",
      "src/server/actions/spa-liff-staff-work.ts"
    ]
  }
];
