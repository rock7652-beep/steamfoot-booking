import type { OperationGuide } from "./operation-guide-types";

/** Conditional backend workflows at main 4f52264f; rollout and interaction acceptance are separate. */
export const dailyOperationGuides20261019: OperationGuide[] = [
  {
    id: "C171", category: "settings", title: "為什麼我的運動課表還是舊版，或新版無法載入？",
    summary: "新版運動工作區須逐店啟用及權限／資料庫就緒；程式合併不代表所有門市已開放。",
    answer: "先核對門市與本店操作範圍，再請管理者確認新版啟用及必要權限，不自行改資料或重建店家。",
    path: "運動店後台 → 課表排程",
    keywords: "新版運動 舊版課表 工作區 未開放 必要權限 資料量超過 500 唯讀子店 逐店啟用",
    steps: ["確認目前門市是已獲准啟用的運動店，再查看是否有「課表／教學項目／收費方式」三個分頁。", "仍見原課表時，先核對本店操作範圍及實際權限；Owner 查看子店、權限較少的員工可能正常保留原課表，不是資料遺失。", "若出現無法載入、未開放或資料量超過範圍，保留錯誤與門市交由管理者查就緒狀態，不反覆建店、刪顧客或調整歷史交易。"],
    important: "本題僅適用已完成啟用的新版運動店或獲准的隔離測試站；不代表正式站已上線，不要求店長修改環境旗標、資料庫權限或執行 migration。",
    details: ["新版入口需預約查看、方案編輯、顧客查看、方案查看及營運查看等權限，寫入仍逐項授權；能讀課表不表示能改收費、收款或退款。", "目前課次、出租、顧客任一清單超過 500 筆會明確拒絕載入，不是只顯示前 500 筆或要求刪資料。", "管理者關閉新版可回原介面，但已存在的指定學員／收費限制及帳本不會因此消失；不得為切換介面手動還點或刪表。", "新版在安全閱讀時約每 15 秒及取得焦點重讀，編輯／提交中暫停；不是即時推播。舊課表仍依原 60 秒節奏。"],
    success: "能辨識新版啟用、權限、子店唯讀與資料就緒問題，不把原介面或拒絕載入當成空資料。",
    modules: ["course"], permission: "booking.read", additionalPermissions: ["plans.edit", "customer.read", "wallet.read", "transaction.read"], feature: null, kind: "troubleshooting", verification: "source-reviewed",
    sources: ["src/app/(dashboard)/dashboard/courses/page.tsx", "src/lib/sports-staging.ts", "src/server/actions/sports-staging.ts", "src/server/services/sports-production-readiness.ts", "scripts/sports-production-scope.mjs"],
  },
  {
    id: "C172", category: "plans", title: "新版運動的教學項目與收費方式怎麼建立？",
    summary: "教學項目只管運動名稱與分類；價格、額度、效期及適用教練放在收費方式。",
    answer: "限已啟用新版工作區，依「教學項目→收費方式→排課」建立，不把改價當成回算舊卡。",
    path: "新版運動工作區 → 教學項目／收費方式",
    keywords: "新版運動 教學項目 收費方式 運動名稱 點數 堂數 每堂扣抵 可授課教練 共用額度 舊卡快照",
    steps: ["在教學項目點「新增教學項目」，填運動名稱、分類與上架／下架狀態，儲存後核對。", "在收費方式點「新增收費方式」，選已上架運動，填收費名稱、點數／堂數、總額度、售價與有效天數。", "點數方案另填每堂扣抵；勾選至少一位本課程可授課教練，依授權及方案限制決定是否允許共用額度。", "看到「收費方式已儲存」後核對原列；需售出方案時另依 C112 結帳，不把建立收費設定當成已收款。"],
    important: "本題只教已啟用的新工作區。新增／更改收費須方案編輯、預約建立及人員管理權限；選教練不會授予其後台帳號權限。",
    details: ["堂數每堂扣 1 堂；點數依適用課程扣抵，總額度與每堂扣抵是不同欄位。", "一個運動可有多種收費方式。更改價格、額度或教練設定不回算已售卡片、原購買價格、期限與歷史課次。", "共用額度仍受總部共卡開通、卡片授權與有效期限制，不因勾選就能跨店或任意代約。", "提示資料已更新時保留輸入並重開核對，不覆蓋別人的新版設定；顯示儲存成功但畫面同步失敗時，按更新查現況，不重複建立。"],
    success: "教學項目與收費方式對應正確，單位、金額、每堂扣抵、效期及教練清楚，舊卡資料未被重建。",
    modules: ["course"], permission: "plans.edit", additionalPermissions: ["booking.read", "booking.create", "staff.manage", "customer.read", "wallet.read", "transaction.read"], feature: null, kind: "howto", verification: "source-reviewed",
    sources: ["src/components/admin/sports-staging-workspace.tsx", "src/server/actions/sports-staging.ts", "src/server/actions/course-members.ts", "src/server/services/sports-staging-fee.ts"],
  },
  {
    id: "C173", category: "booking", title: "新版運動如何排固定課、指定學員或開放選課？",
    summary: "先選排課類型，再分開決定指定學員或開放選課；體驗與空間出租是不同流程。",
    answer: "限已啟用新版工作區。固定頻率與參加方式是兩個選擇，指定學員會整批預約保留額度，開放選課不自動加人。",
    path: "新版運動工作區 → 課表 → 新增排課",
    keywords: "新版運動 每週固定 隔週固定 單次 體驗 空間出租 指定學員 開放選課 批次保留 排課重送",
    steps: ["點新增排課，選每週固定、隔週固定、單次、體驗或空間出租；教學課次核對教學項目及適用收費方式。", "教學課次選「指定學員」或「開放選課」，再核對首次日期、時間、時長、教練、空間與人數上限；固定課另填本次堂數。", "指定學員逐位核對適用方案、可用額度及本次保留；開放選課只開名額，不會自動加入固定學員。體驗核對體驗價格，不扣一般方案；出租另填租借姓名、電話及金額。", "展開「查看排課日期」核對整批日期後送出一次，依「已建立並完成指定學員預約／已開放選課／空間租借已建立」核對結果；同步失敗先按更新查原資料。"],
    important: "本題僅適用已啟用新版。指定學員不是出席點名；額度不足、期限、容量、教練或教室撞期時整批拒絕，不為補課次重建重複預約。",
    details: ["每週／隔週固定依 7／14 天排列；單次及體驗只建立一堂，不套用連續週數。出租不建立教學名單，也不因填金額就等於已收款。", "指定學員卡片須適用整批課次、期限及額度；預約先保留，出席才依原規則扣抵。共卡亦需足夠的共同可用額度。", "同一排課請求重送會核對原收據及原意圖，不重新配卡或建立課次；更改學員、方案或人數後不能冒用原請求。看到 HTTP 200 或同步中不等於已建立，須核對業務成功及原課次。", "移動固定課僅改本堂，其他課次不動；原位置淡化可排單次，不可建立重複固定系列。取消學員與取消本堂分開，款項、出席及返還另按原紀錄核對。"],
    success: "課次、參加方式、名單與保留額度可對應，沒有部分建立、重複排課或把出租／體驗混成一般方案扣抵。",
    modules: ["course"], permission: "booking.create", additionalPermissions: ["booking.read", "plans.edit", "customer.read", "wallet.read", "transaction.read"], feature: null, kind: "howto", verification: "source-reviewed",
    sources: ["src/components/admin/sports-staging-workspace.tsx", "src/server/actions/sports-staging.ts", "src/server/actions/course.ts", "src/server/services/sports-staging-schedule.ts", "src/server/services/course-booking.ts"],
  },
];
