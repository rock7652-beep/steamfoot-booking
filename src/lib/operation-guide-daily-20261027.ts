import type { OperationGuide } from './operation-guide-types';

export const dailyOperationGuides20261027: OperationGuide[] = [
  {
    id: 'BEAUTY07', category: 'money', title: '美業單次或體驗消費如何購買與收款？',
    summary: '先查這位顧客的既有服務；已有預約直接收款，沒有才新增服務，不會發多次方案卡。',
    answer: '在購買視窗切換消費類型，選單次／體驗服務；建立服務與收款是兩次獨立確認。',
    path: '顧客管理 → 顧客概況 → 購買方案 → 消費類型',
    keywords: "美業 單次 體驗 消費類型 既有服務 收款 新增單次 體驗服務 返回多次方案 重複預約 購買中斷 重新核對 原請求 安全取消 不重複收款",
    steps: ['核對顧客與門市，切換單次／體驗，先查看既有待收款服務；較舊服務可按下一頁查找。', '已有服務按該列收款，核對原預約時間及未收金額；沒有適用服務才按新增單次／體驗服務，安排時間、技師與位置。', '新服務成功後在收款小視窗核對應收與付款；收款結果另外確認，關閉後返回原清單。'],
    important: '單次不發預付額度、不建立隱藏方案；預約成功不等於已收款。缺少收款資料時先核對既有服務，不重新建立預約。',
    success: '同一服務沒有重複建立，原顧客、預約與收款紀錄能對應；免費或已無待收款時依畫面完成。',
    details: [
  "切換班表日期後開啟原預約收款，收款視窗應保留並顯示正確服務；已成功收款但班表更新失敗時只重讀原交易，不重收。",
  "購買、收款或核帳遇連線中斷，先處理原請求接續視窗；查無紀錄不代表失敗，不換付款方式或重建購買。狀態未明先「重新核對」，已完成先確認原結果；安全取消只取消尚未成立的原請求，不是退款。詳見 FIN02。",
  "查詢失敗或門市／顧客變更時先重新讀取，不在舊畫面建立或收款。",
  "體驗依已設定體驗價與時長，整理時間沿用服務設定；仍檢查體驗資格、技師位置衝突、權限及現金抽屜。",
  "全額折抵的確認方式見 BEAUTY02；不要只為讓畫面顯示付款而重收一筆。音樂及運動不提供此美業消費類型入口。"
],
    modules: ['beauty'], permission: 'transaction.create', additionalPermissions: ['booking.read', 'customer.read'], feature: null, kind: 'howto', verification: 'source-reviewed',
    sources: ['src/components/beauty/single-purchase.tsx', 'src/components/beauty/native-customer-source.tsx', 'src/app/(dashboard)/dashboard/courses/member-workspace.tsx', 'src/lib/beauty/customer-reader.ts', 'src/components/beauty/collection-panel.tsx'],
  },
  {
    id: 'BEAUTY08', category: 'money', title: '美業收入分類與月結的技師費如何分開核對？',
    summary: '店家、店長、未歸屬及待核對合計對上淨收款；技師費移到月結管理，另按已完成服務的日期查看。',
    answer: '在營運切到收入分類，選台灣日期期間，分開核對收款分配；技師服務費到月結管理查看，不能把兩者相加當營收。',
    path: '營運 → 收入分類；營運 → 月結管理',
    keywords: '美業 收入分類 淨收款 店家 所屬店長 未歸屬 待核對 技師服務費 累計已付 尚未支付 超付 入帳日 服務日',
    steps: ['開啟收入分類，核對店名與起訖日期；期間最多一年。', '核對店家、所屬店長、未歸屬與待核對是否對上淨收款，查看下方分組表格與差額欄；核帳人員不是業績歸屬。', '切到月結管理，有技師費權限時另外核對服務費、累計已付、尚未支付與超付待核對；需要更正時先查原收退款或服務，不改現行費用倒推歷史。'],
    important: '收款按 SALE／REFUND 入帳日，技師應付按已完成服務的服務日；技師費是另列成本，不代表已付款，也不推定由店家或店長負擔。',
    success: '分組與淨收款能對應，差額及未知資料有保留，未把同名不同人或超付互相抵銷。',
    details: [
  "目前月結的原生技師拆帳區按月份提供明細與確認版本；已付／待付供歷史核對，本入口沒有新增付款或付款收回，不把確認月結當成付款。",
  "分期收款與跨月退款使用原收款分配快照；缺少歷史費用列待核對，不用目前收費補算。報表涵蓋整段期間，不只目前交易清單頁。",
  "需要報表查看、交易查看及相關功能開通；技師費另需 teacher.compensation.read、teacher.settlement.read 與服務費功能。看不到技師區不等於零元。",
  "累計已付包含這批服務的付款沖回，逐筆保留尚未支付與超付，不拿某筆超付抵另一筆未付。"
],
    modules: ['beauty'], permission: 'report.read', additionalPermissions: ['transaction.read'], feature: null, kind: 'howto', verification: 'source-reviewed',
    sources: ['src/components/beauty/native-operations-source.tsx', 'src/components/beauty/revenue-breakdown-view.tsx', 'src/components/beauty/operations-monthly.tsx', 'src/components/beauty/native-fee-source.tsx', 'src/server/beauty/revenue-breakdown.ts', 'src/lib/beauty/revenue-breakdown.ts'],
  },
  {
    id: 'BEAUTY09', category: 'care', title: '技師明日班表與預約異動通知如何設定？',
    summary: '明日班表與異動通知分開開啟，先核對技師的工作會員連結；儲存設定不代表訊息已送達。',
    answer: "在工作人員通知分別核對技師明日班表與預約異動；各列可展開預覽，預覽不發送。",
    path: "設定 → 提醒管理 → 工作人員通知；發送紀錄",
    keywords: "美業 技師通知 獨立分頁 原設定視窗 不跳頁 技師明日班表 技師預約異動 21:00 18:00 工作會員 尚未連結 改派 略過原因 發送紀錄 系統暫停 全站停送 推播 回覆 delivery_paused 核准恢復時間 舊事件不補發",
    steps: ['核對技師列的工作會員連結狀態；尚未連結時先到技師管理確認本人，不以姓名或電話猜配。', '分別設定技師明日班表及技師預約異動，等待儲存成功；唯讀模式不能改。', '在發送紀錄分辨顧客與技師通知，核對收件人、狀態及略過原因；不要為測試建立真實預約或啟動群發。'],
    important: '技師摘要是前一天台灣時間 21:00、僅本人有服務才發；顧客明日提醒為 18:00。異動另依事件處理，不等摘要時間。',
    success: '兩項設定與工作會員狀態清楚可核對，發送紀錄能區分送出、失敗及略過，未把已連結當成已送達。',
    details: [
  "LINE 外發改依核准切換時間控管：時間未設定、格式無效或尚未到時仍停送；已恢復也只送符合時間及偏好的新事件，不補送舊佇列。LINE 入站身分處理另行核對，不能因沒有回覆就重複綁定；見 F14。",
  "美業提醒管理依顧客通知、店長通知、工作人員通知分頁；發送紀錄另有入口。技師設定在工作人員通知，不在顧客通知。從設定面板切分頁仍留在原視窗，關閉後返回原設定位置。切換或重開只核對狀態，不自動啟用通知。",
  "仍需店家服務通知、LINE 功能、有效工作身分與可驗證的本人 LINE；需保持本店官方 LINE 好友且未封鎖。預覽外部通知封鎖時不實際發送。",
  "新增、改期、取消或恢復通知相關技師；改派時核對原技師與新技師。關閉後略過未送事件，不回補歷史異動；綁定或班表變更後不重送舊內容。",
  "設定需 business_hours.manage 與本店 LINE 提醒功能；工作會員連結不授予後台權限。此題只教後台設定，不提供技師前台操作指南。"
],
    modules: ['beauty'], permission: 'business_hours.manage', feature: 'line_reminder', kind: 'howto', verification: 'source-reviewed',
    sources: [
  "src/app/(dashboard)/dashboard/beauty/reminders/page.tsx",
  "src/components/beauty/technician-notification-settings.tsx",
  "src/server/actions/beauty-technician-notifications.ts",
  "src/server/beauty/technician-notifications.ts",
  "src/server/beauty/technician-notification-outbox.ts",
  "src/lib/line-delivery-pause.ts",
  "src/lib/line.ts"
],
  },
];
