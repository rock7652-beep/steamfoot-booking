import { planActivationGuideDetail } from "./operation-guide-plan-activation";
import {retiredSpaCatalogGuides} from "./operation-guide-retired-spa";
import type { OperationGuide, GuideCategory } from "./operation-guide-types";

/** Source-reviewed content; draft updates and interaction verification remain separate. */
const catalogGuideCategories: GuideCategory[] = [
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
      "/dashboard/settings/duty",
      "/dashboard/image-announcements"
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
    "id": "inventory",
    "label": "進銷存",
    "routes": [
      "/dashboard/inventory"
    ]
  },
  {
    "id": "work-orders",
    "label": "工單管理",
    "routes": [
      "/dashboard/work-orders"
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

export const guideCategories = catalogGuideCategories.filter(category => category.id !== "spa");

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
    "summary": "從新增預約右側視窗選顧客、日期、人數與可用時段；窄畫面會自動重排，未儲存內容不因尺寸切換消失。",
    "path": "預約管理 → 新增預約／當日清單 → 新增預約",
    "steps": [
      "點頂部或當日清單的新增預約，右側視窗先顯示已知日期與表單，再載入可用顧客、方案與時段。",
      "搜尋並選對顧客，核對方案、體驗或補課資格；選日期、人數與可用時段，人數改變後重新檢查容量。",
      "成功後視窗關閉、清單更新；回查顧客、時間與人數，避免重複建立。"
    ],
    "important": "人數變更後若原時段容量不足，需要重新選時段。",
    "success": "當日清單出現正確的預約，沒有重複新增。",
    "keywords": "代約 新預約 新增 右側視窗 新增補課 未儲存 日期保留 iPad 手機 窄畫面 載入 重試",
    "details": [
      "已知摘要會先顯示；時段、方案與容量等仍須等最新資料載入。顯示讀取失敗時先重試，不要憑舊畫面送出。",
      "新增補課沿用同一右側表單，仍需有效補課資格。",
      "旋轉、縮放或切換預覽尺寸不應清除草稿；未儲存關閉會先詢問，送出中不能關閉，失敗保留輸入。",
      "容量、方案、值班與權限仍由原流程檢查；跨店唯讀不能新增。"
    ],
    "modules": [
      "steamfoot"
    ],
    "permission": "booking.create",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/bookings/steam-booking-drawer.tsx",
      "src/server/actions/steam-booking-form.ts",
      "src/app/(dashboard)/dashboard/bookings/new/booking-form.tsx",
      "src/components/operations/panel-read-cache.tsx",
      "src/server/actions/booking.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "從新增預約右側視窗選顧客、日期、人數與可用時段；窄畫面會自動重排，未儲存內容不因尺寸切換消失。"
  },
  {
    "id": "A05",
    "category": "booking",
    "title": "怎麼查看當日預約、狀態並直接聯絡顧客？",
    "summary": "依月份與日期查看精簡清單、狀態、統計與顧客聯絡方式；手機、平板與舊 iPad 會用緊湊版面保留主要操作。",
    "path": "預約管理",
    "steps": [
      "在上方選月份與日期；手機篩選會獨立成一列，月曆與名單只在自己的區塊捲動。",
      "點月曆日期開啟當日清單，依統計與圖例辨識預約中、已完成、未到、補課及待收款；再用姓名／電話、人員或未收款篩選。平板窄欄會改為緊湊列，不必縮放整頁。",
      "名單優先顯示顧客、時間、方案及主要狀態；點電話旁的撥打聯絡顧客。要處理預約時可開該列詳情，或從「⋯」直接選購買方案、改時間、未到、取消；方案預約另可切單次。",
      "關閉後留在原月份與篩選；月曆圖例旁可看最後更新時間並按手動更新。"
    ],
    "important": "「撥打」只開啟裝置的電話功能，不會改預約狀態；沒有電話時顯示「未留電話」。",
    "success": "當日清單顯示正確預約；點電話不會誤開詳情或更改資料。",
    "keywords": "月曆 今天 明天 查詢 今日預約 當日預約 精簡清單 緊湊名單 舊iPad 平板 所屬店長 顧客電話 直接撥打 未留電話 預約中 已完成 未到 補課 未收款 狀態統計 手機 篩選獨立一列 管理時段 剩餘堂數 方案名稱 到期日 方案待核對 無到期限制 更多操作 購買方案 單次 改時間 取消預約",
    "details": [
      "手機與 iPad 窄寬度會重排月份、篩選與主要操作；平板橫直向及舊 iPad 會優先壓縮欄距與文字，月曆、聯絡、方案、備註與時段管理不得因版面縮小消失。",
      "點電話不會開詳情或改狀態；號碼錯誤請回顧客資料修正。所屬店長顯示帳號的店內名稱，不能據此改派顧客。",
      "未收款篩選包含待處理體驗與單次預約。自動更新目前為每 60 秒，編輯、批次或個別操作期間可能暫停。",
      "月曆待到店的逐人方案摘要會顯示「剩 X 堂・方案名稱・到期日」，不再只顯示預留 1 堂；沒有到期限制會明列「無到期限制」。這是顯示恢復，內部仍保留本次預約，另按完成才正式扣堂，不能把剩餘堂數都當成可再預約堂數。",
      "摘要顯示「方案待核對」或「到期日待確認」時，先開原預約與方案核對，不當成零堂、無期限或已扣堂。已完成者另顯示已扣 1 堂；同組多人摘要以分隔顯示，體驗待處理與方案扣堂分開看。",
      "「⋯」只縮短進入既有操作的路徑，仍會讀取權威明細並顯示原確認畫面；購買方案、切換單次、改時間、未到與取消都不會因點選選單就直接送出。可見項目依預約類型、狀態與權限顯示。"
    ],
    "modules": [
      "steamfoot"
    ],
    "permission": "booking.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/bookings/booking-calendar-desktop.tsx",
      "src/app/(dashboard)/dashboard/bookings/day-detail-panel.tsx",
      "src/app/(dashboard)/dashboard/bookings/bookings-manager.tsx",
      "src/app/(dashboard)/dashboard/bookings/booking-layout.module.css",
      "src/server/queries/booking.ts",
      "src/lib/booking-plan-expiry.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "切換月份與日期查看精簡清單、狀態與統計；需要聯絡時直接點顧客電話旁的「撥打」，不必先開預約詳情。"
  },
  {
    "id": "A06",
    "category": "booking",
    "title": "服務完成前，要核對哪些資料？",
    "summary": "完成服務會影響堂數與收款紀錄。送出前要核對顧客、實際到店人數、方案與付款狀態。",
    "path": "預約管理 → 當日名單 → 收款／預約明細",
    "steps": [
      "核對顧客、實到人數、方案、到期日與付款狀態。",
      "待到店且未收款的體驗／單次預約可點名單收款；左側完成圈也會先進入收款確認。",
      "等待完整明細；巢狀收款／確認視窗會顯示在最上層，再核對金額、方式與必要的多人實到人數。",
      "有收款權限才可確認；成功後回查預約、收款與扣堂紀錄，堂數提醒另於背景處理。"
    ],
    "important": "完成服務可能影響收款與堂數；顯示正在確認或暫時無法確認時先查看最新狀態，不要重複送出。",
    "success": "預約、實際到店、收款與扣堂紀錄一致；需要發送的堂數提醒另於背景處理。",
    "keywords": "完成 結帳 收款並完成 當日名單 未收款 單次 多人實到 背景同步 正在確認 堂數提醒 最上層 Escape 返回",
    "details": [
      "快捷入口仍需既有確認，不因點一次就自動扣款。查看模式、已收款、已完成／取消／未到不提供入口。",
      "巢狀視窗按 Escape 只關閉最上層；取消會回原視窗且不送出。顯示正在確認時不能關閉，避免不確定結果下重複操作。",
      "結果不明先查最新狀態，避免重送。低堂數／最後一堂 LINE 提醒在背景派送；完成成功不等於訊息送達，通知失敗不回滾服務。"
    ],
    "modules": [
      "steamfoot"
    ],
    "permission": "booking.update",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx",
      "src/app/(dashboard)/dashboard/bookings/new/booking-form.tsx",
      "src/app/(dashboard)/dashboard/bookings/no-show-modal.tsx",
      "src/components/admin/modal-panel.tsx",
      "src/hooks/use-responsive-action.ts",
      "src/server/actions/booking.ts",
      "src/server/services/session-balance-notifications.ts"
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
      "先看是否顯示正在儲存、正在確認最新狀態或暫時無法確認；保留未儲存內容。",
      "點查看最新狀態或使用清單手動更新，重新核對該筆預約。",
      "若仍不一致，記下日期、顧客及操作時間再聯繫支援。"
    ],
    "important": "畫面會先呈現預期狀態，再由伺服器確認；被拒絕會恢復原狀，結果不明時會鎖住該操作。先查紀錄，避免重複預約或收款。",
    "success": "看到已確認最新狀態，或重新讀取後能判斷上次操作是否成功。",
    "keywords": "刷新 重新整理 卡住 更新 正在確認最新狀態 暫時無法確認 查看最新狀態 連線中斷 回復原狀",
    "details": ["明確失敗會恢復原畫面；網路中斷等未知結果會先自動查核，不能把暫時顯示的完成狀態直接當成最終成功。", "同一筆操作查核完成前會被阻擋；不要另開視窗重做。交易、預約與通知各自有紀錄，應回原紀錄確認。", "當日名單會背景更新；重新讀取失敗時保留原清單並顯示重試。沒有方案或交易查看權限的人仍可能查看授權名單，但剩餘堂數及收款資訊會依權限省略，不能當作零堂或未收款。"],
    "modules": [
      "steamfoot"
    ],
    "permission": "booking.read",
    "feature": null,
    "sources": ["src/app/(dashboard)/dashboard/bookings/day-detail-panel.tsx", "src/server/actions/booking-refresh.ts", "src/server/actions/slots.ts", "src/lib/booking-client-transport.ts", "src/app/(dashboard)/dashboard/bookings/booking-action-feedback.tsx"],
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
    "summary": "顧客視窗先顯示姓名、標籤、基本資料與重要備註；需要修改時再展開編輯，儲存後同一位顧客與清單同步更新。",
    "path": "顧客管理 → 點選顧客 → 編輯基本資料",
    "steps": [
      "從顧客清單開啟正確顧客，先核對姓名、標籤、所屬資訊與基本資料摘要。",
      "點基本資料的編輯入口，修改需要更正的欄位後儲存；送出中不要關閉或連按。",
      "留在同一位顧客核對更新後資料，再核對背景清單的姓名、電話或備註已同步。"
    ],
    "important": "更正聯絡資料不等於重新綁定 LINE；若遇到電話衝突，保留提示再處理。",
    "success": "目前顧客視窗與背景清單都顯示正確資料，搜尋與篩選仍保留。",
    "keywords": "名字 手機 更正 編輯 顧客右側視窗 基本資料 摘要 標籤 重要備註 清單同步 保留搜尋 保留篩選 重新整理",
    "details": [
      "儲存成功會失效並重讀目前顧客，再在背景更新清單；不必關閉重開，也不要因短暫舊值重複修改。",
      "關閉顧客視窗只移除目前顧客參數，不會清掉原搜尋、分頁或篩選；瀏覽器上一頁／下一頁可依網址重開對應顧客。",
      "總部跨店查看為唯讀，不會顯示編輯。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "customer.update",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/customers/_components/customers-list-with-drawer.tsx",
      "src/app/(dashboard)/dashboard/customers/_components/customer-detail-drawer-content.tsx",

    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "先從顧客摘要核對本人，再進基本資料編輯；儲存後同一位顧客與清單同步更新，但不會自動更換 LINE 綁定。"
  },
  {
    "id": "C04",
    "category": "customers",
    "title": "哪裡可以看顧客的預約與消費紀錄？",
    "summary": "顧客視窗把預約與消費收在過往紀錄；先看摘要，需要時再展開篩選與完整明細。",
    "path": "顧客管理 → 顧客資料 → 過往紀錄",
    "steps": [
      "打開顧客資料，找到「過往紀錄」並展開需要的預約或消費區塊。",
      "先核對摘要；需要完整查找時再進階查看。消費可選期間、類型、付款方式或輸入品項文字。",
      "核對篩選後的筆數與合計，再查看方案、零售、服務、退款或其他收入明細。",
      "需要更多資訊時，開啟對應預約、交易或現金收支明細。"
    ],
    "important": "預約次數與消費筆數不同；只有已關聯此顧客的店內收入才會出現在消費紀錄。",
    "success": "",
    "keywords": "歷史 歷次 過往紀錄 展開 進階查看 消費 紀錄 篩選 合計 方案 零售 服務 退款 付款方式",
    "details": [
      "方案交易、退款與店內手動收入會依各自日期合併排序；支出不列為顧客消費。",
      "店內收入若未選關聯顧客，不會事後依姓名或備註猜測歸戶。",
      "蒸足多人首次體驗按每位已完成者計入本人到店紀錄與最近到店日，不必等整組結束；未建檔同行不會冒用預約人的紀錄。已服務後退款也不會抹掉服務事實。"
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
      "src/app/(dashboard)/dashboard/customers/[id]/records/customer-consumption-filters.tsx",
      "src/server/queries/customer-list-helpers.ts",
      "src/server/queries/booking-participant-facts.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "顧客資料頁分開列出預約與消費紀錄；消費可依期間、類型、付款方式及文字篩選。"
  },
  {
    "id": "C05",
    "category": "customers",
    "title": "店內備註和本次預約備註有什麼不同？",
    "summary": "店內／服務備註會放在顧客的重要備註區，保留長期需求；本次預約備註只記錄這一次的交代。",
    "path": "顧客資料／預約明細",
    "steps": [
      "長期服務需求放在顧客的店內／服務備註。",
      "僅本次服務要注意的事情，放在預約的本次備註。",
      "修改後先核對畫面預覽，再以成功訊息與重新開啟結果確認已儲存；避免把一次性事項留在長期備註。"
    ],
    "important": "例如「今天晚到」適合本次備註；不要把敏感資訊寫進不必要的欄位。",
    "success": "",
    "keywords": "註記 長期 晚到 備註 重要備註 待儲存預覽",
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
    "summary": "店家先查正確門市的既有顧客、方案效期與本店 LINE 確認；看不到方案不一定是資料消失。",
    "path": "顧客管理 → 顧客資料 → LINE 與通知設定",
    "steps": [
      "確認顧客開啟的是正確門市入口。",
      "在後台顧客詳情核對持有方案名稱、效期及歷史狀態；過期方案不會因重新登入恢復。",
      "用原本電話查找舊資料，核對預約、方案與 LINE 綁定。",
      "會員登入仍有問題時，保留錯誤畫面、時間與查核編號，再查本店顧客姓名、電話及原登入關係；不要新增同名顧客或重發方案。只有後台確實列出待確認申請時，才按申請核對本人處理。",
      "在「本店會員與 LINE」分開看會員資料、登入、通知。若是「會員登入待確認」，由具顧客修改權限者核對本人、手機與同一組確認碼，再選「已核對本人與確認碼，允許重新登入」；不要按「確認通知連結」代替登入授權。"
    ],
    "important": "不要先新增同名顧客或重發方案，避免把資料分散到另一個身分。",
    "success": "",
    "keywords": "登入 找不到 舊資料 LINE 綁定 已有會員 重新註冊 暫時無法使用 登入逾時 已過期 歷史方案 收合 展開 本店會員與LINE 已核對本人 確認綁定 首次會員登入 登入前持續有效 撤銷登入授權 會員登入待確認 允許重新登入 已授權 登入連結已恢復",
    "details": [
      "後台查到方案仍須核對顧客身分、所屬門市與資格。查看歷史不會恢復效期、增加堂數或改變扣堂規則。",
      "顯示「您已有會員帳號」時，請使用原本的 LINE 登入方式，或聯繫店家核對；不要另建帳號。",
      "顯示「會員資料需要店家協助確認」屬於身分核對，不需要重新註冊或解除 LINE 綁定。",
      "顯示「服務暫時無法使用」不代表是新客；保留畫面與時間，稍後再試或聯繫店家。只有「登入已逾時」才依提示重新從 LINE 開啟。",
      "公開體驗後已買方案但首次會員登入受阻時，先核對同一筆本店顧客與確認狀態。尚無帳號或 LINE 關聯的新學員，須姓名及手機都符合唯一既有名單才能首次連結；已有帳號、通知綁定或身分衝突須另核對，不以電話直接覆蓋。",
      "蒸足一般聊天室手機綁定只設定本店通知對象，不建立或移轉登入帳號；通知設定完成不代表會員登入已恢復。只有精確本人核對的登入授權才可持續有效到使用或撤銷；一般舊授權及通知確認不因此延長，也不能拿過期通知確認推定可登入。",
      "登入顯示「已授權，等待顧客重新進入並完成登入」時，只完成店家核對；「登入連結已恢復，尚需顧客確認實際登入」也不是已成功登入證明。請顧客確認實際結果，不要重發方案。尚未核對的申請仍有 24 小時期限，過期須重新提交、核對新碼；已精確核對的登入授權則顯示「已核對，登入前持續有效；等待顧客完成登入」，不因等待天數失效。這不代表所有舊過期授權都恢復。"
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
      "src/server/services/verified-line-customer.ts",
      "src/components/admin/store-member-connection-panel.tsx",
      "src/server/services/store-member-connection.ts",
      "src/server/services/liff-login-rebind.ts",
      "src/server/services/precreated-first-line-login.ts",
      "src/server/services/liff-review-diagnostic.ts",
      "src/server/services/liff-login-recovery.ts",
      "src/server/actions/store-member-connection.ts",
      "src/app/api/line/webhook/route.ts"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "在後台核對既有顧客與方案，再查本店會員及 LINE 確認；不要先新增顧客或重發方案。"
  },
  {
    "id": "C08",
    "category": "customers",
    "title": "顧客換 LINE 或綁定有衝突怎麼辦？",
    "summary": "先分清中央會員身分、本店會員連結與接收通知的 LINE；有衝突時核對本人及原資料，不能只憑同名合併或重綁。",
    "path": "顧客管理 → 顧客資料 → 本店會員與 LINE／管理 LINE 綁定",
    "steps": [
      "先核對顧客本人、電話、中央會員身分、本店會員連結及目前通知綁定紀錄。",
      "蒸足一般聊天室手機通知綁定不再要求會員確認碼；先查本店電話與通知結果。只有後台列出待確認申請時，才由具顧客修改權限者核對本人、電話及該申請確認碼：會員登入選「已核對本人與確認碼，允許重新登入」，LINE 通知選「已核對本人，確認通知連結」。更換既有有效 LINE 另走具重新綁定權限的管理流程。",
      "依畫面處理；無法唯一確認身分時，整理資料請支援協助。"
    ],
    "important": "不能因為同名就直接移轉身分；重新綁定不等於新建會員。",
    "success": "",
    "keywords": "換帳號 重綁 衝突 中央會員 本店會員連結 首次確認 通知綁定 登入身分 會員資料需要店家協助確認 本店會員與LINE 確認碼 已核對本人 確認綁定 已連結 確認通知連結 允許重新登入 登入確認申請已過期 登入前持續有效 撤銷登入授權",
    "details": [
      "中央會員、本店會員連結與接收通知的 LINE 不一定是同一件事。門市核對同一人後可沿用唯一既有會員，不另建重複帳號；同一位換 LINE 時只更新本店連結，不覆蓋其他店或刪除原登入帳號。",
      "一般聊天室手機匹配只設定本店通知對象，不建立或移轉登入帳號；收到「通知設定完成」也不代表會員登入已恢復。後台申請確認成功後直接顯示已連結，仍不等於實際送達。申請逾時、電話已變更、多人身分衝突或 LINE 屬於本店別人時仍會阻擋。",
      "登入受阻時保留查核編號與發生時間供支援核對；重試只重新驗證，不能核准身分、延長過期授權或保證個案已修好。",
      "若顯示「您的會員資料需要店家協助確認」，請聯繫店家，不需要重新註冊或解除 LINE 綁定；不要把身分衝突當成暫時連線問題反覆重試。",
      "登入申請與通知申請分開核對，確認其中一種不代表另一種完成。尚未核對的登入確認申請已過期時，重新取得申請及確認碼；精確已核對授權持續到完成登入或撤銷，每次仍檢查本人 LINE、手機、門市與原登入快照。需要終止時由具重新綁定權限者在進階綁定狀態選「撤銷登入授權」，確認後核對「會員登入授權已撤銷」。一般通知連結與舊限時重新綁定不套用此永久等待規則，不用舊畫面反覆確認。"
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
      "src/app/(dashboard)/dashboard/customers/[id]/line-binding-section.tsx",
      "src/server/services/liff-login-recovery.ts",
      "src/lib/liff/messages.ts",
      "src/components/admin/store-member-connection-panel.tsx",
      "src/server/actions/store-member-connection.ts",
      "src/server/services/store-member-connection.ts"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "先分清中央會員、本店連結與通知 LINE，再由有權限的人員核對本人處理；不能只憑同名或同電話合併。"
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
    "details": [
      "若方案是誤建且尚未使用，可從原交易依權限取消；只有不增減金額與堂數的零效果紀錄不會誤判成另一個方案來源。仍有其他購買、退款、堂數調整或已使用／預約時，系統會阻擋，先核對方案明細。"
    ],
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
    "summary": "顧客摘要先列有效方案與剩餘；要看已預約、可再預約、效期或逐堂狀態，再從該卡的管理入口展開。",
    "path": "顧客管理 → 顧客資料 → 方案",
    "steps": [
      "找到顧客目前有效方案摘要，核對方案名稱、剩餘與到期日。",
      "點該方案的管理入口，分別查看已預約、可再預約、效期與堂數明細。",
      "有多張方案時逐張核對，不只看合計。"
    ],
    "important": "已預約堂數占用可預約額度；畫面提示明細不一致時先查紀錄。",
    "success": "",
    "keywords": "持有方案 方案摘要 管理方案 剩餘 可用 可預約 效期",
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
      "此題說明蒸足方案的待確認收款；課程方案核帳依課程營運入口處理，不混用交易。",
      "送出購買申請時還不會開通堂數。確認失敗或顯示已處理時，先查原交易及方案，不要重新指派或再建訂單。"
    ],
    "modules": [
      "steamfoot"
    ],
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
    "summary": "三個模組共用同一組記帳欄位；收入分零售／其他，可依月份、類型或關鍵字回查，讀取失敗可在原面板重試。",
    "path": "營運 → 現金抽屜 → 記一筆收支",
    "steps": [
      "開啟現金抽屜，點「記一筆收支」；新增時預設選零售收入並直接顯示顧客欄位，需要補登其他日期時先選正確日期。",
      "選零售收入、其他收入或支出並填金額；收入可搜尋並選擇關聯顧客，再填商品或收入項目。",
      "選實際付款方式、填必要備註後儲存；回明細可用月份、收支類型及顧客／電話／項目／備註搜尋核對。"
    ],
    "important": "預設零售收入只是方便開始輸入，不代表系統已判斷分類；非零售請先改成其他收入或支出。非現金收支與抽屜現金不同，付款方式要如實填寫。",
    "success": "收支明細出現正確紀錄。",
    "keywords": "支出 收入 記帳 操作視窗 現金抽屜 關聯顧客 消費項目 預設零售收入 零售分類 其他收入 補登日期 搜尋記帳 全部收入 提領 調整 顧客電話 備註 讀取失敗 重試 進銷存 連動 唯讀 新版運動 查看明細 返回清單 更多操作",
    "details": [
      "記帳時選零售收入會納入零售分析；選其他收入會納入其他收入分析。顧客姓名不影響分類。",
      "已結帳日期補登現金異動須依提示確認；補紀錄不會重算原本的關帳快照。",
      "搜尋框最多取前 60 字並短暫等待輸入完成；切換月份會清除自訂起訖日期，其他篩選可組合使用。",
      "面板讀取失敗時會保留原位置並提供重試；不要連按新增。由進銷存收付款建立的現金紀錄會標示來源，必須回原銷貨／進貨單處理，現金帳不可獨立修改或刪除。銷貨退貨、退款或作廢請依 O09；付款方式誤登或重複登收款請依 O10，收款更正本身不會退款給顧客。",
      "新版運動從課表「現金收支」開今日清單，該列「⋯」可查看明細；具權限且可編輯的一般收入／支出才顯示編輯或刪除。明細按「返回清單」不新增紀錄，補登其他日期到完整現金管理。預約與方案現金已計入抽屜，不再手動重記。"
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
      "src/app/(dashboard)/dashboard/cashbook/_components/cashbook-entry-fields.tsx",
      "src/app/(dashboard)/dashboard/cashbook/_components/cashbook-record-filters.tsx",
      "src/app/(dashboard)/dashboard/cashbook/_components/quick-cashbook.tsx",
      "src/app/(dashboard)/dashboard/cashbook/page.tsx",
      "src/app/(dashboard)/dashboard/inventory/settlement-form.tsx",
      "src/server/actions/cashbook.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "從現金抽屜登記一般收支，可關聯顧客並依月份、類型或關鍵字回查；讀取失敗在原面板重試，進銷存連動紀錄不可在現金帳重複修改。"
  },
  {
    "id": "E09",
    "category": "money",
    "title": "開店與閉店怎麼核對現金？",
    "summary": "開店與閉店都要填實際點到的現金；若有差額，記錄原因後再確認。",
    "path": "後台上方工具 → 現金抽屜 → 今日現金狀態",
    "steps": [
      "從四模組任何後台頁面上方點「現金抽屜」；系統會讀取目前門市的最新狀態。",
      "開店時輸入實際點到金額；若與帳面不同，填寫原因。",
      "營業中登錄收支、提領與補入現金。",
      "在今日現金狀態點「閉店點錢」，核對系統應有與實際金額，再完成閉店。"
    ],
    "important": "閉店後當日現金異動會鎖定，先完成登錄再閉店。",
    "success": "閉店實點、差額與下次開店起點均可查。",
    "keywords": "上方工具 現金抽屜 點錢 開店 閉店 對帳 任何頁面 彈窗",
    "details": [
      "現金抽屜彈窗每次以目前門市權威資料為準；切店、權限不足、唯讀查看或功能未開通時不能操作。",
      "送出中不可關閉；儲存只更新抽屜內容，外層頁面的草稿、篩選與位置應保留。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "cashDrawer.read",
    "feature": "cash_drawer",
    "sources": [
      "src/app/(dashboard)/dashboard/revenue/page.tsx",
      "src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-workspace.tsx",
      "src/components/cash-drawer-shortcut.tsx",
      "src/app/cash-drawer-panel/page.tsx"
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
    "summary": "提醒面板依通知對象分頁；顧客通知以完整設定列顯示，店長通知先選收件人，發送紀錄另有入口。",
    "path": "設定 → 通知與顧客經營 → 提醒管理",
    "steps": [
      "開啟提醒管理；桌機在設定側邊面板、手機在滿版面板操作。",
      "選顧客通知、店長通知或技師／老師／教練通知（依模組與門市稱呼顯示）；發送紀錄位於右側。顧客通知直接列出預約、關懷、方案，工單開通時才顯示取件提醒。",
      "店長通知先選「通知收件人」，再調整這位人員的個別開關；各列可展開預覽。開關各自儲存，數位管家不受個人 LINE 偏好影響。顧客通知一次展開一列，切換時保留草稿；文字須儲存才生效，取消會還原。實際發送結果另從發送紀錄查。"
    ],
    "important": "顧客與店長是不同收件對象；開啟前先核對。預覽按鈕不跳轉業務操作、不發 LINE，不需為了看樣式建立真實預約或收款。",
    "success": "各分頁的設定符合預期。",
    "keywords": "LINE 通知 開關 提醒 設定側邊面板 顧客提醒 店長通知 工單待取件 發送紀錄 提醒類型 下拉選單 預約前 體驗後 方案使用 查看訊息預覽 通知類型 通知分類 設定提醒 收合 精簡列 Email 額度 Flex 示範資料 9種",
    "details": [
      planActivationGuideDetail,
      "編輯列收合時會保留草稿；切換分頁或關閉面板前，請先儲存需要保留的內容。正在儲存時，切換或關閉會先阻擋。一般表單依序送出；店長通知的不同個別開關各自儲存，只鎖定正在處理的同一項。若失敗會保留未送出的畫面值並顯示錯誤，不要把畫面切換當成成功。顯示摘要不等於已送出任何通知。",
      "蒸足的店長預覽列出 9 種示範：當日新預約、新體驗預約、VIP 續購需求、數位管家新名單、要求真人客服、真人客服催辦、待確認付款、服務未完成、每日待辦摘要。實際發送仍依門市業務事件與收件人偏好，不會因切換預覽而啟用。",
      "預覽類型數不等於個別開關數；真人客服催辦共用「要求真人客服」開關。運動／音樂店長預覽是適用的 7 種，入口與差異見 C123。",
      "預覽只供查看卡片內容與風格；實際 LINE 排版、門市及按鈕目的地仍須在 LINE 核對，不能以預覽代替送達驗收。",
      "店長通知的進階區另有 LINE 額度 Email 通知；它寄給本店啟用中老闆的登入信箱，與下方店長 LINE 綁定及個別提醒開關不同，操作見 F13。",
      "切換提醒分頁只讀該分頁需要的資料；畫面保留讀取回饋，關閉設定視窗會回原設定位置，不必等待整個後台重新載入。空白或讀取中不代表設定被刪除。"
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
      "src/app/(dashboard)/dashboard/reminders/line-notification-recipients-card.tsx",
      "src/app/(dashboard)/dashboard/reminders/manager-notification-preview.tsx",
      "src/lib/manager-notification-preview.ts",
      "src/lib/manager-notification-preferences.ts",
      "src/app/(dashboard)/dashboard/reminders/reminder-section-picker.tsx",
      "src/app/(dashboard)/dashboard/reminders/line-quota-email-setting.tsx",
      "src/app/(dashboard)/dashboard/reminders/reminder-panel-reader.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "顧客提醒、店長通知與發送紀錄分開；修改其中一邊不代表另一邊已開啟，也不代表訊息已送達。"
  },
  {
    "id": "F03",
    "category": "care",
    "title": "當日臨時預約，要怎麼通知店長？",
    "summary": "蒸足的當日預約店長通知需開啟對應設定，並確認收件人已完成 LINE 綁定。",
    "path": "提醒管理 → 店長通知",
    "steps": [
      "在店長通知找到正確收件人，確認 LINE 已綁定並開啟「接收 LINE 通知」。",
      "選擇「通知收件人」，核對這位人員的「當日新預約」開關；變更後等待「已儲存」。",
      "要看卡片樣式時展開「當日新預約」列的「預覽」；實際發送結果從發送紀錄核對。"
    ],
    "important": "接收人需完成本店 LINE 綁定；示範預覽不發送通知，也不能測試綁定或送達，不要為看樣式新增真實預約。",
    "success": "開關與收件人正確，能追查通知結果。",
    "keywords": "當天 臨時預約 店長通知 當日新預約 查看訊息預覽 通知類型 Flex 示範資料",
    "details": [
      "新版當日新預約店長通知使用 Flex 卡片。預覽按鈕僅展示，不會跳轉；實際卡片需另核對正確門市與預約連結。",
      "預覽不改變觸發規則。此當日通知針對蒸足顧客自行預約今天的服務；共用預覽不代表各模組都會發送。課程店另有自己的當日新預約通知，設定入口見 C123。開啟設定不會把任意舊預約重新發送。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "business_hours.manage",
    "feature": "line_reminder",
    "sources": [
      "src/app/(dashboard)/dashboard/reminders/page.tsx",
      "src/app/(dashboard)/dashboard/reminders/line-notification-recipients-card.tsx",
      "src/app/(dashboard)/dashboard/reminders/manager-notification-preview.tsx",
      "src/lib/manager-notification-preferences.ts",
      "src/server/services/same-day-booking-manager-notification.ts",
      "src/server/services/manager-notification-delivery.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "蒸足的當日預約店長通知需開啟對應設定，並確認收件人已完成 LINE 綁定。"
  },
  {
    "id": "F04",
    "category": "care",
    "title": "LINE 沒收到通知，先檢查什麼？",
    "summary": "先找發送紀錄：沒有紀錄時查是否符合觸發條件；有失敗紀錄時依錯誤原因處理。",
    "path": "提醒管理 → 發送紀錄",
    "steps": [
      "用發送紀錄確認該訊息是成功、失敗還是尚未發送。",
      "核對正確門市、通知規則、發送時間及收件身分；店長通知再查該收件人的 LINE 綁定、接收總開關與個別偏好。",
      "若失敗，保留原因，檢查綁定與官方帳號狀態後處理；收到 LINE 額度 Email 時，另確認是分店或共用 LINE、剩餘額度及每日失敗摘要。"
    ],
    "important": "沒有紀錄與發送失敗不是同一件事；不要直接重複發送。預覽看起來正確或發送紀錄顯示成功，不代表本人已在 LINE 看見或點過連結。",
    "success": "",
    "keywords": "收不到 漏發 失敗 紀錄 體驗預約 通知尚未完成 LINE 額度 Email 80% 95% 用完 每日失敗摘要 共用LINE 分店LINE 通知已連結 店長 Flex 文字 重試 保存卡片 收件人偏好 登入前持續有效 撤銷登入授權 會員登入待確認 確認通知連結 允許重新登入 LINE 通知設定完成 簡短回覆",
    "details": [
      "新版店長自動通知的 9 種店務事件使用 Flex 卡片；系統重試沿用該次已保存的卡片內容。舊紀錄若沒有保存卡片，仍以原文字重試，所以舊通知顯示文字不一定是異常。",
      "上述卡片範圍是當日新預約、新體驗預約、VIP 續購需求、數位管家新名單、真人客服要求與催辦、待確認付款、服務未完成／出席待處理及每日待辦。週報、LINE 綁定回覆與顧客手動訊息不在此範圍；原觸發規則不因卡片樣式改變。",
      "課程顧客收到的改期、取消、確認會到與續購提醒是另一種用途，請看 C167；不要拿店長示範卡片測試顧客操作。",
      "公開體驗完成頁的「體驗預約成功」與 LINE 通知狀態是兩件事。若預約已成功但通知尚未完成，不要重複預約；先依 F12 核對完成頁顯示的狀態。",
      "加入官方 LINE、送出電話或開啟設定連結都不等於通知已成功。以完成頁的「LINE 通知已連結」、LINE 回覆「通知設定完成」及後續發送紀錄分別核對。",
      "通知設定完成不代表會員已能登入。蒸足顧客登入時若出現確認碼，請在顧客資料的「本店會員與 LINE」核對本人、手機及同一組確認碼，再按「已核對本人與確認碼，允許重新登入」。請顧客重新進入會員專區完成登入；後台顯示已授權時，仍不代表顧客已登入。",
      "尚未核對的登入申請逾時時，請顧客重新提交，由店家核對新的確認碼。透過會員登入確認完成本人核對後，指定 LINE 身分的授權會持續有效到完成登入，或由有權限人員撤銷；不因等待天數失效。不要反覆設定通知、重新註冊或解除原 LINE 綁定。",
      "後台的會員資料、登入與通知分列；「已核對本人，確認通知連結」只處理 LINE 通知，「允許重新登入」只授權登入恢復，兩者不能互相代替。工單待取件通知也不能把登入申請當成有效通知收件連結。",
      "若 LINE 對話當時正在回答數位管家問題，電話格式正確但選單不接受輸入時，系統會改回報綁定結果；不要因原選單錯誤就反覆送出電話。",
      "課程門市共用同一官方 LINE 時，通知連結仍須保留門市；未知好友或一般聊天不會猜門市、建立顧客或跨店綁定。",
      "蒸足一般聊天室直接送出手機可設定本店通知，不再要求會員確認碼；它只匹配唯一顧客並處理通知對象，不建立登入帳號。查無資料、同電話多筆或已有其他有效 LINE 時仍要店長核對，不能反覆重綁。",
      "後台的「會員已連結／本店通知尚未確認」是不同摘要，不能單憑文字推定本次登入成功或通知故障；仍核對發送紀錄與實際通道。工單本店 QR 連結及課程共享官方 LINE 保留自己的確認流程。",
      "蒸足一般手機通知綁定成功，現在簡短回覆「LINE 通知設定完成！」並提醒保持好友且未封鎖，不再附登入處理步驟；不是漏掉核准。通知成功不代表已登入，登入問題另外由後台核對本人，不反覆綁定通知。",
      "LINE 額度 Email 的每日失敗摘要是紀錄數，可能含重試，不等於未收到訊息的顧客人數。寄信服務接受、發送紀錄成功與本人實際收信／閱讀仍是三件事；操作見 F13。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "business_hours.manage",
    "feature": "line_reminder",
    "sources": [
      "src/app/(dashboard)/dashboard/reminders/page.tsx",
      "src/app/(dashboard)/dashboard/reminders/trial-care-card.tsx",
      "src/app/api/line/webhook/route.ts",
      "src/app/pricing/experience/zhubei/book/zhubei-trial-booking-form.tsx",
      "src/server/services/configured-course-line-webhook.ts",
      "src/server/services/manager-notification-delivery.ts",
      "src/lib/manager-notification-preferences.ts",
      "src/app/(dashboard)/dashboard/reminders/manager-notification-preview.tsx",
      "docs/manager-line-flex-inventory.md",
      "src/components/admin/store-member-connection-panel.tsx",
      "src/server/services/liff-login-recovery.ts",
      "src/server/services/store-member-connection.ts",
      "src/server/services/work-order-ready-notification.ts",
      "src/app/(dashboard)/dashboard/reminders/line-quota-email-setting.tsx",
      "src/server/services/line-quota-monitor.ts"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "先找發送紀錄：沒有紀錄時查是否符合觸發條件；有失敗紀錄時依錯誤原因處理。"
  },
  {
    "id": "F06",
    "category": "care",
    "title": "如何啟用體驗後自動關懷？",
    "summary": "啟用並儲存後，符合條件的新完成體驗才會進入關懷流程；課程體驗要等課程結束且已完成，不會補發歷史資料。",
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
      "spa",
      "course"
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
    "summary": "已購買、待核帳或已有預約會依模組規則略過後續邀請；第一階段關心不受這些條件影響。",
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
      "已略過的階段不補發。訂單取消後，尚未到發送時間的階段仍依當時狀態判斷；課程另用自己的購買及預約紀錄。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
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
    "title": "如何處理待關懷、已安排與已處理的顧客？",
    "summary": "顧客經營依生日、體驗未轉換、久未回店及額度條件整理名單；可記錄結果、下次追蹤或直接開啟預約。",
    "path": "顧客經營",
    "steps": [
      "打開顧客經營，切換待關懷、已安排／已預約或已處理，核對關懷原因與近期紀錄。",
      "實際聯絡後記錄結果；需要稍後追蹤時設定下次日期，不要把手動聯繫結果當成已建立預約。",
      "需要安排服務時從同頁開啟本模組預約，完成後重新載入核對狀態。"
    ],
    "important": "名單是經營參考，不代表已自動完成聯絡。",
    "success": "",
    "keywords": "留存 久未到店 續約 回訪 生日祝福 體驗未轉換 下次追蹤 已安排 已預約 同頁預約",
    "details": [
      "生日依年度、關懷原因分開記錄；舊的一般聯繫紀錄不會自動視為今年生日已處理。",
      "有未來預約時顯示已預約；取消後重新依條件與追蹤日期判斷，實際完成回店後原條件會重新計算。",
      "蒸足與課程使用各自的預約、方案與權限規則；記錄祝福本身不會發送 LINE。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "customer.read",
    "feature": "customer_care",
    "sources": [
      "src/app/(dashboard)/dashboard/growth/_components/care-workspace.tsx",
      "src/server/queries/customer-care-activity.ts",
      "src/server/actions/customer-care-booking.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "先依狀態與原因核對顧客，再記錄實際聯繫、設定下次追蹤或用同頁預約；只有真正建立的預約才會顯示已預約。"
  },
  {
    "id": "G01",
    "category": "staff",
    "title": "新增後台人員時，角色與工作身分怎麼選？",
    "summary": "先在統一人員工作區建立後台帳號並選 Staff／Manager／Owner；教練、教師或芳療師是另一種工作身分，要另外設定與連結。",
    "path": "人員管理 → 新增人員",
    "steps": [
      "到左側「人員管理」選後台人員分頁，點「＋ 新增人員」，填姓名、手機、Email 與初始密碼。",
      "一般日常人員選 Staff；需管理店務與較多權限時由 Owner 評估 Manager；只有實際店主才選 Owner。",
      "建立後在同一編輯視窗切到「後台帳號／權限」，核對角色與細項權限；需要教練、教師或芳療師工作身分時，再到對應分頁完成授課／服務資格、LINE 與排班。",
      "請本人重新登入正確門市，確認只看得到被授權的入口。"
    ],
    "important": "後台角色、細項權限與教練／教師／芳療師身分是三件事；新增業務身分不會自動給後台全權。",
    "success": "人員能登入正確門市，角色、可見入口與實際工作身分符合安排。",
    "keywords": "新增員工 後台帳號 Staff Manager Owner 門市人員 店長 老闆 教練 教師 芳療師 工作身分 角色 權限",
    "details": [
      "Manager 可管理 Staff／舊帳號，但不能管理自己、Owner、Admin 或其他 Manager，也不能授出自己沒有的權限。",
      "只有 Owner／Admin 可指派 Owner、Manager、Staff；既有 PARTNER 保留原授權，不會自動改角色。",
      "建立或明確勾選套用角色預設時才寫入預設權限；後續角色切換預設保留個別授權，除非勾選取代。",
      "統一工作區只是把後台人員與工作身分放在同一入口，資料、登入與歷史仍分開；新增成功後應留在原視窗核對，不能只憑清單暫時消失判斷失敗。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "staff.manage",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/staff/staff-workspace.tsx",
      "src/app/(dashboard)/dashboard/staff/staff-account-editor.tsx",
      "src/components/admin/staff-role-control.tsx",
      "src/lib/permissions.ts",
      "src/lib/staff-role-policy.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "新增人員時選後台角色並確認個別權限；教練、教師或芳療師的業務身分與排班另行設定，不會因角色自動取得。"
  },
  {
    "id": "G03",
    "category": "staff",
    "title": "員工看不到某個功能，是系統壞了嗎？",
    "summary": "功能是否出現會受角色、個別權限、門市模組與功能開通狀態影響；先依這四層核對。",
    "path": "人員管理／設定",
    "steps": [
      "確認登入者、目前門市與後台角色是 Owner、Manager、Staff 或舊帳號。",
      "到人員管理開啟該人員的「後台帳號／權限」，核對查看／建立／管理／成本等細項權限，以及是否套用角色預設或已自訂；工作身分另到授課設定或 LINE 與權限核對。",
      "再核對門市是否已開通該模組與功能；隱藏、鎖定或未開通時，不會因勾權限就出現。",
      "由有 staff.manage 且階層允許的人員調整；儲存後請當事人重新登入並再次確認。"
    ],
    "important": "權限、功能開通與店舖範圍會一起檢查；Owner 也不能繞過未開通功能或跨店限制。",
    "success": "重新登入後只出現授權且已開通的入口，直接網址與按鈕結果一致。",
    "keywords": "沒有按鈕 權限 看不到 Owner Manager Staff 角色預設 已自訂 功能未開通 隱藏 鎖定 重新登入",
    "details": [
      "Owner 在所屬門市內擁有已開通功能的權限；Manager／Staff 依實際 StaffPermission 判定，不能只看角色名稱。",
      "權限變更會清除快取；角色或帳號狀態變更會撤銷舊登入狀態。若仍看到舊畫面，先重新登入，不要重複儲存。",
      "教練、教師、芳療師或會員連結不等於後台權限；統一工作區也不會把兩種權限合併，需分別核對工作身分與人員帳號。",
      "教師／教練的查看本人薪酬、代學員請假與替學員改期是各自的工作權限；查看本人薪酬還需要門市已開放本人收入及已確認月結。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "staff.view",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/staff/staff-account-editor.tsx",
      "src/components/admin/staff-role-control.tsx",
      "src/lib/permissions.ts",
      "src/lib/staff-role-policy.ts",
      "src/components/sidebar.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "troubleshooting",
    "answer": "先核對目前門市與角色，再查個別權限、模組及功能開通；有選單不表示能執行全部操作。"
  },
  {
    "id": "G04",
    "category": "staff",
    "title": "忘記後台密碼，或人員離職，怎麼處理？",
    "summary": "本人可從所屬門市登入頁申請重設連結；離職則由管理者停用帳號並保留歷史。",
    "path": "後台登入 → 忘記密碼；人員管理 → 人員基本資料",
    "steps": [
      "確認使用所屬門市的後台登入頁，點「忘記密碼」，輸入原本綁定的登入 Email。",
      "從信箱開啟一小時內有效的連結，設定 10 至 128 字元、同時含英文字母與數字的新密碼。",
      "若是離職，由有權限者到人員管理停用帳號；重新查看狀態並保留既有服務、交易及操作紀錄。"
    ],
    "important": "重設連結限所屬門市、有效後台帳號且只能使用一次；更新成功後舊登入狀態會失效。不要刪除歷史來處理離職。",
    "success": "本人能用新密碼登入正確門市；或離職人員已停用且舊紀錄仍可追查。",
    "keywords": "忘記密碼 重設密碼 沒收到信 垃圾郵件 連結過期 新密碼 停用 離職 最後一位 Owner 降級 重新登入",
    "details": [
      "畫面固定顯示已受理，不會透露 Email 是否存在；五分鐘內重複申請不會再寄一封。先檢查垃圾郵件、門市是否正確及是否輸入原綁定信箱。",
      "預覽環境會封鎖外部寄信，不能用預覽沒收到信判定正式站故障。連結失效或用過後請從原門市登入頁重新申請。",
      "只有啟用中的後台人員帳號可自助重設；停用帳號不會因申請重設而重新啟用。",
      "停用、降級或改角色會撤銷舊登入狀態；每店最後一位啟用中的 Owner 不可停用或降級，須先安排另一位 Owner。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "",
    "feature": null,
    "sources": [
      "src/app/hq/login/page.tsx",
      "src/app/hq/forgot-password/page.tsx",
      "src/app/hq/reset-password/page.tsx",
      "src/server/actions/backoffice-password-reset.ts",
      "src/app/(dashboard)/dashboard/staff/staff-workspace.tsx",
      "src/lib/staff-role-policy.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "從正確門市登入頁申請重設；離職帳號則停用，不刪除服務、交易或操作歷史。"
  },
  {
    "id": "H01",
    "category": "analysis",
    "title": "怎麼查看本月或其他期間的營收？",
    "summary": "先選今日、本月或完整自訂期間，再用同一期間核對營收、客流、開卡、來源及回流；長期趨勢固定近六個月。",
    "path": "分析 → 營運分析",
    "steps": [
      "選擇今日、本月；或點自訂，填起始與結束日期後按「查詢」，再核對頁首實際期間。",
      "以相同期間查看營收、完成服務、客流、開卡、來源與回流；查看明細時確認日期條件有一起帶入。",
      "另看退款、待收款、支出與收支結餘；下方長期趨勢固定顯示最近六個月，不跟著自訂期間縮短。"
    ],
    "important": "營業額是退款後、支出前；收支結餘再扣已記錄支出，仍不是含商品成本與應付帳款的會計淨利。",
    "success": "",
    "keywords": "今日 本月 自訂期間 起始日期 結束日期 查詢 較前期 去年同期 月報 營收 客流 開卡 來源 回流 報表 營業額 收支結餘 近六個月",
    "details": [
      "日期範圍包含起始日與結束日；結束日不可早於起始日。若期間涵蓋今天之後，當期只統計到台灣今天，並用相同進度比較前期及去年同期。",
      "營收結構摘要依上方日期篩選；近六個月圖固定從本月往前六個月，本月只統計至今天，不跟著摘要區間縮短。零售依記帳時選擇的分類計算；提款不算支出，待確認收款不算已收營業額。",
      "本頁讀取蒸足資料；課程店會轉到課程分析，不共用此頁統計口徑。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "report.read",
    "feature": "basic_reports",
    "sources": [
      "src/app/(dashboard)/dashboard/reports/page.tsx",
      "src/components/report-date-range.tsx",
      "src/lib/date-utils.ts",
      "src/server/queries/analysis-period.ts"
    ],
    "verification": "source-reviewed",
    "kind": "howto",
    "answer": "先選今日、本月或完整自訂期間，再用同一期間核對營收、客流、開卡、來源及回流；長期趨勢固定近六個月。"
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
      "steamfoot"
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
      "先把門市、完整起訖日期與篩選調成一致；未結束的本月只統計到今天。",
      "確認比較的是預約組數、完成服務人次、不重複顧客、購買方案人數或已收營收。",
      "再找差異顧客，核對取消、未到、多人同行、退款、付款及模組來源。"
    ],
    "important": "不要為了讓報表相同就修改原始交易；先查統計口徑。",
    "success": "",
    "keywords": "對不上 數字 差異 分析 人次 組數 不重複顧客 較前期 去年同期",
    "details": [
      "較前期與去年同期使用同樣的期間進度；下方六個月趨勢是固定長期視角，不能拿單一自訂區間直接逐格相比。",
      "各模組以自己的完成服務及方案紀錄計算；蒸足與課程不混用統計口徑。"
    ],
    "modules": [
      "steamfoot",
      "spa"
    ],
    "permission": "report.read",
    "feature": "basic_reports",
    "sources": [
      "src/app/(dashboard)/dashboard/reports/page.tsx",

      "src/server/queries/analysis-period.ts",

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
    "summary": "母店切換分店是查看模式，亦即母店跨店查看仍是唯讀；HQ 選店則依該店實際開通功能與權限顯示可做的工作，不會借用店員身分。",
    "path": "頂欄門市切換 → 查看分店／HQ 選店",
    "steps": [
      "先核對頂欄目前門市，以及自己是母店跨店查看或 HQ 選店。",
      "母店跨店查看可閱讀授權資料，但新增、編輯、預約、收款、扣次與退款仍由實際店家處理。",
      "HQ 選店後只使用畫面實際顯示且未鎖定的功能；需要員工本人身分的工作（例如個人名下現金簿編輯）仍須由該店人員處理。"
    ],
    "important": "",
    "success": "",
    "keywords": "串接 多店 分店 總部 HQ 查看 唯讀 顧客 實際權限 OWNER 功能隱藏 功能鎖定 HIDDEN LOCKED 不冒用 店員 現金簿 返回總部 無法存取此店舖 返回自己的店舖 重新登入",
    "details": [
      "母店店主也只能查看下層店；母店跨店查看不能新增或編輯顧客，也不提供預約、收款、扣次或退款，不會把本店 OWNER／MANAGER 的寫入權限延伸到其他店。",
      "HQ 選店後，系統保留真實 HQ 操作者與稽核來源，再依該店 OWNER 可用能力、訂閱方案及功能狀態決定畫面；不是切換成該店員工。",
      "HIDDEN 功能完全不顯示，也不掛載資料讀取；LOCKED 功能以未開通／不可用狀態呈現，後端同樣拒絕動作。",
      "HQ 門市視角的讀取、寫入與匯出都限定目前選店；跨店稽核、修復與總部工具要返回 HQ 使用。",
      "需要真實 Staff 身分或個人歸屬的操作不會因 HQ 選店而放寬，例如個人名下現金簿編輯。",
      "若顯示「無法存取此店舖」，先用畫面提供的「返回自己的店舖」、「返回總部」或「重新登入」恢復正確範圍；系統依目前帳號與可用店家顯示合適入口，返回會重新載入共用外框。不要重複切入無權限店家、拼接網址或把拒絕存取當成資料已刪除。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "",
    "feature": "multi_store",
    "sources": [
      "src/components/store-view-mode-switcher.tsx",
      "src/server/actions/store-view-mode.ts",
      "src/lib/hq-store-view.ts",
      "src/lib/hq-store-view-context.ts",
      "src/lib/core-feature-permissions.ts",
      "src/components/dashboard-layout.tsx",
      "src/components/ui/error-state.tsx"
    ],
    "verification": "source-reviewed",
    "kind": "explanation",
    "answer": "母店切換分店是查看模式；HQ 選店則依該店實際功能與權限工作，但不會冒用店員身分。"
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
    "id": "L01",
    "category": "support",
    "title": "找不到按鈕或畫面跟教學不同怎麼辦？",
    "summary": "先核對門市模組、帳號權限與目前紀錄狀態，再比對教學；不同模組不一定有相同按鈕。",
    "path": "操作指南／目前功能頁",
    "steps": [
      "確認使用的是時段（蒸足）、運動教室或音樂教室；兩種教室共用課程引擎，但業務規則分開。",
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
    "id": "H05",
    "category": "analysis",
    "title": "營運資料如何匯出 Excel？",
    "summary": "選擇資料類型、期間與狀態，下載 Excel。",
    "path": "營運 → 報表匯出 → 資料匯出",
    "steps": [
      "切換「報表匯出 → 資料匯出」，選要下載的資料類型。",
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
      "找到正確顧客與方案，在方案摘要點「管理方案」；唯讀畫面則展開「堂數明細」。",
      "逐堂核對「可使用」「已預約」「已使用」「已註銷」與「已使用（補登）」狀態。",
      "有疑問時比對預約日期、來店日期或註銷原因，確認原因後再決定是否更正。"
    ],
    "important": "",
    "success": "",
    "keywords": "每一堂是預約中、已使用還是被註銷，在哪裡查？ 管理方案 方案的「堂數明細」可逐堂查看狀態及日期；紙本補登顯示「已使用（補登）」，不會有對應預約。",
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
    "keywords": "分店選單 母店 下層店 直屬分店 孫店 展店版 多店 唯讀 為什麼沒有店",
    "details": [
      "下層店帳號不能反向查看母店或平行分店；總部母店也不會把寫入權限延伸到下層店。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
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
      "本流程限蒸足；課程方案購買與核帳依課程入口處理。",
      "卡片只列本店上架且開放顧客購買的套票；店家未設定轉帳帳號時不顯示購買按鈕。無公開方案時請聯繫店長。",
      "LINE 通知依店家設定發送。複製資料或開啟 LINE 不等於已把訊息送給店長。",
      "已存在同方案待核帳申請或送出結果不明時，先提供訂單編號請店家查詢，不要直接重做。"
    ],
    "modules": [
      "steamfoot"
    ],
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
    "important": "展店版適用工具與經營功能內含於購買展店版的總部店；進銷存、工單額外加購，不會自動把同樣功能開給所有分店。",
    "success": "",
    "keywords": "分店串接費 展店版 額度 已串接 自動扣款 500 300 分段計算 2980 月繳 年繳 十二個月承諾 十四個月 加購",
    "details": [
      "例：串接 6 間，串接費為 首間免費 ＋ 4 × $500 ＋ 1 × $300 ＝ $2,300／月。採月繳時，總部方案 NT$2,980／月，最低承諾 12 個月（主方案合約總額 NT$35,760），加串接費每月共 NT$5,280；採年繳時，總部主方案 NT$35,760，優惠期間使用 14 個月，平均約 NT$2,554／月，串接費 NT$2,300／月另計。兩種方式皆未包含各分店系統月費。",
      "已開通可串接 10 間、實際只串接 3 間時，串接費按 3 間計算，首間免費，其餘 2 間各 $500，即 $1,000／月；本頁試算不是自動扣款。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
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
    "modules": [
      "steamfoot",
      "spa"
    ],
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
    "modules": [
      "steamfoot"
    ],
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
    "modules": [
      "steamfoot",
      "course"
    ],
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
      "零售收入與其他收入由記帳時所選類別決定；選擇顧客只會關聯消費紀錄。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "cashbook.create",
    "additionalPermissions": [
      "customer.read"
    ],
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
    "modules": [
      "steamfoot"
    ],
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
    "title": "裝置預覽與前台唯讀預覽有何不同？",
    "summary": "上方預覽工具可用手機、平板與桌機尺寸檢查後台；前台唯讀預覽則查會員與工作畫面。",
    "answer": "裝置框內後台操作仍可能生效；只有前台預覽內容受到唯讀保護，尺寸不代表資料隔離。",
    "path": "後台上方工具 → 預覽",
    "steps": [
      "從上方「預覽」開啟選單，核對目前門市與頁面。",
      "選手機 390×844、平板 1024×768 或桌機 1440×900，依實際工作畫面核對各尺寸。",
      "換尺寸後核對內容沒有整頁水平溢出、主操作可到達且草稿仍保留；要查會員／工作畫面再選前台唯讀預覽。"
    ],
    "important": "裝置預覽使用目前門市資料，操作仍可能生效；它不是靜態圖片或隔離資料庫。",
    "success": "預覽維持正確頁面與草稿，三種裝置尺寸可切換，且操作指南仍只有上方唯一入口。",
    "keywords": "上方預覽 裝置預覽 前台唯讀預覽 平板 1024 768 手機 桌機 390 844 1440 900 iPad RWD 載入較慢 仍在讀取 返回歷史 同店家",
    "details": [
      "預覽是瀏覽器內尺寸模擬，不等於真實 iPad、Safari 或觸控驗收。",
      "前台預覽另需 frontend_preview 授權，裝置預覽不能繞過。",
      "桌機後台可使用側欄以外的可用寬度；個別表單仍可保留閱讀寬度，不能只憑左右留白判定故障。",
      "裝置預覽內仍是真實後台，操作可能生效；尺寸模擬不替代 LINE 登入或業務驗收。",
      "已啟用新版運動的裝置預覽，超過 20 秒提示「載入較慢，仍在讀取…」，不單憑等待判定失敗；真正失敗依畫面重試。登入失效需重新登入，不把 Vercel 登入頁當成蒸管家。",
      "新版運動預覽內同店頁面導覽會同步上方頁面選擇；換尺寸不應另載入整份文件，瀏覽器返回還原目標頁。仍需核對門市、權限及草稿；音樂／蒸足沿用原預覽行為。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "booking.read",
    "feature": null,
    "sources": [
      "src/app/(dashboard)/dashboard/device-preview/page.tsx",
      "src/components/device-preview/device-preview.tsx",
      "src/lib/device-preview.ts",
      "src/components/desktop/page-shell.tsx",
      "src/app/globals.css"
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
    "modules": [
      "steamfoot"
    ],
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

    ]
  },

  ...retiredSpaCatalogGuides.filter(old=>old.id!=="J14"),
];
