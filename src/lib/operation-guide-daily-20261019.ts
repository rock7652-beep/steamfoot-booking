import type { OperationGuide } from "./operation-guide-types";

/** Scoped alignment at production 8d717d5d; rollout and interaction acceptance are separate. */
export const dailyOperationGuides20261019: OperationGuide[] = [
  {
    id: "C171", category: "settings", title: "為什麼我的運動課表還是舊版，或新版無法載入？",
    summary: "新版運動工作區須逐店啟用及權限／資料庫就緒；程式合併不代表所有門市已開放。",
    answer: "先核對門市與本店操作範圍，再請管理者確認新版啟用及必要權限，不自行改資料或重建店家。",
    path: "運動店後台 → 課表排程",
    keywords: "新版運動 舊版課表 工作區 未開放 必要權限 資料量超過 500 唯讀子店 逐店啟用",
    steps: ["確認目前門市與本店操作範圍；已啟用新版運動仍沿用原課表的月／週／日視圖，不以獨立工作區或三個分頁判斷是否啟用。", "Owner 查看子店或明確唯讀模式可讀原課表，但不載入可寫表單或自動展課；權限較少的員工也可能保留原課表，不是資料遺失。", "若出現無法載入、未開放或資料量超過範圍，保留錯誤與門市交由管理者查就緒狀態，不反覆建店、刪顧客或調整歷史交易。"],
    important: "本題僅適用已完成啟用的新版運動店或獲准的隔離測試站；不代表正式站已上線，不要求店長修改環境旗標、資料庫權限或執行 migration。",
    details: ["新版入口需預約查看、方案編輯、顧客查看、方案查看及營運查看等權限，寫入仍逐項授權；能讀課表不表示能改收費、收款或退款。", "目前課次、出租、顧客任一清單超過 500 筆會明確拒絕載入，不是只顯示前 500 筆或要求刪資料。", "已有永久系列後，不可直接關總旗標、移除店家白名單或退回不懂永久系列的舊程式。需由管理者依發布程序先停止新增、處理未來系列並對帳，保留歷史、出席更正與補課；店長不要自行改旗標、手動還點或刪表。", "新版原課表與名單在安全閱讀時，前次讀取完成後約 3 秒安排下次更新；隱藏分頁、編輯、提交或結果未明時暫停，失敗會延長重試間隔。不是即時推播或更新時限保證；舊課表仍依原 60 秒節奏。", "舊固定系列若名單超額，課表仍可讀並顯示提示；異常系列暫不展課，同店正常系列繼續展課。保留提示與日期交由管理者核對容量及名單，不截斷名單或重建歷史。"],
    success: "能辨識新版啟用、權限、子店唯讀與資料就緒問題，不把原介面或拒絕載入當成空資料。",
    modules: ["course"], permission: "booking.read", additionalPermissions: ["plans.edit", "customer.read", "wallet.read", "transaction.read"], feature: null, kind: "troubleshooting", verification: "source-reviewed",
    sources: ["src/app/(dashboard)/dashboard/courses/page.tsx", "src/lib/sports-staging.ts", "src/lib/sports-background-sync.ts", "src/server/actions/sports-staging.ts", "src/server/services/sports-production-readiness.ts", "src/server/services/sports-permanent-series.ts", "src/lib/sports-series-storage.ts", "scripts/sports-production-scope.mjs"],
  },
  {
    id: "C172", category: "plans", title: "新版運動的教學項目與收費方式怎麼建立？",
    summary: "教學項目只管運動名稱與分類；價格、額度、效期及適用教練放在收費方式。",
    answer: "限已啟用新版運動，先完成教學項目與教練基本資料，再建立收費方式及授課資格，最後排課；不把改價當成回算舊卡。",
    path: "新版運動工作區 → 教學項目／收費方式",
    keywords: "新版運動 教學項目 收費方式 運動名稱 點數 堂數 每堂扣抵 可授課教練 共用額度 舊卡快照",
    steps: ["先完成營業時間、空間與教學項目，再新增至少一位啟用教練的基本資料；新店引導的第四步是教練，不是先建立收費。", "在收費方式點「新增收費方式」，選已上架運動，填收費名稱、點數／堂數、總額度、售價與有效天數。", "點數方案另填每堂扣抵；選擇教練並完成對應教學項目的授課資格，依授權及方案限制決定是否允許共用額度。已有收費缺資格時補齊原設定，不另建重複收費。", "看到「收費方式已儲存」後核對原列；第五步須有效收費及對應授課資格才算完成，再排第一堂課。需售出方案時另依 C112 結帳，不把建立收費設定當成已收款。"],
    important: "本題只教已啟用的新工作區。新增／更改收費須方案編輯、預約建立及人員管理權限；選教練不會授予其後台帳號權限。",
    details: ["堂數每堂扣 1 堂；點數依適用課程扣抵，總額度與每堂扣抵是不同欄位。", "一個運動可有多種收費方式。更改價格、額度或教練設定不回算已售卡片、原購買價格、期限與歷史課次。", "共用額度仍受總部共卡開通、卡片授權與有效期限制，不因勾選就能跨店或任意代約。", "提示資料已更新時保留輸入並重開核對，不覆蓋別人的新版設定；顯示儲存成功但畫面同步失敗時，按更新查現況，不重複建立。"],
    success: "教學項目與收費方式對應正確，單位、金額、每堂扣抵、效期及教練清楚，舊卡資料未被重建。",
    modules: ["course"], permission: "plans.edit", additionalPermissions: ["booking.read", "booking.create", "staff.manage", "customer.read", "wallet.read", "transaction.read"], feature: null, kind: "howto", verification: "source-reviewed",
    sources: ["src/app/(dashboard)/dashboard/courses/member-workspace.tsx", "src/server/queries/course-setup.ts", "src/lib/course-setup-progress.ts", "src/server/actions/sports-staging.ts", "src/server/actions/course-members.ts", "src/server/services/sports-staging-fee.ts"],
  },
  {
    id: "C173", category: "booking", title: "新版運動如何排固定課、指定學員或開放選課？",
    summary: "先選排課類型，再分開決定指定學員或開放選課；體驗與空間出租是不同流程。",
    answer: "限已啟用新版運動。每週／隔週固定建立永久系列；指定學員先保留位置，不保留或預扣課卡額度，出席時核對有效方案。開放選課不自動加人。",
    path: "新版運動工作區 → 課表 → 新增排課",
    keywords: "新版運動 每週固定 隔週固定 永久系列 單次 體驗 空間出租 指定學員 開放選課 不預扣 停課 訂閱停用 容量提示 候補未啟用 排課重送",
    steps: ["在原課表開啟新增排課，選每週固定、隔週固定、單次、體驗或空間出租；教學課次核對教學項目及收費方式。", "教學課次選「指定學員」或「開放選課」，核對首次日期、時間、時長、教練與空間；固定課不用填本次堂數，指定學員逐位核對，開放選課另填人數上限。", "永久固定課可先指定學員，不保留或預扣額度；出席時另核對有效且適用的已付款方案。單次指定學員仍沿用課卡預約規則；開放選課只開名額，不會自動加入固定學員。", "核對畫面後送出一次；成功後在原課表確認課卡、日期與名單，同步失敗先按更新查原資料，不重建系列。"],
    important: "本題僅適用已啟用新版。指定位置不是出席或已付款；固定系列與單次課卡預約的額度時機不同。容量或撞期不符時拒絕本次建立，不為補課次重建重複預約。",
    details: ["每週／隔週固定依 7／14 天延續，後續月份按系列展課，不由四堂／八堂收費限制系列長度。單次及體驗只建立一堂；出租使用租借顧客與金額，不建立教學名單，填金額也不等於已收款。", "永久指定學員的位置與課卡分開；點名出席時才核對方案、效期、適用課程及可用額度。單次課沿用原課卡預約與保留規則，不把永久系列的不預留套用到所有預約。", "開放選課的候補未啟用時，候補人數顯示 0 及「候補未啟用」，不可編輯；啟用時沿用店家預設，不必為排第一堂課開啟全店候補。", "同一排課請求重送會核對原收據及原意圖，不重新建立課次；更改學員、方案或人數後不能冒用原請求。HTTP 200 或同步中不等於已建立，須核對業務成功及原課次。", "移動固定課僅改本堂，其他課次不動；原位置淡化可排單次，不可建立重複固定系列。取消當次學員、請假／未到釋放當次位置、本堂停課及本堂及後續停課是不同範圍，確認前核對日期與影響名單；款項、出席及返還另按原紀錄核對。", "訂閱取消或到期停用後，不再自動產生後續固定課，歷史課表仍可讀；恢復有效訂閱後依原系列展課，不需重建。唯讀子店不自動展課。", "固定系列建立及展課都檢查當日有效名單與容量。舊系列超額時顯示提示、該異常系列不新增課次，同店正常系列仍繼續展課；不截斷名單或吞掉其他權限、撞課及資料庫錯誤。交管理者核對，不手動改歷史或補點。"],
    success: "課次、系列與指定位置正確；永久指定學員未被預扣或預留課卡額度，出席另按有效方案核對，沒有重複系列或把出租／體驗混成一般方案扣抵。",
    modules: ["course"], permission: "booking.create", additionalPermissions: ["booking.read", "plans.edit", "customer.read", "wallet.read", "transaction.read"], feature: null, kind: "howto", verification: "source-reviewed",
    sources: ["src/app/(dashboard)/dashboard/courses/sports-schedule-fields.tsx", "src/server/actions/sports-staging.ts", "src/server/actions/course.ts", "src/server/services/sports-staging-schedule.ts", "src/server/services/sports-permanent-series.ts", "src/server/services/course-booking.ts"],
  },
];
