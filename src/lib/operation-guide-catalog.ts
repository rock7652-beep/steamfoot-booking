import type { OperationGuide, GuideCategory } from "./operation-guide-types";

/** Source-reviewed preview content; interaction verification remains separate. */
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
      "/dashboard/reconciliation",
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
    "summary": "先確認頂欄門市正確，再到「設定」確認營業與預約時間。",
    "path": "設定 → 店務設定／營運設定",
    "steps": [
      "先確認頂欄門市正確，再到「設定」確認營業與預約時間。",
      "設定店內方案、付款資訊與服務人員，再檢查提醒管理。",
      "使用測試顧客走一次預約、到店與收款流程，再開放給顧客。"
    ],
    "important": "試走流程也可能建立交易或發出通知，請使用隔離測試店及測試收件人。",
    "success": "能確認每個必要設定的位置與尚未完成的項目。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "S02",
    "category": "start",
    "title": "首頁的待處理事項，要從哪裡開始？",
    "summary": "先看「今天待處理」，確認收款或回訪項目。",
    "path": "首頁 → 今天待處理",
    "steps": [
      "先看「今天待處理」，確認收款或回訪項目。",
      "點該筆旁的操作，核對顧客與紀錄後處理。",
      "返回首頁查看更新結果；看不完可點「查看全部」。"
    ],
    "important": "顯示待確認收款不代表款項已入帳，請先核對。",
    "success": "處理結果能在對應顧客或交易紀錄核對。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "S03",
    "category": "start",
    "title": "系統顯示上一個營業日尚未閉店怎麼辦？",
    "summary": "點「查看現金抽屜」，先確認未閉店的營業日。",
    "path": "首頁 → 今日開店檢查 → 查看現金抽屜",
    "steps": [
      "點「查看現金抽屜」，先確認未閉店的營業日。",
      "核對該日現金收支、提領、補入與實際點到金額。",
      "完成前一筆閉店後，再處理今日開店點錢。"
    ],
    "important": "不要用今天的現金金額代填過去營業日。",
    "success": "首頁不再顯示該筆未閉店提示。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "A04",
    "category": "booking",
    "title": "如何替顧客新增預約？",
    "summary": "先找到正確顧客，避免為既有顧客重複建檔。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "A05",
    "category": "booking",
    "title": "怎麼查看今天或其他日期的預約？",
    "summary": "在日期區選今天或要查看的日期。",
    "path": "預約管理",
    "steps": [
      "在日期區選今天或要查看的日期。",
      "查看該日清單，點開預約確認顧客與狀態。",
      "若找不到資料，先確認門市、日期及目前篩選。"
    ],
    "important": "畫面上的日期與門市會影響清單範圍。",
    "success": "清單日期與要查的日期一致。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "A06",
    "category": "booking",
    "title": "服務完成前，要核對哪些資料？",
    "summary": "核對顧客、實際到店人數、方案與到期日。",
    "path": "預約管理 → 預約明細",
    "steps": [
      "核對顧客、實際到店人數、方案與到期日。",
      "檢查本次的付款方式、收款金額或扣堂說明。",
      "確認無誤再完成服務，回查預約狀態及收款／堂數紀錄。"
    ],
    "important": "完成服務可能影響收款與堂數，送出失敗時先核對紀錄，不要重複建立交易。",
    "success": "狀態顯示完成，且紀錄與實際服務相符。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "A08",
    "category": "booking",
    "title": "顧客沒來，如何標記未到？",
    "summary": "先確認這筆預約確實未到，核對預約人數。",
    "path": "預約管理 → 預約明細 → 標記未到",
    "steps": [
      "先確認這筆預約確實未到，核對預約人數。",
      "查看未到視窗，選擇扣堂或扣堂並給補課資格。",
      "確認後回查未到狀態、扣堂與補課紀錄。"
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
      "src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx",
      "src/app/(dashboard)/dashboard/bookings/new/booking-form.tsx",
      "src/app/(dashboard)/dashboard/bookings/no-show-modal.tsx"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "A09",
    "category": "booking",
    "title": "同行預約只來一部分的人，怎麼處理？",
    "summary": "先核對原本預約人數與實際到店人數。",
    "path": "預約管理 → 預約明細 → 實際到店",
    "steps": [
      "先核對原本預約人數與實際到店人數。",
      "依完成流程處理到場者，並核對未到人數。",
      "在部分未到視窗確認扣堂或補課方式，再回查紀錄。"
    ],
    "important": "不要把整筆直接取消；部分未到的處理可能影響堂數及補課資格。",
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
      "src/app/(dashboard)/dashboard/bookings/new/booking-form.tsx",
      "src/app/(dashboard)/dashboard/bookings/no-show-modal.tsx"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "A10",
    "category": "booking",
    "title": "操作後沒看到更新，要再按一次嗎？",
    "summary": "先看是否仍在儲存或顯示錯誤，保留未儲存內容。",
    "path": "預約管理 → 更新狀態",
    "steps": [
      "先看是否仍在儲存或顯示錯誤，保留未儲存內容。",
      "完成後使用清單的手動更新，重新核對該筆預約。",
      "若仍不一致，記下日期、顧客及操作時間再聯繫支援。"
    ],
    "important": "畫面未更新不代表送出失敗；先查紀錄，避免重複預約或收款。",
    "success": "能確認該次操作是否已成功，或保留足夠的排查資訊。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "B01",
    "category": "hours",
    "title": "每週固定營業時間怎麼設定？",
    "summary": "展開每週固定時段，選要調整的星期。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "B02",
    "category": "hours",
    "title": "中午休息或一天分兩段營業怎麼設定？",
    "summary": "選日期，在服務時間設定多段起訖時間。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "B03",
    "category": "hours",
    "title": "某天臨時休息，怎麼停止新預約？",
    "summary": "選需要休息的日期，調整當日狀態。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "B04",
    "category": "hours",
    "title": "臨時增開、關閉或重開時段怎麼做？",
    "summary": "選要處理的日期，開啟當日時段管理。",
    "path": "預約管理 → 當日時段管理",
    "steps": [
      "選要處理的日期，開啟當日時段管理。",
      "選擇新增時段，或對既有時段關閉／重新開放。",
      "核對時間與容量，儲存後回到當日清單確認。"
    ],
    "important": "這是時段供應的調整；已存在的預約仍需另外處理。",
    "success": "當日時段開放狀態符合設定。",
    "keywords": "加開 增開 關閉 重開",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "business_hours.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/settings/hours/schedule-manager.tsx"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "B06",
    "category": "hours",
    "title": "單一時段想多接幾位，在哪裡調整？",
    "summary": "選日期並展開單一時段開放與名額。",
    "path": "設定 → 預約開放設定 → 單一時段開放與名額",
    "steps": [
      "選日期並展開單一時段開放與名額。",
      "點時段，輸入容量並確認調整。",
      "核對新名額；需要時使用回復預設名額。"
    ],
    "important": "容量要配合現場實際接待能力；系統仍會檢查既有預約。",
    "success": "時段顯示更新後的名額。",
    "keywords": "名額 人數 容量",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "business_hours.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/settings/hours/schedule-manager.tsx"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "B10",
    "category": "hours",
    "title": "明明還有空位，為什麼顧客約不到？",
    "summary": "確認日期已開放、時段尚未過時且未被關閉。",
    "path": "預約管理／設定 → 預約開放設定",
    "steps": [
      "確認日期已開放、時段尚未過時且未被關閉。",
      "核對同行人數是否超過剩餘名額，以及值班聯動設定。",
      "再查顧客有效方案、可預約堂數與到期日。"
    ],
    "important": "有空位不代表該顧客一定符合預約條件；先查限制，不要直接加堂數。",
    "success": "找到是時段、人數、值班還是方案限制。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "C01",
    "category": "customers",
    "title": "怎麼找到顧客，避免重複建檔？",
    "summary": "先用電話搜尋，再用姓名確認是否已有紀錄。",
    "path": "顧客管理",
    "steps": [
      "先用電話搜尋，再用姓名確認是否已有紀錄。",
      "核對顧客資料、舊預約與方案是否屬於本人。",
      "確定查無資料時，才使用新增顧客。"
    ],
    "important": "同名不代表同一人；不要只憑姓名修改別人的資料。",
    "success": "找到正確的顧客紀錄。",
    "keywords": "搜尋 電話 同名 重複",
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
    "verification": "source-reviewed"
  },
  {
    "id": "C03",
    "category": "customers",
    "title": "顧客姓名或電話填錯，怎麼修正？",
    "summary": "找到顧客，先核對目前的姓名與電話。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "C04",
    "category": "customers",
    "title": "哪裡可以看顧客的預約與消費紀錄？",
    "summary": "打開顧客資料，找到過往紀錄。",
    "path": "顧客管理 → 顧客資料 → 過往紀錄",
    "steps": [
      "打開顧客資料，找到過往紀錄。",
      "切換預約紀錄或消費紀錄，核對日期與狀態。",
      "需要更多資訊時，開啟對應預約或交易明細。"
    ],
    "important": "預約次數與交易筆數不同，不能直接當作相同統計。",
    "success": "能找到指定日期的預約或消費。",
    "keywords": "歷史 歷次 消費 紀錄",
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
    "verification": "source-reviewed"
  },
  {
    "id": "C05",
    "category": "customers",
    "title": "店內備註和本次預約備註有什麼不同？",
    "summary": "長期服務需求放在顧客的店內／服務備註。",
    "path": "顧客資料／預約明細",
    "steps": [
      "長期服務需求放在顧客的店內／服務備註。",
      "僅本次服務要注意的事情，放在預約的本次備註。",
      "修改後確認儲存結果，避免把一次性事項留在長期備註。"
    ],
    "important": "例如「今天晚到」適合本次備註；不要把敏感資訊寫進不必要的欄位。",
    "success": "下一次服務能區分長期需求與單次交代。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "C07",
    "category": "customers",
    "title": "顧客登入後看不到原本方案，先查什麼？",
    "summary": "確認顧客開啟的是正確門市入口。",
    "path": "顧客管理 → 顧客資料 → LINE 與通知設定",
    "steps": [
      "確認顧客開啟的是正確門市入口。",
      "用原本電話查找舊資料，核對預約、方案與 LINE 綁定。",
      "若疑似登入另一身分，保留錯誤畫面與時間，交由有權限的人員核對。"
    ],
    "important": "不要先新增同名顧客或重發方案，避免把資料分散到另一個身分。",
    "success": "能確認是入口、身分還是方案狀態問題。",
    "keywords": "登入 找不到 舊資料 LINE 綁定",
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
    "verification": "source-reviewed"
  },
  {
    "id": "C08",
    "category": "customers",
    "title": "顧客換 LINE 或綁定有衝突怎麼辦？",
    "summary": "先核對顧客本人、電話及目前綁定紀錄。",
    "path": "顧客管理 → 顧客資料 → 管理 LINE 綁定",
    "steps": [
      "先核對顧客本人、電話及目前綁定紀錄。",
      "由具 LINE 重新綁定權限的人員查看申請與診斷資訊。",
      "依畫面處理；無法唯一確認身分時，整理資料請支援協助。"
    ],
    "important": "不能因為同名就直接移轉身分；重新綁定不等於新建會員。",
    "success": "正確身分與舊資料的關係經核對後再處理。",
    "keywords": "換帳號 重綁 衝突",
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
    "verification": "source-reviewed"
  },
  {
    "id": "D02",
    "category": "plans",
    "title": "顧客買了方案，如何登記？",
    "summary": "選方案與付款方式，核對款項狀態。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "D03",
    "category": "plans",
    "title": "在哪裡看剩餘堂數與到期日？",
    "summary": "找到顧客目前方案，核對方案名稱。",
    "path": "顧客管理 → 顧客資料 → 方案",
    "steps": [
      "找到顧客目前方案，核對方案名稱。",
      "分別查看方案剩餘、已預約、可再預約與到期日。",
      "有多張方案時逐張核對，不只看合計。"
    ],
    "important": "已預約堂數占用可預約額度；畫面提示明細不一致時先查紀錄。",
    "success": "能分辨剩餘堂數與還能新增預約的堂數。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "D04",
    "category": "plans",
    "title": "方案到期日填錯，怎麼修改？",
    "summary": "點「編輯到期日」，選新的日期。",
    "path": "顧客資料 → 方案 → 編輯到期日",
    "steps": [
      "點「編輯到期日」，選新的日期。",
      "填寫必填的修改原因，確認是提前或延後。",
      "點「儲存到期日」，核對更新提示與新日期。"
    ],
    "important": "到期日不可早於今天；無期限方案目前不提供此日期修改。",
    "success": "看到方案到期日已更新，且日期正確。",
    "keywords": "展延 延長 提前 到期",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "wallet.adjust",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/assign-plan-form.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/extend-wallet-expiry-form.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/adjust-wallet-form.tsx"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "D07",
    "category": "plans",
    "title": "方案過期或可用堂數不足怎麼查？",
    "summary": "逐張確認方案期限與狀態。",
    "path": "顧客管理 → 顧客資料 → 方案",
    "steps": [
      "逐張確認方案期限與狀態。",
      "核對已預約占用的堂數及這次同行人數。",
      "依實際購買或更正情況處理，完成後重新查詢。"
    ],
    "important": "取消預約釋放堂數，不會自動延長原方案期限。",
    "success": "知道無法預約的具體原因。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "D09",
    "category": "plans",
    "title": "堂數記錄不符，如何核對與更正？",
    "summary": "先比對已完成、未到、取消與保留中的預約。",
    "path": "顧客資料 → 方案與堂數明細",
    "steps": [
      "先比對已完成、未到、取消與保留中的預約。",
      "確認是否為已預約占用，或重複查看不同方案。",
      "確定需要更正且有權限時，輸入「調整為幾堂」與原因並儲存。"
    ],
    "important": "調整欄位是目標堂數，不是直接輸入增加幾堂；務必保留原因。",
    "success": "出現「堂數已更新」，明細符合核對結果。",
    "keywords": "補堂 調整 錯誤 堂數",
    "details": [],
    "modules": [
      "steamfoot"
    ],
    "permission": "wallet.adjust",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/[id]/assign-plan-form.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/extend-wallet-expiry-form.tsx",
      "src/app/(dashboard)/dashboard/customers/[id]/adjust-wallet-form.tsx"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "E01",
    "category": "money",
    "title": "顧客說已匯款，如何確認收款？",
    "summary": "找到待確認交易，核對顧客、方案與金額。",
    "path": "首頁待處理／營運 → 該筆交易",
    "steps": [
      "找到待確認交易，核對顧客、方案與金額。",
      "用銀行實際入帳紀錄核對，不只看顧客填寫資訊。",
      "確認收款後，再核對交易狀態與應發放的方案。"
    ],
    "important": "確認收款可能發放堂數並計入營收；不要重複指派方案。",
    "success": "交易不再待確認，對應方案狀態正確。",
    "keywords": "核帳 入帳 轉帳 匯款",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "transaction.create",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/revenue/page.tsx",
      "src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace.tsx"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "E06",
    "category": "money",
    "title": "收款資料登記錯誤，從哪裡修正？",
    "summary": "篩選日期並找到原交易，核對顧客與金額。",
    "path": "營運 → 營收明細 → 交易詳情",
    "steps": [
      "篩選日期並找到原交易，核對顧客與金額。",
      "查看該交易可用的更正操作，再修改允許的欄位。",
      "完成後回查交易詳情；沒有修正入口時請具權限人員處理。"
    ],
    "important": "付款方式更正、作廢與退款是不同操作，不要新增反向交易代替。",
    "success": "原交易資料或對應修正紀錄能查到。",
    "keywords": "更正 付款方式 作廢",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "transaction.void",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/revenue/page.tsx",
      "src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace.tsx"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "E07",
    "category": "money",
    "title": "取消預約後，款項也會自動退嗎？",
    "summary": "先核對原交易是否已實際收款。",
    "path": "營運 → 交易詳情",
    "steps": [
      "先核對原交易是否已實際收款。",
      "查看可用的退款操作與影響範圍。",
      "核對系統退款紀錄及實際退還款項，兩者都確認完成。"
    ],
    "important": "取消預約不等於退費；系統記錄退款也不代表銀行自動匯出款項。",
    "success": "交易退款紀錄與實際退款一致。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "E08",
    "category": "money",
    "title": "要登記收入或支出，從哪裡操作？",
    "summary": "點「記一筆收支」，選收入或支出。",
    "path": "營運 → 記一筆收支／完整現金管理",
    "steps": [
      "點「記一筆收支」，選收入或支出。",
      "輸入金額、付款方式、分類與必要備註。",
      "確認新增後，在明細核對日期、金額與類型。"
    ],
    "important": "非現金收支與抽屜現金不同，付款方式要如實填寫。",
    "success": "收支明細出現正確紀錄。",
    "keywords": "支出 收入 記帳",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "cashbook.create",
    "feature": "cashbook",
    "sources": [
      "src/app/(dashboard)/dashboard/revenue/page.tsx",
      "src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace.tsx"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "E09",
    "category": "money",
    "title": "開店與閉店怎麼核對現金？",
    "summary": "開店時輸入實際點到金額；若與帳面不同，填寫原因。",
    "path": "現金抽屜",
    "steps": [
      "開店時輸入實際點到金額；若與帳面不同，填寫原因。",
      "營業中登錄收支、提領與補入現金。",
      "閉店前核對系統應有與實際金額，再完成閉店。"
    ],
    "important": "閉店後當日現金異動會鎖定，先完成登錄再閉店。",
    "success": "閉店實點、差額與下次開店起點均可查。",
    "keywords": "點錢 開店 閉店 對帳",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "cashDrawer.read",
    "feature": "cash_drawer",
    "sources": [
      "src/app/(dashboard)/dashboard/revenue/page.tsx",
      "src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace.tsx"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "E10",
    "category": "money",
    "title": "提領現金、補入現金和支出有何不同？",
    "summary": "店內費用使用「記一筆收支」登記支出。",
    "path": "現金抽屜 → 日常操作",
    "steps": [
      "店內費用使用「記一筆收支」登記支出。",
      "把現金從抽屜拿走使用「提領」。",
      "放入找零金或備用金使用「補入現金」，核對紀錄。"
    ],
    "important": "提領不算店內支出，補入也不等於服務營收。",
    "success": "現金變動分類符合實際用途。",
    "keywords": "備用金 找零 提領 補入",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "cashDrawer.entry",
    "feature": "cash_drawer",
    "sources": [
      "src/app/(dashboard)/dashboard/revenue/page.tsx",
      "src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace.tsx"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "E11",
    "category": "money",
    "title": "閉店金額填錯，可以重做嗎？",
    "summary": "確認錯誤的營業日與閉店紀錄。",
    "path": "現金抽屜 → 已完成今日結帳 → 撤銷閉店",
    "steps": [
      "確認錯誤的營業日與閉店紀錄。",
      "有撤銷入口時填寫撤銷原因，恢復營業中。",
      "核對資料後重新閉店，不要另記假收入補平。"
    ],
    "important": "撤銷與重結帳受權限及目前紀錄狀態限制。",
    "success": "新的閉店實點與差額正確，保留原因。",
    "keywords": "撤銷閉店 差額 填錯",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "cashDrawer.close",
    "feature": "cash_drawer",
    "sources": [
      "src/app/(dashboard)/dashboard/revenue/page.tsx",
      "src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace.tsx"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "F01",
    "category": "care",
    "title": "顧客提醒與店長通知在哪裡分開設定？",
    "summary": "切到「顧客提醒」設定傳給顧客的訊息。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "F03",
    "category": "care",
    "title": "當日臨時預約，要怎麼通知店長？",
    "summary": "找到當日預約相關通知設定。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "F04",
    "category": "care",
    "title": "LINE 沒收到通知，先檢查什麼？",
    "summary": "用發送紀錄確認該訊息是成功、失敗還是尚未發送。",
    "path": "提醒管理 → 發送紀錄",
    "steps": [
      "用發送紀錄確認該訊息是成功、失敗還是尚未發送。",
      "核對通知規則是否啟用、發送時間與收件身分。",
      "若失敗，保留原因，檢查綁定與官方帳號狀態後處理。"
    ],
    "important": "沒有紀錄與發送失敗不是同一件事；不要直接重複發送。",
    "success": "能說明未收到的階段與原因。",
    "keywords": "收不到 漏發 失敗 紀錄",
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
    "verification": "source-reviewed"
  },
  {
    "id": "F06",
    "category": "care",
    "title": "如何啟用體驗後自動關懷？",
    "summary": "打開整組關懷，檢查每一階段的開關。",
    "path": "提醒管理 → 顧客提醒 → 體驗客後續關懷",
    "steps": [
      "打開整組關懷，檢查每一階段的開關。",
      "設定體驗後天數、傳送時間與訊息內容，閱讀卡片預覽。",
      "確認文案並啟用，再查看已儲存狀態。"
    ],
    "important": "只處理啟用後新完成的體驗，不補發歷史體驗。",
    "success": "顯示整組已啟用，依已儲存設定發送。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "F07",
    "category": "care",
    "title": "關懷文案與時間可以自己調整嗎？",
    "summary": "展開要調整的階段，修改天數與時間。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "F08",
    "category": "care",
    "title": "顧客已購買或預約，還會收到體驗邀請嗎？",
    "summary": "查看該顧客是否已購買方案、儲值或有預約。",
    "path": "體驗客後續關懷 → 發送規則與避免打擾",
    "steps": [
      "查看該顧客是否已購買方案、儲值或有預約。",
      "展開最近關懷紀錄，核對階段與略過原因。",
      "需要停止時，使用「停止此顧客關懷」。"
    ],
    "important": "已購買方案或儲值停止邀請；已預約略過該次邀請。每階段只發一次。",
    "success": "能查到已發送、略過或停止的紀錄。",
    "keywords": "買課 預約 停止 打擾",
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
    "verification": "source-reviewed"
  },
  {
    "id": "F09",
    "category": "care",
    "title": "顧客退訂關懷，預約提醒會一起停嗎？",
    "summary": "先確認停止的是體驗關懷這類訊息。",
    "path": "體驗關懷卡片／最近關懷紀錄",
    "steps": [
      "先確認停止的是體驗關懷這類訊息。",
      "核對該顧客關懷狀態。",
      "預約提醒仍到顧客提醒的對應設定核對。"
    ],
    "important": "停止體驗關懷不影響預約通知，不代表封鎖所有 LINE 訊息。",
    "success": "能區分體驗關懷與預約通知的開關。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "F10",
    "category": "customers",
    "title": "如何找到久未到店或需要續約關心的顧客？",
    "summary": "打開顧客經營，選「好久不見」「建議安排回店」或「建議續約」。",
    "path": "顧客經營",
    "steps": [
      "打開顧客經營，選「好久不見」「建議安排回店」或「建議續約」。",
      "查看名單，再打開顧客資料核對近期紀錄。",
      "依實際狀況聯絡並記錄追蹤情形。"
    ],
    "important": "名單是經營參考，不代表已自動完成聯絡。",
    "success": "找到需要關心的人，並可核對其紀錄。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "G01",
    "category": "staff",
    "title": "新增服務人員時，要準備什麼？",
    "summary": "準備真實姓名、顯示名稱、手機與初始密碼。",
    "path": "人員管理 → 新增人員",
    "steps": [
      "準備真實姓名、顯示名稱、手機與初始密碼。",
      "依門市模組設定可服務項目、班表等欄位。",
      "建立後核對角色與人員狀態，請本人登入確認。"
    ],
    "important": "建立人員與設定可操作權限不同，須另外核對授權範圍。",
    "success": "人員列表能看到正確資料與角色。",
    "keywords": "新增員工 教練 芳療師 帳號",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "staff.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/staff/staff-workspace.tsx",
      "src/lib/permissions.ts"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "G03",
    "category": "staff",
    "title": "員工看不到某個功能，是系統壞了嗎？",
    "summary": "確認登入者身分及目前門市。",
    "path": "人員管理／設定",
    "steps": [
      "確認登入者身分及目前門市。",
      "核對該功能的員工權限與門市開通狀態。",
      "請有管理權限的人員調整；未開通功能需先確認方案。"
    ],
    "important": "有選單不代表有修改權限；操作指南不會代替權限授權。",
    "success": "找出角色、權限或功能開通的差異。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "G04",
    "category": "staff",
    "title": "員工忘記密碼或離職，怎麼處理？",
    "summary": "選正確人員，核對手機與角色。",
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
      "steamfoot",
      "spa"
    ],
    "permission": "staff.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/staff/staff-workspace.tsx",
      "src/lib/permissions.ts"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "H01",
    "category": "analysis",
    "title": "怎麼查看本月或其他期間的營收？",
    "summary": "選擇要看的月份或期間。",
    "path": "分析 → 營運分析",
    "steps": [
      "選擇要看的月份或期間。",
      "查看本期營收、完成服務、訂單與退款。",
      "需要追查時回到營運明細，使用相同日期範圍核對。"
    ],
    "important": "營收、完成服務人次與訂單筆數是不同指標。",
    "success": "能在同一期間核對摘要與明細。",
    "keywords": "月報 營收 報表",
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
    "verification": "source-reviewed"
  },
  {
    "id": "H03",
    "category": "analysis",
    "title": "體驗、到場與買方案，要怎麼看？",
    "summary": "選月份並查看體驗及顧客相關指標。",
    "path": "分析 → 營運分析",
    "steps": [
      "選月份並查看體驗及顧客相關指標。",
      "需要核對人員時，點對應的「查看顧客」。",
      "以該名單與實際預約、交易核對，不只看單一比率。"
    ],
    "important": "人數、組數與交易筆數不能混用；不同指標的期間歸屬需依畫面說明核對。",
    "success": "能找到指標背後的顧客與交易資料。",
    "keywords": "開卡率 體驗率 轉換 新生 人數 組數",
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
    "verification": "source-reviewed"
  },
  {
    "id": "H09",
    "category": "analysis",
    "title": "報表跟預約清單數字不同，怎麼核對？",
    "summary": "先把門市、期間與篩選調成一致。",
    "path": "分析／營運／預約管理",
    "steps": [
      "先把門市、期間與篩選調成一致。",
      "確認比較的是人次、筆數、收款還是服務完成。",
      "找差異顧客，核對取消、未到、退款及付款狀態。"
    ],
    "important": "不要為了讓報表相同就修改原始交易；先查統計口徑。",
    "success": "差異可追溯到明細或統計條件。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "I02",
    "category": "settings",
    "title": "店家匯款帳號與 LINE 連結在哪設定？",
    "summary": "進入付款設定，核對銀行名稱、代碼與帳號。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "I03",
    "category": "settings",
    "title": "體驗價格或可調整範圍在哪裡改？",
    "summary": "確認體驗單功能狀態。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "I05",
    "category": "settings",
    "title": "切換分店後，為什麼只能查看？",
    "summary": "確認頂欄與門市選單目前選的是哪家店。",
    "path": "左側門市切換 → 查看分店",
    "steps": [
      "確認頂欄與門市選單目前選的是哪家店。",
      "跨店查看時閱讀唯讀提示，查詢該店資料。",
      "要修改時回到自己可操作的門市，或請該店處理。"
    ],
    "important": "串接不等於可替所有分店改資料；實際可見門市依授權。",
    "success": "清楚知道目前店別與可操作範圍。",
    "keywords": "串接 多店 分店 查看 唯讀",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "",
    "feature": "multi_store",
    "sources": [
      "src/app/(dashboard)/dashboard/settings/page.tsx",
      "src/components/store-view-mode-switcher.tsx"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "I09",
    "category": "settings",
    "title": "目前用什麼方案？為什麼有些功能沒開？",
    "summary": "先確認目前門市與方案名稱。",
    "path": "設定 → 成長方案中心",
    "steps": [
      "先確認目前門市與方案名稱。",
      "查看已開通功能與對應方案資訊。",
      "若功能與預期不同，提供店名與功能名稱請管理者核對。"
    ],
    "important": "員工權限與門市功能開通是兩個條件，都符合才可操作。",
    "success": "能確認目前方案與需要核對的功能。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "M01",
    "category": "health",
    "title": "如何查看顧客最近量測與歷史曲線？",
    "summary": "找到正確顧客並進入健康紀錄。",
    "path": "顧客管理 → 顧客資料 → 健康紀錄",
    "steps": [
      "找到正確顧客並進入健康紀錄。",
      "查看最近量測、完整數據與歷史曲線。",
      "需要查全店時，點「本店健康總覽」再依條件篩選。"
    ],
    "important": "健康紀錄的可見範圍受門市開通與身分驗證影響。",
    "success": "能找到該顧客的量測日期與資料。",
    "keywords": "體重 體脂 健康 曲線",
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
    "verification": "source-reviewed"
  },
  {
    "id": "M02",
    "category": "health",
    "title": "怎麼找某段期間或特定項目的量測？",
    "summary": "用顧客、日期與量測項目篩選。",
    "path": "本店健康總覽",
    "steps": [
      "用顧客、日期與量測項目篩選。",
      "查看列表中的日期、顧客及數值。",
      "點顧客進入完整健康紀錄；要重查可清除篩選。"
    ],
    "important": "先確認單位與日期，避免把不同指標當成同一數據比較。",
    "success": "列表只呈現指定篩選條件的紀錄。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "M03",
    "category": "health",
    "title": "健康歷史不見了，要先查什麼？",
    "summary": "確認門市、姓名、電話與登入身分是否一致。",
    "path": "顧客資料 → 健康紀錄",
    "steps": [
      "確認門市、姓名、電話與登入身分是否一致。",
      "清除日期篩選，確認是否仍有最近量測。",
      "提供最後看見紀錄的日期及目前畫面請支援核對。"
    ],
    "important": "不要重複建會員或以猜測數字補登；跨店歷史僅在符合驗證與權限時可見。",
    "success": "能提供明確範圍排查，保留現有紀錄。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "N01",
    "category": "digital",
    "title": "數位管家草稿怎麼修改與發布？",
    "summary": "選流程並編輯內容。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "N02",
    "category": "digital",
    "title": "顧客留言轉真人後，在哪裡追蹤？",
    "summary": "查看顧客需求與目前處理狀態。",
    "path": "數位管家名單",
    "steps": [
      "查看顧客需求與目前處理狀態。",
      "開啟名單核對顧客，指派負責人並更新進度。",
      "處理後回查狀態，避免不同人重複跟進。"
    ],
    "important": "名單狀態不代表已完成實際對話，仍需確認聯絡結果。",
    "success": "負責人與處理進度清楚可查。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "J01",
    "category": "spa",
    "title": "服務名稱、價格與時間在哪裡設定？",
    "summary": "選療程，修改名稱、規格、售價與服務時間。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "J03",
    "category": "spa",
    "title": "美容床、美甲桌或服務位置怎麼新增？",
    "summary": "輸入可辨識的位置名稱。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "J04",
    "category": "spa",
    "title": "怎麼看芳療師當日排程與空檔？",
    "summary": "選排程日期，依需要切換 15 或 30 分鐘間隔。",
    "path": "預約排程",
    "steps": [
      "選排程日期，依需要切換 15 或 30 分鐘間隔。",
      "查看服務人員的預約與空白時段。",
      "點預約看摘要；新增前先核對服務與可承接人員。"
    ],
    "important": "時間顯示間隔與療程實際占用時間不同。",
    "success": "能辨識指定日期的預約位置與空檔。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "J07",
    "category": "spa",
    "title": "多人同行選不同服務，怎麼安排？",
    "summary": "選顧客與時間，逐位設定需要的服務。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "J08",
    "category": "spa",
    "title": "人員或服務位置衝突時怎麼處理？",
    "summary": "讀取衝突提示，確認是人員還是服務位置。",
    "path": "預約排程 → 預約面板",
    "steps": [
      "讀取衝突提示，確認是人員還是服務位置。",
      "核對服務與整理時間所占用的完整區間。",
      "改用可用的人員、位置或時段後，重新核對摘要再送出。"
    ],
    "important": "空白格不一定足以容納整段服務時間，不應忽略衝突提示。",
    "success": "送出成功且沒有重疊排程。",
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
    "verification": "source-reviewed"
  },
  {
    "id": "J09",
    "category": "spa",
    "title": "服務人員請假，怎麼調整？",
    "summary": "選人員與日期，選整天請假、時段請假或臨時加班。",
    "path": "人員管理 → 請假／臨時加班",
    "steps": [
      "選人員與日期，選整天請假、時段請假或臨時加班。",
      "依類型填起訖時間與原因。",
      "有既有預約時先安排更換芳療師，再儲存例外並查排程。"
    ],
    "important": "請假不應直接讓已預約顧客失去安排，先核對既有預約。",
    "success": "班表例外與當日排程一致。",
    "keywords": "請假 代班 換班 臨時加班",
    "details": [],
    "modules": [
      "spa"
    ],
    "permission": "duty.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/spa-schedule/workspace.tsx",
      "src/app/(dashboard)/dashboard/spa-resources/workspace.tsx",
      "src/app/(dashboard)/dashboard/plans/_components/treatment-workspace.tsx"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "L01",
    "category": "support",
    "title": "找不到按鈕或畫面跟教學不同怎麼辦？",
    "summary": "確認使用的是時段預約、SPA 服務或其他模組。",
    "path": "操作指南／目前功能頁",
    "steps": [
      "確認使用的是時段預約、SPA 服務或其他模組。",
      "核對門市、登入角色、方案及目前紀錄狀態。",
      "若仍不同，保留畫面與功能名稱請支援核對。"
    ],
    "important": "不同模組不能共用所有操作步驟；未開放功能不會因教學而取得權限。",
    "success": "能指出差異發生在哪個頁面與身分。",
    "keywords": "沒有按鈕 教學不同 操作問題",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "",
    "feature": null,
    "sources": [
      "src/lib/permissions.ts",
      "src/lib/mvp-hidden-features.ts"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "L02",
    "category": "support",
    "title": "畫面一直讀取或儲存失敗怎麼辦？",
    "summary": "先保留未儲存文字與錯誤提示。",
    "path": "目前操作頁",
    "steps": [
      "先保留未儲存文字與錯誤提示。",
      "到紀錄頁核對是否已成功，避免連續重複按送出。",
      "確認網路後重試；持續失敗時記下門市、時間及操作步驟。"
    ],
    "important": "收款、發訊息或預約請先核對結果，再決定是否重送。",
    "success": "未儲存內容保留，能確認結果或提供支援資訊。",
    "keywords": "卡住 讀取中 失聯 儲存失敗",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "",
    "feature": null,
    "sources": [
      "src/lib/permissions.ts",
      "src/lib/mvp-hidden-features.ts"
    ],
    "verification": "source-reviewed"
  },
  {
    "id": "L03",
    "category": "support",
    "title": "要請客服協助，提供什麼資訊最快？",
    "summary": "整理店名、發生時間、功能名稱與預期結果。",
    "path": "目前操作頁 → 聯繫支援",
    "steps": [
      "整理店名、發生時間、功能名稱與預期結果。",
      "附錯誤訊息及去除不必要個資的畫面。",
      "說明是否已送出、是否重試，以及紀錄目前的狀態。"
    ],
    "important": "不要提供密碼、驗證碼、完整銀行資料或不相關的顧客資訊。",
    "success": "支援能重現問題並定位到正確操作。",
    "keywords": "客服 求助 回報 錯誤",
    "details": [],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "",
    "feature": null,
    "sources": [
      "src/lib/permissions.ts",
      "src/lib/mvp-hidden-features.ts"
    ],
    "verification": "source-reviewed"
  }
];
